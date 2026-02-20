/**
 * DebugContext
 *
 * Isolated context for debug/telemetry state. Only DebugOverlay consumes this.
 * Extracted from BoardContext so that frequent debug setState calls (awareness
 * samples, latency metrics, rate counters) don't trigger re-renders on Canvas,
 * ObjectRenderer, or shape components.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode, MutableRefObject } from 'react';

// ── debug info type ───────────────────────────────────────────────────────

export interface DebugInfo {
  // Connection
  webrtcConnected: boolean;
  webrtcPeerCount: number;
  webrtcConnectedPeerCount: number;
  webrtcSyncedPeerCount: number;
  webrtcPath: 'direct' | 'relay' | 'mixed' | 'unknown';
  webrtcRelayPeerCount: number;
  webrtcDirectPeerCount: number;
  bcPeerCount: number;
  signalingStatus: string;
  signalingUrl: string;
  presenceSource: 'webrtc' | 'yjs' | 'firestore' | 'none';
  // Sync
  firestoreSynced: boolean;
  webrtcSynced: boolean;
  firestoreWriteCount: number;
  lastFirestoreWrite: number | null;
  ydocClientId: number | null;
  // Cursors
  remoteCursors: Array<{ userId: string; userName: string; x: number; y: number; latencyMs?: number }>;
  // Awareness
  awarenessClientCount: number;
  awarenessRawRemoteCount: number;
  awarenessStatesSize: number;
  awarenessLastUpdate: { added: number; updated: number; removed: number; origin: string } | null;
  awarenessLocalSetCount: number;
  p2pGateActive: boolean;
}

export const EMPTY_DEBUG: DebugInfo = {
  webrtcConnected: false,
  webrtcPeerCount: 0,
  webrtcConnectedPeerCount: 0,
  webrtcSyncedPeerCount: 0,
  webrtcPath: 'unknown',
  webrtcRelayPeerCount: 0,
  webrtcDirectPeerCount: 0,
  bcPeerCount: 0,
  signalingStatus: 'disconnected',
  signalingUrl: '',
  presenceSource: 'none',
  firestoreSynced: false,
  webrtcSynced: false,
  firestoreWriteCount: 0,
  lastFirestoreWrite: null,
  ydocClientId: null,
  remoteCursors: [],
  awarenessClientCount: 0,
  awarenessRawRemoteCount: 0,
  awarenessStatesSize: 0,
  awarenessLastUpdate: null,
  awarenessLocalSetCount: 0,
  p2pGateActive: false,
};

// ── context value ─────────────────────────────────────────────────────────

interface DebugContextValue {
  debugInfo: DebugInfo;
  yjsLatencyMs: number | null;
  yjsReceiveGapMs: number | null;
  yjsLatestSampleMs: number | null;
  yjsReceiveRate: number;
  yjsSendRate: number;
  p2pOnly: boolean;
  localCursorRef: MutableRefObject<{ x: number; y: number }>;
  debugInfoRef: { readonly current: DebugInfo };
  updateDebug: (patch: Partial<DebugInfo>) => void;
  setYjsLatencyMs: (v: number | null) => void;
  setYjsReceiveGapMs: (v: number | null) => void;
  setYjsLatestSampleMs: (v: number | null) => void;
  setYjsReceiveRate: (v: number) => void;
  setYjsSendRate: (v: number) => void;
  setP2pOnly: (v: boolean) => void;
}

const DebugContext = createContext<DebugContextValue | null>(null);

export function useDebug(): DebugContextValue {
  const ctx = useContext(DebugContext);
  if (!ctx) throw new Error('useDebug must be used within DebugProvider');
  return ctx;
}

// ── provider ──────────────────────────────────────────────────────────────

export function DebugProvider({ children }: { children: ReactNode }) {
  const localCursorRef = useRef({ x: 0, y: 0 });
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(EMPTY_DEBUG);
  const [yjsLatencyMs, setYjsLatencyMs] = useState<number | null>(null);
  const [yjsReceiveGapMs, setYjsReceiveGapMs] = useState<number | null>(null);
  const [yjsLatestSampleMs, setYjsLatestSampleMs] = useState<number | null>(null);
  const [yjsReceiveRate, setYjsReceiveRate] = useState(0);
  const [yjsSendRate, setYjsSendRate] = useState(0);
  const [p2pOnly, setP2pOnly] = useState(false);

  const debugRef = useRef<DebugInfo>(EMPTY_DEBUG);

  const updateDebug = useCallback((patch: Partial<DebugInfo>) => {
    debugRef.current = { ...debugRef.current, ...patch };
    setDebugInfo(debugRef.current);
  }, []);

  const value: DebugContextValue = {
    debugInfo,
    yjsLatencyMs,
    yjsReceiveGapMs,
    yjsLatestSampleMs,
    yjsReceiveRate,
    yjsSendRate,
    p2pOnly,
    localCursorRef,
    debugInfoRef: debugRef,
    updateDebug,
    setYjsLatencyMs,
    setYjsReceiveGapMs,
    setYjsLatestSampleMs,
    setYjsReceiveRate,
    setYjsSendRate,
    setP2pOnly,
  };

  return (
    <DebugContext.Provider value={value}>
      {children}
    </DebugContext.Provider>
  );
}
