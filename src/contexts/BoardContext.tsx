/**
 * BoardContext
 *
 * Provides real-time collaborative board state backed by Yjs CRDTs.
 * - y-webrtc handles P2P real-time sync (sub-10ms latency when connected)
 * - Yjs Awareness (over WebRTC) handles cursor/presence when peers are connected
 * - Firestore presence is the fallback for cursor/user-online visibility
 * - Firestore persists durable Yjs snapshots as backup (~500ms debounce)
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
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
import type { BoardObject, PresenceUser, ShapeType } from '../types/board';

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
  userId: string;
  userName: string;
  userColor: string;
  cursorX: number;
  cursorY: number;
}

function isAwarenessState(s: unknown): s is AwarenessState {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o['userId']    === 'string' &&
    typeof o['userName']  === 'string' &&
    typeof o['userColor'] === 'string' &&
    typeof o['cursorX']   === 'number' &&
    typeof o['cursorY']   === 'number'
  );
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

const SHAPE_DEFAULTS: Record<ShapeType, Partial<BoardObject>> = {
  sticky:    { width: 200, height: 200, color: '#FFE66D', content: 'Double-click to edit' },
  rect:      { width: 160, height: 100, color: '#85C1E2' },
  circle:    { width: 120, height: 120, color: '#AA96DA' },
  text:      { width: 200, height:  60, color: '#333333', content: 'Text' },
  line:      { width: 200, height:   0, color: '#333333', strokeWidth: 2 },
  connector: { width:   0, height:   0, color: '#666666', strokeWidth: 2 },
};

// ── debug info type ───────────────────────────────────────────────────────

export interface DebugInfo {
  // Connection
  webrtcConnected: boolean;
  webrtcPeerCount: number;
  bcPeerCount: number;
  signalingStatus: string;
  presenceSource: 'webrtc' | 'firestore' | 'none';
  // Sync
  firestoreSynced: boolean;
  firestoreWriteCount: number;
  lastFirestoreWrite: number | null;
  ydocClientId: number | null;
  // Cursors — localCursor intentionally omitted; DebugOverlay reads localCursorRef directly
  remoteCursors: Array<{ userId: string; userName: string; x: number; y: number }>;
  // Awareness
  awarenessClientCount: number;
}

const EMPTY_DEBUG: DebugInfo = {
  webrtcConnected: false,
  webrtcPeerCount: 0,
  bcPeerCount: 0,
  signalingStatus: 'disconnected',
  presenceSource: 'none',
  firestoreSynced: false,
  firestoreWriteCount: 0,
  lastFirestoreWrite: null,
  ydocClientId: null,
  remoteCursors: [],
  awarenessClientCount: 0,
};

// ── context types ──────────────────────────────────────────────────────────

interface BoardContextValue {
  objects: BoardObject[];
  presence: PresenceUser[];
  loading: boolean;
  debugInfo: DebugInfo;
  /** Ref to the local cursor canvas position. Read directly in DebugOverlay's
   *  RAF loop to avoid a React state update on every mouse-move event. */
  localCursorRef: { readonly current: { x: number; y: number } };
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

// ── context + hook ─────────────────────────────────────────────────────────

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be used within BoardProvider');
  return ctx;
}

// ── provider ───────────────────────────────────────────────────────────────

export function BoardProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const boardId = 'default-board';

  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(EMPTY_DEBUG);

  const ydocRef     = useRef<Y.Doc | null>(null);
  const yObjectsRef = useRef<Y.Map<Y.Map<unknown>> | null>(null);
  const webrtcRef   = useRef<WebrtcProvider | null>(null);
  const presenceRef = useRef<ReturnType<typeof doc> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWebrtcPeersRef = useRef(false);
  const debugRef = useRef<DebugInfo>(EMPTY_DEBUG);
  const localCursorRef = useRef({ x: 0, y: 0 });
  const firestoreWriteCountRef = useRef(0);

  // Helper to batch-update debug info
  const updateDebug = useCallback((patch: Partial<DebugInfo>) => {
    debugRef.current = { ...debugRef.current, ...patch };
    setDebugInfo(debugRef.current);
  }, []);

  // ── Yjs + WebRTC P2P sync + Firestore persistence ──────────────────────

  useEffect(() => {
    if (!currentUser) return;

    const ydoc = new Y.Doc();
    const yObjects = ydoc.getMap<Y.Map<unknown>>('objects');

    ydocRef.current     = ydoc;
    yObjectsRef.current = yObjects;

    updateDebug({ ydocClientId: ydoc.clientID });

    // P2P real-time sync via WebRTC
    const webrtcProvider = createWebrtcProvider(ydoc, boardId);
    webrtcRef.current = webrtcProvider;

    // Set local awareness state
    const userColor = getUserColor(currentUser.uid);
    webrtcProvider.awareness.setLocalState({
      userId:    currentUser.uid,
      userName:  currentUser.displayName || 'Anonymous',
      userColor,
      cursorX:   0,
      cursorY:   0,
    });

    // Track WebRTC connection status
    const onStatus = ({ connected }: { connected: boolean }) => {
      updateDebug({
        webrtcConnected: connected,
        signalingStatus: connected ? 'connected' : 'disconnected',
      });
    };
    webrtcProvider.on('status', onStatus);

    // Track peer changes
    const onPeers = ({ webrtcPeers, bcPeers }: { webrtcPeers: string[]; bcPeers: string[] }) => {
      updateDebug({
        webrtcPeerCount: webrtcPeers.length,
        bcPeerCount: bcPeers.length,
      });
    };
    webrtcProvider.on('peers', onPeers);

    // Listen to awareness changes for remote cursors (P2P path)
    const onAwarenessChange = () => {
      const states = webrtcProvider.awareness.getStates();
      const remotePeers: PresenceUser[] = [];
      const remoteCursors: DebugInfo['remoteCursors'] = [];
      states.forEach((state, clientId) => {
        if (clientId === ydoc.clientID) return;
        if (!isAwarenessState(state)) return;
        remotePeers.push({
          id:        state.userId,
          userId:    state.userId,
          userName:  state.userName,
          userColor: state.userColor,
          cursorX:   state.cursorX,
          cursorY:   state.cursorY,
        });
        remoteCursors.push({
          userId:   state.userId,
          userName: state.userName,
          x:        state.cursorX,
          y:        state.cursorY,
        });
      });
      hasWebrtcPeersRef.current = remotePeers.length > 0;
      updateDebug({
        awarenessClientCount: states.size,
        remoteCursors,
        presenceSource: remotePeers.length > 0 ? 'webrtc' : debugRef.current.presenceSource === 'firestore' ? 'firestore' : 'none',
      });
      if (remotePeers.length > 0) {
        setPresence(remotePeers);
      }
    };
    webrtcProvider.awareness.on('change', onAwarenessChange);

    // Firestore persistence (durable backup)
    const firestoreProvider = new FirestoreYjsProvider(ydoc, boardId);

    // Track Firestore writes via the provider's onPersisted callback
    firestoreProvider.onPersisted = () => {
      firestoreWriteCountRef.current++;
      updateDebug({
        firestoreWriteCount: firestoreWriteCountRef.current,
        lastFirestoreWrite: Date.now(),
      });
    };

    // Derive React state whenever the Yjs map changes
    const syncToReact = () => {
      const arr: BoardObject[] = [];
      yObjects.forEach((yObj) => {
        arr.push(Object.fromEntries(yObj.entries()) as unknown as BoardObject);
      });
      arr.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      setObjects(arr);
    };

    yObjects.observeDeep(syncToReact);

    firestoreProvider.onSynced = () => {
      syncToReact();
      setLoading(false);
      updateDebug({ firestoreSynced: true });
    };

    firestoreProvider.connect();

    return () => {
      webrtcProvider.off('status', onStatus);
      webrtcProvider.off('peers', onPeers);
      webrtcProvider.awareness.off('change', onAwarenessChange);
      webrtcProvider.destroy();
      firestoreProvider.destroy();
      ydoc.destroy();
      ydocRef.current     = null;
      yObjectsRef.current = null;
      webrtcRef.current    = null;
      hasWebrtcPeersRef.current = false;
    };
  }, [currentUser, boardId, updateDebug]);

  // ── Firestore presence (fallback when WebRTC peers not connected) ──────

  useEffect(() => {
    if (!currentUser) return;

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

    // Heartbeat: keep lastActive fresh so other clients can detect our presence.
    // Without this, a force-closed tab leaves a stale doc forever.
    const heartbeat = setInterval(() => {
      if (presenceRef.current) {
        setDoc(presenceRef.current, { lastActive: serverTimestamp() }, { merge: true })
          .catch((e) => console.warn('[BoardContext] heartbeat update failed:', e));
      }
    }, 60_000);

    const STALE_MS = 10 * 60 * 1000;

    const presenceCol = collection(db, `boards/${boardId}/presence`);
    const unsub = onSnapshot(presenceCol, (snap) => {
      // Only use Firestore presence when we have no WebRTC peers
      if (hasWebrtcPeersRef.current) return;
      const all: PresenceUser[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as PresenceDoc) }))
        .filter((p) => {
          // Drop entries with no heartbeat or whose heartbeat is older than STALE_MS.
          // This evicts tabs that closed without a graceful deleteDoc.
          if (!p.lastActive) return false;
          return Date.now() - p.lastActive.toDate().getTime() < STALE_MS;
        })
        .filter((p) => p.userId !== currentUser.uid);
      setPresence(all);
      if (all.length > 0) {
        updateDebug({ presenceSource: 'firestore' });
      }
    });

    return () => {
      clearInterval(heartbeat);
      unsub();
      if (presenceRef.current) {
        deleteDoc(presenceRef.current).catch((e) => console.warn('[BoardContext] presence cleanup failed:', e));
      }
    };
  }, [currentUser, boardId, updateDebug]);

  // ── CRUD helpers ──────────────────────────────────────────────────────────

  const createObject = (
    type: ShapeType,
    x: number,
    y: number,
    overrides: Partial<BoardObject> = {}
  ): string => {
    const yObjects = yObjectsRef.current;
    if (!yObjects || !currentUser) return '';

    const id = crypto.randomUUID();
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
      createdBy:     currentUser.uid,
      createdByName: currentUser.displayName || 'Anonymous',
      ...SHAPE_DEFAULTS[type],
      ...overrides,
    };

    const yObj = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(obj)) {
      yObj.set(k, v);
    }
    yObjects.set(id, yObj);
    return id;
  };

  const updateObject = (id: string, updates: Partial<BoardObject>): void => {
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
  };

  const deleteObject = (id: string): void => {
    yObjectsRef.current?.delete(id);
  };

  const deleteAllObjects = (): void => {
    const yObjects = yObjectsRef.current;
    const ydoc     = ydocRef.current;
    if (!yObjects || !ydoc) return;
    ydoc.transact(() => {
      [...yObjects.keys()].forEach((k) => yObjects.delete(k));
    });
  };

  // ── Batch operations ──────────────────────────────────────────────────────

  const batchCreate = (
    items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>
  ): string[] => {
    const ydoc = ydocRef.current;
    if (!ydoc || !currentUser) return [];
    const ids: string[] = [];
    ydoc.transact(() => {
      for (const { type, x, y, ...rest } of items) {
        ids.push(createObject(type, x, y, rest));
      }
    });
    return ids;
  };

  const batchUpdate = (updates: Array<{ id: string; changes: Partial<BoardObject> }>): void => {
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    ydoc.transact(() => {
      for (const { id, changes } of updates) {
        updateObject(id, changes);
      }
    });
  };

  const batchDelete = (ids: string[]): void => {
    const yObjects = yObjectsRef.current;
    const ydoc     = ydocRef.current;
    if (!yObjects || !ydoc) return;
    ydoc.transact(() => {
      ids.forEach((id) => yObjects.delete(id));
    });
  };

  // ── Presence ───────────────────────────────────────────────────────────────

  const updateCursorPosition = useCallback((x: number, y: number): void => {
    // Write to a ref — no React state update, so no re-render on every mouse-move.
    // DebugOverlay reads localCursorRef.current in its own RAF loop.
    localCursorRef.current = { x, y };

    // Update awareness (P2P path — instant when peers connected)
    const provider = webrtcRef.current;
    if (provider) {
      const current = provider.awareness.getLocalState();
      provider.awareness.setLocalState({
        ...current,
        cursorX: x,
        cursorY: y,
      });
    }

    // Also update Firestore presence (fallback, throttled)
    if (cursorTimerRef.current !== null) return;
    cursorTimerRef.current = setTimeout(() => {
      cursorTimerRef.current = null;
      if (presenceRef.current) {
        updateDoc(presenceRef.current, {
          cursorX: x,
          cursorY: y,
          lastActive: serverTimestamp(),
        }).catch(() => {});
      }
    }, 100);
  }, []);

  // ── Query helpers ─────────────────────────────────────────────────────────

  const getObjectById     = (id: string)       => objects.find((o) => o.id === id);
  const getObjectsByType  = (type: ShapeType)  => objects.filter((o) => o.type === type);
  const getAllObjects      = ()                 => objects;

  // ── Context value ─────────────────────────────────────────────────────────

  const value: BoardContextValue = {
    objects,
    presence,
    loading,
    debugInfo,
    localCursorRef,
    createObject,
    updateObject,
    deleteObject,
    deleteAllObjects,
    batchCreate,
    batchUpdate,
    batchDelete,
    updateCursorPosition,
    getObjectById,
    getObjectsByType,
    getAllObjects,
  };

  return (
    <BoardContext.Provider value={value}>
      {children}
    </BoardContext.Provider>
  );
}
