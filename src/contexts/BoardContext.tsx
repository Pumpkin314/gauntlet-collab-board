/**
 * BoardContext
 *
 * Provides real-time collaborative board state backed by Yjs CRDTs.
 * - y-webrtc handles P2P real-time sync (sub-10ms latency when connected)
 * - Yjs Awareness (over WebRTC) handles cursor/presence when peers are connected
 * - Firestore presence is the fallback for cursor/user-online visibility
 * - Firestore persists durable Yjs snapshots as backup (~500ms debounce)
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode, MutableRefObject, Dispatch, SetStateAction } from 'react';
import * as Y from 'yjs';
import type { WebrtcProvider } from 'y-webrtc';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { FirestoreYjsProvider } from './firestoreYjsProvider';
import { createWebrtcProvider } from './webrtcProvider';
import { touchBoardTimestamp } from '../services/boardService';
import type { BoardObject, PresenceUser, ShapeType } from '../types/board';
import { setCursorPosition, removeCursor } from '../utils/cursorStore';
import { useDebug } from './DebugContext';
import type { DebugInfo } from './DebugContext';

// ── helpers ────────────────────────────────────────────────────────────────

function getUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B195', '#C06C84', '#6C5B7B', '#355C7D',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Shape of a validated Yjs awareness entry. */
interface AwarenessState {
  sessionId: string;
  userId: string;
  userName: string;
  userColor: string;
  cursorX: number;
  cursorY: number;
  /** Unix ms timestamp set by the sender — used to compute one-way sync latency. */
  ts?: number;
}

function coerceAwarenessState(s: unknown, clientId: number): AwarenessState | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const userId = typeof o['userId'] === 'string' ? o['userId'] : `client-${clientId}`;
  const sessionId = typeof o['sessionId'] === 'string' ? o['sessionId'] : `${userId}:${clientId}`;
  return {
    sessionId,
    userId,
    userName: typeof o['userName'] === 'string' ? o['userName'] : 'Anonymous',
    userColor: typeof o['userColor'] === 'string' ? o['userColor'] : getUserColor(userId),
    cursorX: typeof o['cursorX'] === 'number' ? o['cursorX'] : 0,
    cursorY: typeof o['cursorY'] === 'number' ? o['cursorY'] : 0,
    ts: typeof o['ts'] === 'number' ? o['ts'] : undefined,
  };
}

/** Shape of a Firestore presence document. */
interface PresenceDoc {
  userId:     string;
  userName:   string;
  userColor:  string;
  cursorX:    number;
  cursorY:    number;
  lastActive: Timestamp | null;
}

/** Max age (ms) before a P2P presence entry is considered stale and ignored. */
const PRESENCE_STALE_MS = 2000;

const SHAPE_DEFAULTS: Record<ShapeType, Partial<BoardObject>> = {
  sticky:    { width: 200, height: 200, color: '#FFE66D', content: 'Double-click to edit' },
  rect:      { width: 160, height: 100, color: '#85C1E2' },
  circle:    { width: 120, height: 120, color: '#AA96DA' },
  text:      { width: 200, height:  60, color: '#333333', content: 'Text' },
  line:      { width: 200, height:   0, color: '#333333', strokeWidth: 2 },
  connector: { width:   0, height:   0, color: '#666666', strokeWidth: 2 },
  frame:     { width: 400, height: 300, color: '#f0f0f0', content: 'Frame' },
  'kg-node': { width: 220, height: 80, color: '#BDBDBD' },
};

// DebugInfo type and EMPTY_DEBUG are now in DebugContext.tsx

/** Walk parentId chain to compute nesting depth (0 = top-level frame). */
function getFrameDepth(obj: BoardObject, cache: Map<string, BoardObject>): number {
  let depth = 0;
  let current = obj;
  const seen = new Set<string>();
  while (current.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = cache.get(current.parentId);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

// ── diff-based Yjs → React sync ───────────────────────────────────────────

/**
 * Creates a diff-based sync callback for observeDeep.
 * Maintains a Map cache of BoardObjects keyed by ID. On each Yjs event:
 * - Detects added/changed/deleted entries
 * - Produces new object references ONLY for changed entries
 * - Re-sorts only when structure changes (add/delete/zIndex change)
 * This lets React.memo skip unchanged shapes.
 */
function makeDiffSync(
  yObjects: Y.Map<Y.Map<unknown>>,
  cacheRef: MutableRefObject<Map<string, BoardObject>>,
  sortedRef: MutableRefObject<BoardObject[]>,
  setObjects: Dispatch<SetStateAction<BoardObject[]>>,
) {
  return () => {
    const cache = cacheRef.current;
    const currentIds = new Set<string>();
    let structuralChange = false;

    yObjects.forEach((yObj, id) => {
      currentIds.add(id);
      const newObj = Object.fromEntries(yObj.entries()) as unknown as BoardObject;
      const cached = cache.get(id);

      if (!cached) {
        // New entry
        cache.set(id, newObj);
        structuralChange = true;
      } else {
        // Check if anything changed
        let changed = false;
        let zIndexChanged = false;

        for (const key of Object.keys(newObj) as (keyof BoardObject)[]) {
          if (cached[key] !== newObj[key]) {
            changed = true;
            if (key === 'zIndex') zIndexChanged = true;
          }
        }
        // Also check if cached has keys that newObj doesn't
        for (const key of Object.keys(cached) as (keyof BoardObject)[]) {
          if (!(key in newObj)) {
            changed = true;
          }
        }

        if (changed) {
          cache.set(id, newObj);
          if (zIndexChanged) structuralChange = true;
        }
      }
    });

    // Detect deletions
    for (const id of cache.keys()) {
      if (!currentIds.has(id)) {
        cache.delete(id);
        structuralChange = true;
      }
    }

    if (structuralChange) {
      // Full re-sort needed
      const arr = [...cache.values()];
      arr.sort((a, b) => {
        const aIsFrame = a.type === 'frame';
        const bIsFrame = b.type === 'frame';
        if (aIsFrame !== bIsFrame) return aIsFrame ? -1 : 1;
        if (aIsFrame && bIsFrame) {
          const aDepth = getFrameDepth(a, cache);
          const bDepth = getFrameDepth(b, cache);
          if (aDepth !== bDepth) return aDepth - bDepth;
        }
        return (a.zIndex ?? 0) - (b.zIndex ?? 0);
      });
      sortedRef.current = arr;
      setObjects(arr);
    } else {
      // Property-only changes: rebuild array preserving sort order,
      // swapping in new references only for changed entries
      const prev = sortedRef.current;
      const next = prev.map((obj) => cache.get(obj.id) ?? obj);
      sortedRef.current = next;
      setObjects(next);
    }
  };
}

// ── context types ──────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'editor' | 'viewer';

interface BoardDataValue {
  objects: BoardObject[];
  presence: PresenceUser[];
  loading: boolean;
  userRole: UserRole;
}

interface BoardActionsValue {
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
  updateObject(id: string, updates: Partial<BoardObject>): void;
  deleteObject(id: string): void;
  deleteAllObjects(): void;
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
  batchUpdate(updates: Array<{ id: string; changes: Partial<BoardObject> }>): void;
  batchDelete(ids: string[]): void;
  updateCursorPosition(x: number, y: number): void;
  getObjectById(id: string): BoardObject | undefined;
  getObjectsByType(type: ShapeType): BoardObject[];
  getAllObjects(): BoardObject[];
}

type BoardContextValue = BoardDataValue & BoardActionsValue;

// ── contexts + hooks ──────────────────────────────────────────────────────

const BoardDataContext    = createContext<BoardDataValue | null>(null);
const BoardActionsContext = createContext<BoardActionsValue | null>(null);

/** Actions-only hook — stable references, never triggers re-render on data changes. */
export function useBoardActions(): BoardActionsValue {
  const ctx = useContext(BoardActionsContext);
  if (!ctx) throw new Error('useBoardActions must be used within BoardProvider');
  return ctx;
}

/** Combined hook for backward compatibility. Prefer useBoardActions() when you only need actions. */
export function useBoard(): BoardContextValue {
  const data = useContext(BoardDataContext);
  const actions = useContext(BoardActionsContext);
  if (!data || !actions) throw new Error('useBoard must be used within BoardProvider');
  return { ...data, ...actions };
}

// ── provider ───────────────────────────────────────────────────────────────

export function BoardProvider({ boardId, userRole = 'owner', children }: { boardId: string; userRole?: UserRole; children: ReactNode }) {
  const { currentUser } = useAuth();

  const {
    updateDebug, debugInfoRef, setYjsLatencyMs, setYjsReceiveGapMs,
    setYjsLatestSampleMs, setYjsReceiveRate, setYjsSendRate, setP2pOnly,
    localCursorRef,
  } = useDebug();

  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);

  const objectsCacheRef = useRef<Map<string, BoardObject>>(new Map());
  const sortedArrayRef = useRef<BoardObject[]>([]);

  const ydocRef     = useRef<Y.Doc | null>(null);
  const yObjectsRef = useRef<Y.Map<Y.Map<unknown>> | null>(null);
  const yPresenceRef = useRef<Y.Map<Y.Map<unknown>> | null>(null);
  const yPresenceKeyRef = useRef<string | null>(null);
  const webrtcRef   = useRef<WebrtcProvider | null>(null);
  const presenceRef = useRef<ReturnType<typeof doc> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yPresenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yjsPresenceActiveRef = useRef(false);
  const p2pOnlyRef = useRef(false);
  const lastYjsPresenceReceiveAtRef = useRef<number | null>(null);
  const yjsReceiveCountRef = useRef(0);
  const yjsSendCountRef = useRef(0);
  const hasWebrtcPeersRef = useRef(false);
  const lastAwarenessRemoteAtRef = useRef<number | null>(null);
  const awarenessResendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localAwarenessBaseRef = useRef<{ sessionId: string; userId: string; userName: string; userColor: string } | null>(null);
  const firestoreWriteCountRef = useRef(0);
  const awarenessLocalSetCountRef = useRef(0);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const cursorRafRef = useRef(0);
  const remotePeerIdsRef = useRef(new Set<string>());
  const debugSampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const icePathTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const shouldBlockFirestoreFallback = useCallback((): boolean => {
    if (yjsPresenceActiveRef.current) return true;
    const lastAwareness = lastAwarenessRemoteAtRef.current;
    return hasWebrtcPeersRef.current &&
      lastAwareness !== null &&
      Date.now() - lastAwareness < 3000;
  }, []);

  // debugRef used by updateDebug to accumulate patches within DebugContext.
  // The ref inside DebugProvider tracks current debug state; BoardProvider just
  // calls updateDebug() which is stable (useCallback with no deps).

  // ── Yjs + WebRTC P2P sync + Firestore persistence ──────────────────────

  useEffect(() => {
    if (!currentUser) return;

    p2pOnlyRef.current = typeof window !== 'undefined' &&
      window.localStorage.getItem('P2P_ONLY') === '1';
    setP2pOnly(p2pOnlyRef.current);

    const ydoc = new Y.Doc();
    const yObjects = ydoc.getMap<Y.Map<unknown>>('objects');
    const yPresence = ydoc.getMap<Y.Map<unknown>>('presence');

    ydocRef.current     = ydoc;
    yObjectsRef.current = yObjects;
    yPresenceRef.current = yPresence;

    updateDebug({ ydocClientId: ydoc.clientID });

    // Hermetic sync skip: use a plain in-memory Yjs doc with no network I/O.
    // Set VITE_TEST_SKIP_SYNC=true to activate. Deliberately separate from
    // VITE_TEST_AUTH_BYPASS so P2P latency tests can use real WebRTC while
    // still bypassing Google OAuth.
    if (import.meta.env.VITE_TEST_SKIP_SYNC === 'true') {
      const syncToReact = makeDiffSync(yObjects, objectsCacheRef, sortedArrayRef, setObjects);
      yObjects.observeDeep(syncToReact);
      setLoading(false);
      updateDebug({ firestoreSynced: true, presenceSource: 'none' });
      return () => {
        ydoc.destroy();
        ydocRef.current     = null;
        yObjectsRef.current = null;
      };
    }

    // P2P real-time sync via WebRTC
    const { provider: webrtcProvider, signalingUrl } = createWebrtcProvider(ydoc, boardId);
    webrtcRef.current = webrtcProvider;
    updateDebug({ signalingUrl });

    // Set local awareness state
    const userColor = getUserColor(currentUser.uid);
    localAwarenessBaseRef.current = {
      sessionId: `${currentUser.uid}:${ydoc.clientID}`,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Anonymous',
      userColor,
    };
    webrtcProvider.awareness.setLocalState({
      ...localAwarenessBaseRef.current,
      cursorX:   0,
      cursorY:   0,
    });
    awarenessLocalSetCountRef.current++;
    updateDebug({ awarenessLocalSetCount: awarenessLocalSetCountRef.current });

    // Initialize Yjs presence (P2P doc-backed fallback for awareness)
    const presenceKey = `${ydoc.clientID}`;
    yPresenceKeyRef.current = presenceKey;
    let myPresence = yPresence.get(presenceKey);
    if (!myPresence) {
      myPresence = new Y.Map<unknown>();
      yPresence.set(presenceKey, myPresence);
    }
    myPresence.set('userId', currentUser.uid);
    myPresence.set('sessionId', `${currentUser.uid}:${ydoc.clientID}`);
    myPresence.set('userName', currentUser.displayName || 'Anonymous');
    myPresence.set('userColor', userColor);
    myPresence.set('cursorX', 0);
    myPresence.set('cursorY', 0);
    myPresence.set('ts', Date.now());

    // Yjs doc-backed presence: only used for cursor positions (written to cursorStore)
    // and latency metrics. Firestore drives the "who's online" list.
    const syncPresenceFromYjs = () => {
      const now = Date.now();
      const key = yPresenceKeyRef.current;
      let peerCount = 0;
      let sumDelta = 0;
      let countDelta = 0;
      const remotePeers: PresenceUser[] = [];
      yPresence.forEach((val, k) => {
        if (k === key) return;
        if (!(val instanceof Y.Map)) return;
        // Skip stale entries
        const ts = typeof val.get('ts') === 'number' ? (val.get('ts') as number) : null;
        if (ts === null || now - ts > PRESENCE_STALE_MS) return;
        const userId = typeof val.get('userId') === 'string' ? (val.get('userId') as string) : `client-${k}`;
        const sessionId = typeof val.get('sessionId') === 'string'
          ? (val.get('sessionId') as string)
          : `${userId}:${k}`;
        const userName = typeof val.get('userName') === 'string' ? (val.get('userName') as string) : 'Anonymous';
        const userColor = typeof val.get('userColor') === 'string'
          ? (val.get('userColor') as string)
          : getUserColor(userId);
        const cursorX = typeof val.get('cursorX') === 'number' ? (val.get('cursorX') as number) : 0;
        const cursorY = typeof val.get('cursorY') === 'number' ? (val.get('cursorY') as number) : 0;
        setCursorPosition(sessionId, cursorX, cursorY);
        remotePeers.push({
          id: sessionId,
          userId,
          userName,
          userColor,
          cursorX,
          cursorY,
          lastActive: null,
        });
        peerCount++;
        if (ts !== null) {
          sumDelta += now - ts;
          countDelta++;
        }
      });
      if (lastYjsPresenceReceiveAtRef.current !== null) {
        setYjsReceiveGapMs(now - lastYjsPresenceReceiveAtRef.current);
      }
      lastYjsPresenceReceiveAtRef.current = now;
      if (peerCount > 0) {
        yjsReceiveCountRef.current++;
      }
      yjsPresenceActiveRef.current = peerCount > 0;
      if (countDelta > 0) {
        const avg = Math.round(sumDelta / countDelta);
        setYjsLatencyMs(avg);
        setYjsLatestSampleMs(avg);
      } else {
        setYjsLatencyMs(null);
      }

      // When Firestore fallback is blocked, derive visible presence from Yjs
      // doc-backed presence. This keeps cursors/users synced even if awareness
      // packets are dropped.
      if (shouldBlockFirestoreFallback()) {
        setPresence(remotePeers);
      }
    };

    yPresence.observeDeep(syncPresenceFromYjs);

    const rateTimer = setInterval(() => {
      setYjsReceiveRate(yjsReceiveCountRef.current);
      setYjsSendRate(yjsSendCountRef.current);
      yjsReceiveCountRef.current = 0;
      yjsSendCountRef.current = 0;
    }, 1000);

    // Track WebRTC connection status
    const onStatus = ({ connected }: { connected: boolean }) => {
      updateDebug({
        webrtcConnected: connected,
        signalingStatus: connected ? 'connected' : 'disconnected',
      });
    };
    webrtcProvider.on('status', onStatus);

    const onSynced = ({ synced }: { synced: boolean }) => {
      updateDebug({ webrtcSynced: synced });
    };
    webrtcProvider.on('synced', onSynced);

    // Track peer changes
    const onPeers = ({ webrtcPeers, bcPeers }: { webrtcPeers: string[]; bcPeers: string[] }) => {
      const hasPeers = webrtcPeers.length > 0 || bcPeers.length > 0;
      // Drive the Firestore-gate from raw peer count so it activates even when
      // awareness state hasn't propagated yet (the exact symptom we're debugging).
      hasWebrtcPeersRef.current = hasPeers;
      const shouldBlockFirestore = shouldBlockFirestoreFallback();
      updateDebug({
        webrtcPeerCount: webrtcPeers.length,
        bcPeerCount: bcPeers.length,
        p2pGateActive: shouldBlockFirestore,
      });
      console.log('[WebRTC] peers', { webrtcPeers, bcPeers });

      // Re-broadcast our awareness state so the newly-connected peer receives it.
      // y-webrtc does not automatically re-send on peer connect; without this, if
      // setLocalState was called before the peer arrived, they will never see it.
      if (hasPeers) {
        const current = webrtcProvider.awareness.getLocalState();
        if (current) webrtcProvider.awareness.setLocalState({ ...current });
      }
    };
    webrtcProvider.on('peers', onPeers);

    // Listen to awareness changes for remote cursors (P2P path).
    // HOT path: write cursor positions to cursorStore (no React).
    // COLD path: only call setPresence when the set of peer IDs changes (join/leave).
    const onAwarenessChange = () => {
      const now = Date.now();
      const states = webrtcProvider.awareness.getStates();
      const currentPeerIds = new Set<string>();
      const remotePeers: PresenceUser[] = [];
      let hasRemote = false;

      states.forEach((state, clientId) => {
        if (clientId === ydoc.clientID) return;
        const parsed = coerceAwarenessState(state, clientId);
        if (!parsed) return;
        // Skip stale entries (no timestamp or too old)
        if (parsed.ts === undefined || now - parsed.ts > PRESENCE_STALE_MS) return;
        hasRemote = true;
        currentPeerIds.add(parsed.sessionId);
        remotePeers.push({
          id: parsed.sessionId,
          userId: parsed.userId,
          userName: parsed.userName,
          userColor: parsed.userColor,
          cursorX: parsed.cursorX,
          cursorY: parsed.cursorY,
          lastActive: null,
        });
        setCursorPosition(parsed.sessionId, parsed.cursorX, parsed.cursorY);
      });

      if (hasRemote) {
        lastAwarenessRemoteAtRef.current = Date.now();
      }

      // Cold path: detect join/leave by comparing peer ID sets.
      // setPresence() is only called here (not on every cursor move) to avoid
      // O(N × cursor_Hz) React re-renders that tank FPS with multiple users.
      const prev = remotePeerIdsRef.current;
      const joined = [...currentPeerIds].some((id) => !prev.has(id));
      const left = [...prev].some((id) => !currentPeerIds.has(id));

      if (joined || left) {
        for (const id of prev) {
          if (!currentPeerIds.has(id)) removeCursor(id);
        }
        remotePeerIdsRef.current = currentPeerIds;
        // When Firestore fallback is blocked, awareness drives which remote
        // cursors are rendered (presence ids must match cursorStore keys).
        if (shouldBlockFirestoreFallback()) {
          setPresence(remotePeers);
        }
      }
    };
    const onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const originLabel = typeof origin === 'string' ? origin : origin ? 'remote' : 'unknown';
      console.log('[Awareness] update', { added, updated, removed, origin: originLabel });
      updateDebug({
        awarenessLastUpdate: { added: added.length, updated: updated.length, removed: removed.length, origin: originLabel },
      });
    };

    webrtcProvider.awareness.on('change', onAwarenessChange);
    webrtcProvider.awareness.on('update', onAwarenessUpdate);

    // Sample awareness state for debug overlay at a leisurely 500ms interval
    // instead of on every awareness event.
    debugSampleTimerRef.current = setInterval(() => {
      const states = webrtcProvider.awareness.getStates();
      const room = (webrtcProvider as unknown as {
        room?: { webrtcConns: Map<string, { connected: boolean; synced: boolean }> };
      }).room;
      let connectedPeers = 0;
      let syncedPeers = 0;
      room?.webrtcConns?.forEach((conn) => {
        if (conn.connected) connectedPeers++;
        if (conn.synced) syncedPeers++;
      });
      const remoteCursors: DebugInfo['remoteCursors'] = [];
      let rawRemote = 0;
      states.forEach((state, clientId) => {
        if (clientId === ydoc.clientID) return;
        rawRemote++;
        const parsed = coerceAwarenessState(state, clientId);
        if (!parsed) return;
        remoteCursors.push({
          userId:    parsed.sessionId,
          userName:  parsed.userName,
          x:         parsed.cursorX,
          y:         parsed.cursorY,
          latencyMs: parsed.ts !== undefined ? Date.now() - parsed.ts : undefined,
        });
      });
      const shouldBlockFirestore = shouldBlockFirestoreFallback();
      const presenceSource = yjsPresenceActiveRef.current
        ? 'yjs'
        : (remoteCursors.length > 0 ? 'webrtc' : debugInfoRef.current.presenceSource === 'firestore' ? 'firestore' : 'none');
      updateDebug({
        webrtcConnectedPeerCount: connectedPeers,
        webrtcSyncedPeerCount: syncedPeers,
        awarenessClientCount: states.size,
        awarenessRawRemoteCount: rawRemote,
        awarenessStatesSize: states.size,
        remoteCursors,
        p2pGateActive: shouldBlockFirestore,
        presenceSource,
      });
    }, 500);

    // Sample RTCPeerConnection candidate path (direct vs TURN relay).
    icePathTimerRef.current = setInterval(() => {
      const room = (webrtcProvider as unknown as {
        room?: { webrtcConns: Map<string, { connected: boolean; peer?: { _pc?: RTCPeerConnection } }> };
      }).room;
      if (!room?.webrtcConns) {
        updateDebug({ webrtcPath: 'unknown', webrtcRelayPeerCount: 0, webrtcDirectPeerCount: 0 });
        return;
      }

      void (async () => {
        let relayCount = 0;
        let directCount = 0;
        for (const conn of room.webrtcConns.values()) {
          if (!conn.connected) continue;
          const pc = conn.peer?._pc;
          if (!pc || typeof pc.getStats !== 'function') continue;
          try {
            const stats = await pc.getStats();
            let selectedPair: any = null;
            stats.forEach((report: any) => {
              if (report.type !== 'candidate-pair') return;
              const selected = report.selected === true || (report.nominated === true && report.state === 'succeeded');
              if (selected) selectedPair = report;
            });
            if (!selectedPair) continue;
            const local = selectedPair.localCandidateId ? (stats.get(selectedPair.localCandidateId) as any) : null;
            const remote = selectedPair.remoteCandidateId ? (stats.get(selectedPair.remoteCandidateId) as any) : null;
            const localType = local?.candidateType as string | undefined;
            const remoteType = remote?.candidateType as string | undefined;
            if (localType === 'relay' || remoteType === 'relay') relayCount++;
            else if (localType || remoteType) directCount++;
          } catch (error) {
            console.warn('[WebRTC] getStats failed', error);
          }
        }

        const path: DebugInfo['webrtcPath'] = relayCount > 0 && directCount > 0
          ? 'mixed'
          : relayCount > 0
            ? 'relay'
            : directCount > 0
              ? 'direct'
              : 'unknown';
        updateDebug({
          webrtcPath: path,
          webrtcRelayPeerCount: relayCount,
          webrtcDirectPeerCount: directCount,
        });
      })();
    }, 2000);

    // Periodic rebroadcast of awareness while peers exist.
    // Helps recover from missed initial awareness messages.
    awarenessResendTimerRef.current = setInterval(() => {
      if (!hasWebrtcPeersRef.current) return;
      const now = Date.now();
      const current = webrtcProvider.awareness.getLocalState();
      if (current) webrtcProvider.awareness.setLocalState({ ...current, ts: now });
      // Keep Yjs doc-backed presence ts fresh so syncPresenceFromYjs
      // doesn't filter us out as stale while idle.
      const yKey = yPresenceKeyRef.current;
      const myPresence = yKey ? yPresence.get(yKey) : null;
      if (myPresence) myPresence.set('ts', now);
    }, 1000);

    // Derive React state whenever the Yjs map changes (diff-based)
    const syncToReact = makeDiffSync(yObjects, objectsCacheRef, sortedArrayRef, setObjects);

    yObjects.observeDeep(syncToReact);

    // Debounced board-meta timestamp touch (~5s) so the dashboard
    // shows a recent "last edited" without adding hot-path latency.
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedTouch = () => {
      if (import.meta.env.VITE_TEST_SKIP_SYNC === 'true') return;
      if (touchTimer) clearTimeout(touchTimer);
      touchTimer = setTimeout(() => touchBoardTimestamp(boardId), 5000);
    };
    yObjects.observeDeep(debouncedTouch);

    let firestoreProvider: FirestoreYjsProvider | null = null;
    if (!p2pOnlyRef.current) {
      // Firestore persistence (durable backup)
      firestoreProvider = new FirestoreYjsProvider(ydoc, boardId);
      // Track Firestore writes via the provider's onPersisted callback
      firestoreProvider.onPersisted = () => {
        firestoreWriteCountRef.current++;
        updateDebug({
          firestoreWriteCount: firestoreWriteCountRef.current,
          lastFirestoreWrite: Date.now(),
        });
      };
      firestoreProvider.onSynced = () => {
        // Purge stale presence entries resurrected from CRDT history
        const myKey = yPresenceKeyRef.current;
        yPresence.doc!.transact(() => {
          yPresence.forEach((_val, key) => {
            if (key !== myKey) yPresence.delete(key);
          });
        });
        syncToReact();
        setLoading(false);
        updateDebug({ firestoreSynced: true });
      };
      firestoreProvider.connect();
    } else {
      // P2P-only: no Firestore snapshot. Ready immediately.
      syncToReact();
      setLoading(false);
      updateDebug({ firestoreSynced: false });
    }

    return () => {
      webrtcProvider.off('status', onStatus);
      webrtcProvider.off('synced', onSynced);
      webrtcProvider.off('peers', onPeers);
      webrtcProvider.awareness.off('change', onAwarenessChange);
      webrtcProvider.awareness.off('update', onAwarenessUpdate);
      if (awarenessResendTimerRef.current) {
        clearInterval(awarenessResendTimerRef.current);
        awarenessResendTimerRef.current = null;
      }
      if (debugSampleTimerRef.current) {
        clearInterval(debugSampleTimerRef.current);
        debugSampleTimerRef.current = null;
      }
      if (icePathTimerRef.current) {
        clearInterval(icePathTimerRef.current);
        icePathTimerRef.current = null;
      }
      yPresence.unobserveDeep(syncPresenceFromYjs);
      yObjects.unobserveDeep(debouncedTouch);
      if (touchTimer) clearTimeout(touchTimer);
      clearInterval(rateTimer);
      webrtcProvider.destroy();
      if (firestoreProvider) firestoreProvider.destroy();
      if (yPresenceKeyRef.current) {
        yPresence.delete(yPresenceKeyRef.current);
      }
      ydoc.destroy();
      ydocRef.current     = null;
      yObjectsRef.current = null;
      yPresenceRef.current = null;
      webrtcRef.current    = null;
      hasWebrtcPeersRef.current = false;
    };
  }, [currentUser, boardId, shouldBlockFirestoreFallback, updateDebug]);

  // ── Firestore presence (always-on for "who's online") ──────────────────

  useEffect(() => {
    if (!currentUser) return;
    if (import.meta.env.VITE_TEST_SKIP_SYNC === 'true') return;
    if (p2pOnlyRef.current) return;

    presenceRef.current = doc(db, `boards/${boardId}/presence`, currentUser.uid);
    const userColor = getUserColor(currentUser.uid);

    setDoc(presenceRef.current, {
      userId:    currentUser.uid,
      userName:  currentUser.displayName || 'Anonymous',
      userColor,
      cursorX:   0,
      cursorY:   0,
      lastActive: serverTimestamp(),
    }).catch((e) => console.error('presence set error:', e));

    const heartbeat = setInterval(() => {
      if (presenceRef.current) {
        setDoc(presenceRef.current, { lastActive: serverTimestamp() }, { merge: true })
          .catch((e) => console.warn('[BoardContext] heartbeat update failed:', e));
      }
    }, 60_000);

    const STALE_MS = 10 * 60 * 1000;

    const presenceCol = collection(db, `boards/${boardId}/presence`);
    const unsub = onSnapshot(presenceCol, (snap) => {
      // Firestore always drives the "who's online" list.
      // Cursor positions come from cursorStore (P2P) — Firestore positions
      // are only used as a fallback when cursorStore has no entry for a peer.
      const all: PresenceUser[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as PresenceDoc) }))
        .filter((p) => {
          if (!p.lastActive) return false;
          return Date.now() - p.lastActive.toDate().getTime() < STALE_MS;
        })
        .filter((p) => p.userId !== currentUser.uid);
      if (shouldBlockFirestoreFallback()) {
        // P2P presence (awareness/Yjs) is active; don't overwrite presence with Firestore
        // or cursors will fall back to stale (0,0) Firestore positions.
        return;
      }
      setPresence(all);
      if (!shouldBlockFirestoreFallback()) {
        updateDebug({
          presenceSource: 'firestore',
        });
      }
    });

    return () => {
      clearInterval(heartbeat);
      unsub();
      if (presenceRef.current) {
        deleteDoc(presenceRef.current).catch((e) => console.warn('[BoardContext] presence cleanup failed:', e));
      }
    };
  }, [currentUser, boardId, shouldBlockFirestoreFallback, updateDebug]);

  // ── CRUD helpers (stable refs for React.memo) ───────────────────────────

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const createObject = useCallback((
    type: ShapeType,
    x: number,
    y: number,
    overrides: Partial<BoardObject> = {}
  ): string => {
    const yObjects = yObjectsRef.current;
    const user = currentUserRef.current;
    if (!yObjects || !user) return '';

    const id = crypto.randomUUID();
    const { id: _discardId, ...safeOverrides } = overrides;
    const obj: BoardObject = {
      id,
      type,
      x,
      y,
      width:         200,
      height:        200,
      rotation:      0,
      color:         '#FFE66D',
      zIndex:        Date.now(),
      createdBy:     user.uid,
      createdByName: user.displayName || 'Anonymous',
      ...SHAPE_DEFAULTS[type],
      ...safeOverrides,
    };

    const yObj = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(obj)) {
      yObj.set(k, v);
    }
    yObjects.set(id, yObj);
    return id;
  }, []);

  const updateObject = useCallback((id: string, updates: Partial<BoardObject>): void => {
    const yObjects = yObjectsRef.current;
    const ydoc     = ydocRef.current;
    if (!yObjects || !ydoc) return;

    const yObj = yObjects.get(id);
    if (!yObj) return;

    ydoc.transact(() => {
      for (const [k, v] of Object.entries(updates)) {
        yObj.set(k, v as unknown);
      }
    });
  }, []);

  const deleteObject = useCallback((id: string): void => {
    yObjectsRef.current?.delete(id);
  }, []);

  const deleteAllObjects = useCallback((): void => {
    const yObjects = yObjectsRef.current;
    const ydoc     = ydocRef.current;
    if (!yObjects || !ydoc) return;
    ydoc.transact(() => {
      [...yObjects.keys()].forEach((k) => yObjects.delete(k));
    });
  }, []);

  // ── Batch operations ──────────────────────────────────────────────────────

  const batchCreate = useCallback((
    items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>
  ): string[] => {
    const ydoc = ydocRef.current;
    const user = currentUserRef.current;
    if (!ydoc || !user) return [];
    const ids: string[] = [];
    ydoc.transact(() => {
      for (const { type, x, y, ...rest } of items) {
        ids.push(createObject(type, x, y, rest));
      }
    });
    return ids;
  }, [createObject]);

  const batchUpdate = useCallback((updates: Array<{ id: string; changes: Partial<BoardObject> }>): void => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    ydoc.transact(() => {
      for (const { id, changes } of updates) {
        updateObject(id, changes);
      }
    });
  }, [updateObject]);

  const batchDelete = useCallback((ids: string[]): void => {
    const yObjects = yObjectsRef.current;
    const ydoc     = ydocRef.current;
    if (!yObjects || !ydoc) return;
    ydoc.transact(() => {
      ids.forEach((id) => yObjects.delete(id));
    });
  }, []);

  // ── Presence ───────────────────────────────────────────────────────────────

  const updateCursorPosition = useCallback((x: number, y: number): void => {
    localCursorRef.current = { x, y };

    // RAF-gate: store pending position, only broadcast on next animation frame.
    // Caps outbound awareness at ~60/sec regardless of mousemove frequency.
    pendingCursorRef.current = { x, y };
    if (!cursorRafRef.current) {
      cursorRafRef.current = requestAnimationFrame(() => {
        cursorRafRef.current = 0;
        const pos = pendingCursorRef.current;
        if (!pos) return;

        const provider = webrtcRef.current;
        if (provider) {
          const base = localAwarenessBaseRef.current;
          if (!base) return;
          provider.awareness.setLocalState({
            ...base,
            cursorX: pos.x,
            cursorY: pos.y,
            ts: Date.now(),
          });
        }

        const yPresence = yPresenceRef.current;
        const key = yPresenceKeyRef.current;
        if (yPresence && key) {
          const myPresence = yPresence.get(key);
          if (myPresence) {
            myPresence.set('cursorX', pos.x);
            myPresence.set('cursorY', pos.y);
            myPresence.set('ts', Date.now());
            yjsSendCountRef.current++;
          }
        }
      });
    }

    // Firestore cursor fallback disabled by design.
  }, [shouldBlockFirestoreFallback]);

  // ── Query helpers (read from ref for stable callback identity) ───────────

  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const getObjectById    = useCallback((id: string) => objectsRef.current.find((o) => o.id === id), []);
  const getObjectsByType = useCallback((type: ShapeType) => objectsRef.current.filter((o) => o.type === type), []);
  const getAllObjects     = useCallback(() => objectsRef.current, []);

  // ── Context values ────────────────────────────────────────────────────────

  const dataValue = useMemo<BoardDataValue>(() => ({
    objects, presence, loading, userRole,
  }), [objects, presence, loading, userRole]);

  const actionsValue = useMemo<BoardActionsValue>(() => ({
    createObject, updateObject, deleteObject, deleteAllObjects,
    batchCreate, batchUpdate, batchDelete,
    updateCursorPosition,
    getObjectById, getObjectsByType, getAllObjects,
  }), [
    createObject, updateObject, deleteObject, deleteAllObjects,
    batchCreate, batchUpdate, batchDelete,
    updateCursorPosition,
    getObjectById, getObjectsByType, getAllObjects,
  ]);

  return (
    <BoardActionsContext.Provider value={actionsValue}>
      <BoardDataContext.Provider value={dataValue}>
        {children}
      </BoardDataContext.Provider>
    </BoardActionsContext.Provider>
  );
}
