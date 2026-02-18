/**
 * WebRTC provider factory for P2P Yjs sync.
 *
 * Uses y-webrtc to establish peer-to-peer connections between clients
 * sharing the same board. The signaling server is configurable via
 * the VITE_SIGNALING_SERVERS environment variable.
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const DEFAULT_SIGNALING = ['ws://localhost:4444'];

export function createWebrtcProvider(ydoc: Y.Doc, boardId: string): WebrtcProvider {
  const signalingEnv = import.meta.env.VITE_SIGNALING_SERVERS as string | undefined;
  const signaling = signalingEnv
    ? signalingEnv.split(',').map((s) => s.trim())
    : DEFAULT_SIGNALING;

  return new WebrtcProvider(`collab-board-${boardId}`, ydoc, {
    signaling,
  });
}
