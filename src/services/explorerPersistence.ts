import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Confidence } from '../agent/quizTypes';

export interface PersistedExplorerState {
  grade: string;
  stateType: string;
  kgNodeMap: Record<string, string>;
  confidenceMap: Record<string, Confidence>;
  drawnEdges: string[];
}

function explorerDocRef(boardId: string) {
  return doc(db, `boards/${boardId}/explorerState`, 'current');
}

export async function saveExplorerState(
  boardId: string,
  state: PersistedExplorerState,
): Promise<void> {
  try {
    await setDoc(explorerDocRef(boardId), {
      ...state,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[Explorer] Failed to save state:', err);
  }
}

export async function loadExplorerState(
  boardId: string,
): Promise<PersistedExplorerState | null> {
  try {
    const snap = await getDoc(explorerDocRef(boardId));
    if (!snap.exists()) return null;
    return snap.data() as PersistedExplorerState;
  } catch (err) {
    console.warn('[Explorer] Failed to load state:', err);
    return null;
  }
}

export async function clearExplorerState(boardId: string): Promise<void> {
  try {
    await deleteDoc(explorerDocRef(boardId));
  } catch (err) {
    console.warn('[Explorer] Failed to clear state:', err);
  }
}
