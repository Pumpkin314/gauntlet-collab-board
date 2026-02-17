/**
 * BoardContext
 *
 * Provides real-time collaborative board state backed by Yjs CRDTs.
 * Yjs (Y.Map of Y.Map) is the in-memory source of truth.
 * Firestore persists a single compacted snapshot (via FirestoreYjsProvider).
 * Presence (cursor positions) remains Firestore-based for simplicity.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import * as Y from 'yjs';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { FirestoreYjsProvider } from './firestoreYjsProvider';
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

const SHAPE_DEFAULTS: Record<ShapeType, Partial<BoardObject>> = {
  sticky:    { width: 200, height: 200, color: '#FFE66D', content: 'Double-click to edit' },
  rect:      { width: 160, height: 100, color: '#85C1E2' },
  circle:    { width: 120, height: 120, color: '#AA96DA' },
  text:      { width: 200, height:  60, color: '#333333', content: 'Text' },
  line:      { width: 200, height:   0, color: '#333333', strokeWidth: 2 },
  connector: { width:   0, height:   0, color: '#666666', strokeWidth: 2 },
};

// ── context types ──────────────────────────────────────────────────────────

interface BoardContextValue {
  objects: BoardObject[];
  presence: PresenceUser[];
  loading: boolean;
  // Core CRUD (synchronous — Yjs updates are instant in-memory)
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
  updateObject(id: string, updates: Partial<BoardObject>): void;
  deleteObject(id: string): void;
  deleteAllObjects(): void;
  // Batch operations (wrapped in a single Yjs transaction → single Firestore write)
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
  batchUpdate(updates: Array<{ id: string; changes: Partial<BoardObject> }>): void;
  batchDelete(ids: string[]): void;
  // Presence
  updateCursorPosition(x: number, y: number): void;
  // Query helpers (used by AI agent)
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

  const ydocRef     = useRef<Y.Doc | null>(null);
  const yObjectsRef = useRef<Y.Map<Y.Map<unknown>> | null>(null);
  const presenceRef = useRef<ReturnType<typeof doc> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Yjs + Firestore snapshot provider ────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;

    const ydoc = new Y.Doc();
    // Top-level map: objectId → Y.Map of fields
    const yObjects = ydoc.getMap<Y.Map<unknown>>('objects');

    ydocRef.current     = ydoc;
    yObjectsRef.current = yObjects;

    const provider = new FirestoreYjsProvider(ydoc, boardId);

    // Derive React state whenever the Yjs map changes
    const syncToReact = () => {
      const arr: BoardObject[] = [];
      yObjects.forEach((yObj) => {
        arr.push(Object.fromEntries(yObj.entries()) as BoardObject);
      });
      arr.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      setObjects(arr);
    };

    yObjects.observeDeep(syncToReact);

    provider.onSynced = () => {
      syncToReact();
      setLoading(false);
    };

    provider.connect();

    return () => {
      provider.destroy();
      ydoc.destroy();
      ydocRef.current     = null;
      yObjectsRef.current = null;
    };
  }, [currentUser, boardId]);

  // ── Firestore presence ────────────────────────────────────────────────────

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

    const presenceCol = collection(db, `boards/${boardId}/presence`);
    const unsub = onSnapshot(presenceCol, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PresenceUser[];
      setPresence(all.filter((p) => p.userId !== currentUser.uid));
    });

    return () => {
      unsub();
      if (presenceRef.current) {
        deleteDoc(presenceRef.current).catch(() => {});
      }
    };
  }, [currentUser, boardId]);

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

  // ── Presence ──────────────────────────────────────────────────────────────

  const updateCursorPosition = (x: number, y: number): void => {
    // Throttle to one write per 100 ms
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
  };

  // ── Query helpers ─────────────────────────────────────────────────────────

  const getObjectById     = (id: string)       => objects.find((o) => o.id === id);
  const getObjectsByType  = (type: ShapeType)  => objects.filter((o) => o.type === type);
  const getAllObjects      = ()                 => objects;

  // ── Context value ─────────────────────────────────────────────────────────

  const value: BoardContextValue = {
    objects,
    presence,
    loading,
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
