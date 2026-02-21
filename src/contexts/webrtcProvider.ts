/**
 * WebRTC provider factory for P2P Yjs sync.
 *
 * Uses y-webrtc to establish peer-to-peer connections between clients
 * sharing the same board. The signaling server is configurable via
 * the VITE_SIGNALING_SERVERS environment variable.
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const DEFAULT_SIGNALING = ['ws://localhost:4445'];
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

function resolveIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (!raw) {
    console.warn(
      '[webrtcProvider] VITE_ICE_SERVERS not set — using STUN-only defaults. ' +
      'P2P will fail for users behind NAT/firewalls. Set VITE_ICE_SERVERS with TURN credentials for production.',
    );
    return DEFAULT_ICE_SERVERS;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('VITE_ICE_SERVERS must be a JSON array');
    const valid = parsed.filter((v): v is RTCIceServer => {
      if (!v || typeof v !== 'object') return false;
      const urls = (v as Record<string, unknown>).urls;
      return typeof urls === 'string' || Array.isArray(urls);
    });
    if (valid.length === 0) throw new Error('VITE_ICE_SERVERS contained no valid entries');
    return valid;
  } catch (error) {
    console.warn('[webrtcProvider] invalid VITE_ICE_SERVERS, using defaults', error);
    return DEFAULT_ICE_SERVERS;
  }
}

function resolveIceTransportPolicy(): RTCIceTransportPolicy | undefined {
  const raw = import.meta.env.VITE_ICE_TRANSPORT_POLICY as string | undefined;
  if (!raw) return undefined;
  if (raw === 'all' || raw === 'relay') return raw;
  console.warn('[webrtcProvider] invalid VITE_ICE_TRANSPORT_POLICY, expected "all" or "relay"');
  return undefined;
}

export function createWebrtcProvider(
  ydoc: Y.Doc,
  boardId: string,
): { provider: WebrtcProvider; signalingUrl: string } {
  const signalingEnv = import.meta.env.VITE_SIGNALING_SERVERS as string | undefined;
  const signaling = signalingEnv
    ? signalingEnv.split(',').map((s) => s.trim())
    : DEFAULT_SIGNALING;
  const iceServers = resolveIceServers();
  const iceTransportPolicy = resolveIceTransportPolicy();

  return {
    provider: new WebrtcProvider(`collab-board-${boardId}`, ydoc, {
      signaling,
      peerOpts: {
        config: {
          iceServers,
          iceTransportPolicy,
          iceCandidatePoolSize: 8,
        },
      },
    }),
    signalingUrl: signaling[0],
  };
}
