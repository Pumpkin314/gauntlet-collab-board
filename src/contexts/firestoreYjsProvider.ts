/**
 * FirestoreYjsProvider
 *
 * Custom Yjs provider using Firestore as a persistence backend.
 * Yjs (in-memory CRDT) is the source of truth. Firestore stores
 * a single compacted snapshot — no unbounded incremental-update accumulation.
 *
 * Firestore structure (one doc per board):
 *   boards/{boardId}/ydoc/state
 *     state:     string   (base64-encoded full Y.Doc state)
 *     updatedAt: number
 *
 * Real-time flow:
 *   Local mutation → Y.Doc (CRDT merge) → debounced setDoc snapshot
 *   Remote change  → onSnapshot fires → Y.applyUpdate (CRDT merge) → React re-render
 *
 * CRDT safety: Y.applyUpdate is idempotent and commutative, so simultaneous
 * writes from multiple clients converge correctly even with last-write-wins Firestore.
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

export class FirestoreYjsProvider {
  private ydoc: Y.Doc;
  private boardId: string;
  private unsubscribe: (() => void) | null = null;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;
  private synced = false;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;

  /** Fired once after the initial Firestore snapshot is applied. */
  onSynced?: () => void;

  constructor(ydoc: Y.Doc, boardId: string) {
    this.ydoc = ydoc;
    this.boardId = boardId;

    // When the local doc mutates (not from Firestore), schedule a snapshot write
    this.updateHandler = (_update: Uint8Array, origin: unknown) => {
      if (origin === 'firestore') return;
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
          const { state } = snap.data() as { state: string };
          // Y.applyUpdate merges the remote snapshot into local state (CRDT-safe)
          Y.applyUpdate(this.ydoc, base64ToUint8(state), 'firestore');
        }

        // Signal ready after the first snapshot (may be empty for new boards)
        if (!this.synced) {
          this.synced = true;
          this.onSynced?.();
        }
      },
      (error) => {
        console.error('[FirestoreYjsProvider] snapshot error:', error);
      }
    );
  }

  private schedulePersist(): void {
    if (this.persistTimeout !== null) return; // coalesce: one write per quiescent period
    this.persistTimeout = setTimeout(() => {
      this.persistTimeout = null;
      void this.persist();
    }, 300);
  }

  private async persist(): Promise<void> {
    try {
      const snapshotRef = doc(db, `boards/${this.boardId}/ydoc/state`);
      const state = Y.encodeStateAsUpdate(this.ydoc);
      await setDoc(snapshotRef, {
        state: uint8ToBase64(state),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('[FirestoreYjsProvider] persist error:', error);
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
      void this.persist(); // flush final state on unmount
    }
    this.ydoc.off('update', this.updateHandler);
  }
}
