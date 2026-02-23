import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface BoardMeta {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const boardsCol = collection(db, 'boards');

export async function createBoard(
  ownerId: string,
  ownerName: string,
  title = 'Untitled Board',
): Promise<string> {
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
