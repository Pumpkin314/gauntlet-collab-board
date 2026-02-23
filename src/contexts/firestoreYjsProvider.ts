/**
 * FirestorePersistenceProvider
 *
 * Persistence-only Yjs provider using Firestore as a durable backup.
 * Real-time P2P sync is handled by y-webrtc; this provider persists
 * a compacted snapshot at a relaxed cadence (~2s debounce).
 *
 * Firestore structure (one doc per board):
 *   boards/{boardId}/ydoc/state
 *     state:     string   (base64-encoded Y.Doc state)
 *     updatedAt: number
 *
 * Always writes full state (single-doc architecture requires complete snapshots).
 */

import * as Y from 'yjs';
import { db } from '../firebase';
import {
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';

// ── helpers ────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── provider ───────────────────────────────────────────────────────────────

export { FirestorePersistenceProvider as FirestoreYjsProvider };

export class FirestorePersistenceProvider {
  private ydoc: Y.Doc;
  private boardId: string;
  private unsubscribe: (() => void) | null = null;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;
  private synced = false;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;

  /** Fired once after the initial Firestore snapshot is applied. */
  onSynced?: () => void;
  /** Fired after each successful persist to Firestore. */
  onPersisted?: () => void;

  constructor(ydoc: Y.Doc, boardId: string) {
    this.ydoc = ydoc;
    this.boardId = boardId;

    // When the local doc mutates (not from Firestore), schedule a snapshot write
    this.updateHandler = (_update: Uint8Array, origin: unknown) => {
      if (origin === 'firestore') return;
      if (!this.synced) return;
      this.schedulePersist();
    };
    ydoc.on('update', this.updateHandler);
  }

  connect(): void {
    const snapshotRef = doc(db, `boards/${this.boardId}/ydoc/state`);

    this.unsubscribe = onSnapshot(
      snapshotRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data['state'] !== 'string') {
            console.error('[FirestoreYjsProvider] unexpected snapshot format:', data);
          } else {
            // Y.applyUpdate merges the remote snapshot into local state (CRDT-safe)
            Y.applyUpdate(this.ydoc, base64ToUint8(data['state']), 'firestore');
          }
        }

        // Signal ready after the first snapshot (may be empty for new boards)
        if (!this.synced) {
          this.synced = true;
          this.onSynced?.();
        }
      },
      (error) => {
        console.error('[FirestoreYjsProvider] snapshot error:', error);
        // Still mark the board as ready so callers don't hang indefinitely.
        // This lets P2P test sessions start with stub Firestore credentials —
        // WebRTC handles real-time sync; Firestore persistence is simply absent.
        if (!this.synced) {
          this.synced = true;
          this.onSynced?.();
        }
      }
    );
  }

  private schedulePersist(): void {
    if (this.persistTimeout !== null) return; // coalesce: one write per quiescent period
    this.persistTimeout = setTimeout(() => {
      this.persistTimeout = null;
      void this.persist();
    }, 500);
  }

  private async persist(): Promise<void> {
    try {
      const snapshotRef = doc(db, `boards/${this.boardId}/ydoc/state`);
      const state = Y.encodeStateAsUpdate(this.ydoc);
      await setDoc(snapshotRef, {
        state: uint8ToBase64(state),
        updatedAt: Date.now(),
      });
      this.onPersisted?.();
    } catch (error) {
      console.error('[FirestorePersistenceProvider] persist error:', error);
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.persistTimeout !== null) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
      if (this.synced) void this.persist();
    }
    this.ydoc.off('update', this.updateHandler);
  }
}
