/**
 * DebugOverlay — togglable panel showing detailed P2P/sync/presence diagnostics.
 * Press ` (backtick) to toggle.
 */

import { useState, useEffect, useRef } from 'react';
import { useBoard } from '../../contexts/BoardContext';
import { useDebug } from '../../contexts/DebugContext';
import type { DebugInfo } from '../../contexts/DebugContext';

interface DebugOverlayProps {
  stageScale: number;
  stagePos: { x: number; y: number };
}

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as Intl.DateTimeFormatOptions);
}

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, verticalAlign: 'middle',
    }} />
  );
}

export default function DebugOverlay({ stageScale, stagePos }: DebugOverlayProps) {
  const { presence, objects } = useBoard();
  const { debugInfo, localCursorRef, yjsLatencyMs, yjsReceiveGapMs, yjsLatestSampleMs, yjsReceiveRate, yjsSendRate, p2pOnly } = useDebug();
  const [visible, setVisible] = useState(false);
  const [fps, setFps] = useState(0);
  const [localCursor, setLocalCursor] = useState({ x: 0, y: 0 });
  const frameTimesRef = useRef<number[]>([]);

  // FPS counter + cursor position sampled from localCursorRef.
  // Cursor position lives in a ref (not state) in BoardContext to avoid a
  // React re-render on every mouse-move; we read it here once per frame.
  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      const times = frameTimesRef.current;
      times.push(now);
      // Keep last 1 second of frame timestamps
      while (times.length > 0 && times[0] <= now - 1000) times.shift();
      setFps(times.length);
      setLocalCursor({ ...localCursorRef.current });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [localCursorRef]);

  /**
   * Rolling 1-second latency average per remote cursor.
   * Each time remoteCursors updates (awareness event), we push the raw sample
   * into a per-user ring buffer and evict samples older than 1 s, then
   * recompute averages. This smooths the spiky per-sample values.
   */
  const latHistoryRef = useRef<Map<string, Array<{ t: number; ms: number }>>>(new Map());
  const [avgLatencies, setAvgLatencies] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const now = Date.now();
    const history = latHistoryRef.current;
    const WINDOW = 1000;

    debugInfo.remoteCursors.forEach((c) => {
      if (c.latencyMs === undefined) return;
      const samples = history.get(c.userId) ?? [];
      samples.push({ t: now, ms: c.latencyMs });
      history.set(c.userId, samples.filter((s) => s.t > now - WINDOW));
    });

    // Clean up entries for cursors that have gone away
    const active = new Set(debugInfo.remoteCursors.map((c) => c.userId));
    for (const key of history.keys()) {
      if (!active.has(key)) history.delete(key);
    }

    const next = new Map<string, number>();
    history.forEach((samples, userId) => {
      if (samples.length === 0) return;
      next.set(userId, Math.round(samples.reduce((s, e) => s + e.ms, 0) / samples.length));
    });
    setAvgLatencies(next);
  }, [debugInfo.remoteCursors]);

  // Backtick (`) keyboard shortcut to toggle the debug panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' && !(e.target as HTMLElement).closest('input, textarea')) {
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!visible) {
    return (
      <div style={{
        position: 'absolute', top: 60, right: 20,
        background: 'rgba(0,0,0,0.5)', color: '#aaa',
        padding: '4px 8px', borderRadius: 4, fontSize: 11,
        fontFamily: 'monospace', cursor: 'pointer', zIndex: 2000,
      }} onClick={() => setVisible(true)}>
        DEBUG [`]
      </div>
    );
  }

  const d = debugInfo;

  const webrtcColor = d.webrtcConnected ? '#4f4' : '#f44';
  const firestoreColor = d.firestoreSynced ? '#4f4' : '#fa0';
  const presColor = d.presenceSource === 'webrtc'
    ? '#4ff'
    : d.presenceSource === 'yjs'
      ? '#6f6'
      : d.presenceSource === 'firestore'
        ? '#fa0'
        : '#f44';
  const fpsColor = fps >= 55 ? '#4f4' : fps >= 30 ? '#fa0' : '#f44';

  return (
    <div data-testid="debug-overlay" style={{
      position: 'absolute', top: 60, right: 20, width: 320,
      background: 'rgba(0,0,0,0.88)', color: '#ddd',
      padding: 12, borderRadius: 8, fontSize: 11,
      fontFamily: 'monospace', zIndex: 2000, lineHeight: 1.6,
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold', color: '#fff', fontSize: 12 }}>DEBUG PANEL</span>
        <span style={{ cursor: 'pointer', color: '#888' }} onClick={() => setVisible(false)}>
          [close]
        </span>
      </div>

      {/* Performance */}
      <Section title="Performance">
        <Row label="FPS" value={<span style={{ color: fpsColor }}>{fps}</span>} />
        <Row label="Objects" value={objects.length} />
      </Section>

      {/* Connection */}
      <Section title="Connection">
        <Row label="WebRTC" value={
          <><Dot color={webrtcColor} />{d.webrtcConnected ? 'connected' : 'disconnected'}</>
        } />
        <Row label="WebRTC synced" value={d.webrtcSynced ? 'yes' : 'no'} />
        <Row label="WebRTC peers" value={d.webrtcPeerCount} />
        <Row label="Connected peers" value={d.webrtcConnectedPeerCount} />
        <Row label="Synced peers" value={d.webrtcSyncedPeerCount} />
        <Row label="Path" value={`${d.webrtcPath} (d:${d.webrtcDirectPeerCount} r:${d.webrtcRelayPeerCount})`} />
        <Row label="BC peers" value={d.bcPeerCount} />
        <Row label="Signaling" value={d.signalingStatus} />
        <Row label="Signaling URL" value={d.signalingUrl || '—'} />
        <Row label="Yjs client ID" value={d.ydocClientId ?? '—'} />
      </Section>

      {/* Sync */}
      <Section title="Firestore Sync">
        <Row label="Status" value={
          <><Dot color={firestoreColor} />{d.firestoreSynced ? 'synced' : 'syncing...'}</>
        } />
        <Row label="Writes" value={d.firestoreWriteCount} />
        <Row label="Last write" value={formatTime(d.lastFirestoreWrite)} />
      </Section>

      {/* Presence */}
      <Section title="Presence">
        <Row label="Source" value={
          <><Dot color={presColor} />{d.presenceSource}</>
        } />
        <Row label="Awareness (raw/valid)" value={`${d.awarenessRawRemoteCount + 1} / ${d.remoteCursors.length + 1}`} />
        <Row label="Awareness states" value={d.awarenessStatesSize} />
        <Row label="Awareness last" value={
          d.awarenessLastUpdate
            ? `${d.awarenessLastUpdate.origin} +${d.awarenessLastUpdate.added} ~${d.awarenessLastUpdate.updated} -${d.awarenessLastUpdate.removed}`
            : '—'
        } />
        <Row label="Local set count" value={d.awarenessLocalSetCount} />
        <Row label="P2P gate" value={
          <><Dot color={d.p2pGateActive ? '#4f4' : '#f44'} />
            {d.p2pGateActive ? 'active (Firestore blocked)' : 'open (Firestore running)'}</>
        } />
        <Row
          label="Presence list"
          value={d.p2pGateActive ? 'p2p (awareness/yjs)' : 'firestore'}
        />
        <Row label="Remote users" value={presence.length} />
      </Section>

      {/* Cursors */}
      <Section title="Cursors">
        <Row label="Local" value={`(${Math.round(localCursor.x)}, ${Math.round(localCursor.y)})`} />
        <Row label="P2P only" value={p2pOnly ? 'on' : 'off'} />
        <Row label="Yjs latency" value={yjsLatencyMs !== null ? `${yjsLatencyMs}ms` : '—'} />
        <Row label="Yjs last sample" value={yjsLatestSampleMs !== null ? `${yjsLatestSampleMs}ms` : '—'} />
        <Row label="Yjs receive gap" value={yjsReceiveGapMs !== null ? `${yjsReceiveGapMs}ms` : '—'} />
        <Row label="Yjs recv rate" value={`${yjsReceiveRate}/s`} />
        <Row label="Yjs send rate" value={`${yjsSendRate}/s`} />
        {d.remoteCursors.map((c) => {
          const avgMs = avgLatencies.get(c.userId);
          const sampleCount = latHistoryRef.current.get(c.userId)?.length ?? 0;
          // No latencyMs means cursor arrived via Firestore (no ts stamp) — show path instead
          const noTs = c.latencyMs === undefined;
          const latColor = avgMs === undefined ? '#aaa' : avgMs < 20 ? '#4f4' : avgMs < 100 ? '#fa0' : '#f44';
          const latLabel = noTs ? '(fs path)' : avgMs === undefined ? `—(n=${sampleCount})` : `${avgMs}ms (n=${sampleCount})`;
          return (
            <Row
              key={c.userId}
              label={c.userName}
              value={
                <>
                  {`(${Math.round(c.x)}, ${Math.round(c.y)})`}
                  <span style={{ marginLeft: 8, color: latColor }}>
                    {latLabel}
                  </span>
                </>
              }
            />
          );
        })}
        {d.remoteCursors.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>no remote cursors</div>
        )}
      </Section>

      {/* Viewport */}
      <Section title="Viewport">
        <Row label="Zoom" value={`${(stageScale * 100).toFixed(0)}%`} />
        <Row label="Pan" value={`(${Math.round(stagePos.x)}, ${Math.round(stagePos.y)})`} />
      </Section>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ color: '#ddd' }}>{value}</span>
    </div>
  );
}
