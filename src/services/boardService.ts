import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface SharedUser {
  email: string;
  displayName: string;
  role: 'editor' | 'viewer';
}

export interface BoardMeta {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  sharedWith?: Record<string, SharedUser>;
  sharedWithUids?: string[];
}

const MAX_BOARDS_PER_USER = 10;

const boardsCol = collection(db, 'boards');

export async function createBoard(
  ownerId: string,
  ownerName: string,
  title = 'Untitled Board',
): Promise<string> {
  const q = query(boardsCol, where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  if (snap.size >= MAX_BOARDS_PER_USER) {
    throw new Error(`Board limit reached (max ${MAX_BOARDS_PER_USER})`);
  }

  const id = crypto.randomUUID();
  const ref = doc(boardsCol, id);
  await setDoc(ref, {
    id,
    title,
    ownerId,
    ownerName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteBoard(boardId: string): Promise<void> {
  await deleteDoc(doc(boardsCol, boardId));
}

export async function renameBoard(boardId: string, title: string): Promise<void> {
  await updateDoc(doc(boardsCol, boardId), { title, updatedAt: serverTimestamp() });
}

/**
 * Subscribes to boards owned by the given user, ordered by most recently updated.
 * Returns an unsubscribe function.
 */
export function getUserBoards(
  ownerId: string,
  callback: (boards: BoardMeta[]) => void,
): () => void {
  const q = query(
    boardsCol,
    where('ownerId', '==', ownerId),
  );
  return onSnapshot(q, (snap) => {
    const boards = snap.docs
      .map((d) => d.data() as BoardMeta)
      .sort((a, b) => {
        const aTime = a.updatedAt?.toDate?.().getTime() ?? 0;
        const bTime = b.updatedAt?.toDate?.().getTime() ?? 0;
        return bTime - aTime;
      });
    callback(boards);
  }, (err) => {
    console.error('[boardService] getUserBoards listener error:', err);
  });
}

/** Fire-and-forget timestamp touch — debounce at call site. */
export function touchBoardTimestamp(boardId: string): void {
  updateDoc(doc(boardsCol, boardId), { updatedAt: serverTimestamp() }).catch(() => {
    // Swallow errors — this is a best-effort update
  });
}

/** Fetch a single board's metadata. */
export async function getBoardMeta(boardId: string): Promise<BoardMeta | null> {
  const snap = await getDoc(doc(boardsCol, boardId));
  if (!snap.exists()) return null;
  return snap.data() as BoardMeta;
}

/** Share a board with another user. Only the owner should call this. */
export async function shareBoardWith(
  boardId: string,
  targetUid: string,
  user: SharedUser,
): Promise<void> {
  const ref = doc(boardsCol, boardId);
  await updateDoc(ref, {
    [`sharedWith.${targetUid}`]: user,
    sharedWithUids: arrayUnion(targetUid),
    updatedAt: serverTimestamp(),
  });
}

/** Remove a user's access to a board. */
export async function removeBoardShare(boardId: string, targetUid: string): Promise<void> {
  const ref = doc(boardsCol, boardId);
  // Firestore doesn't support deleting nested map keys + arrayRemove atomically,
  // so we read-modify-write the sharedWith field.
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as BoardMeta;
  const sharedWith = { ...data.sharedWith };
  delete sharedWith[targetUid];
  await updateDoc(ref, {
    sharedWith,
    sharedWithUids: arrayRemove(targetUid),
    updatedAt: serverTimestamp(),
  });
}

/** Change a collaborator's role. */
export async function updateShareRole(
  boardId: string,
  targetUid: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const ref = doc(boardsCol, boardId);
  await updateDoc(ref, {
    [`sharedWith.${targetUid}.role`]: role,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to boards shared with the given user.
 * Uses the sharedWithUids array for Firestore array-contains queries.
 */
export function getSharedBoards(
  uid: string,
  callback: (boards: BoardMeta[]) => void,
): () => void {
  const q = query(boardsCol, where('sharedWithUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const boards = snap.docs
      .map((d) => d.data() as BoardMeta)
      .sort((a, b) => {
        const aTime = a.updatedAt?.toDate?.().getTime() ?? 0;
        const bTime = b.updatedAt?.toDate?.().getTime() ?? 0;
        return bTime - aTime;
      });
    callback(boards);
  }, (err) => {
    console.error('[boardService] getSharedBoards listener error:', err);
  });
}
