/**
 * DebugOverlay — togglable panel showing detailed P2P/sync/presence diagnostics.
 * Press ` (backtick) to toggle.
 */

import { useState, useEffect, useRef } from 'react';
import { useBoard } from '../../contexts/BoardContext';
import type { DebugInfo } from '../../contexts/BoardContext';

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
  const { debugInfo, presence, objects } = useBoard();
  const [visible, setVisible] = useState(false);
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);

  // Toggle with backtick key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' && !e.target || !(e.target as HTMLElement).closest?.('input, textarea')) {
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // FPS counter
  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      const times = frameTimesRef.current;
      times.push(now);
      // Keep last 1 second of frame timestamps
      while (times.length > 0 && times[0] <= now - 1000) times.shift();
      setFps(times.length);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
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
  const presColor = d.presenceSource === 'webrtc' ? '#4ff' : d.presenceSource === 'firestore' ? '#fa0' : '#f44';
  const fpsColor = fps >= 55 ? '#4f4' : fps >= 30 ? '#fa0' : '#f44';

  return (
    <div style={{
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
        <Row label="WebRTC peers" value={d.webrtcPeerCount} />
        <Row label="BC peers" value={d.bcPeerCount} />
        <Row label="Signaling" value={d.signalingStatus} />
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
        <Row label="Awareness clients" value={d.awarenessClientCount} />
        <Row label="Remote users" value={presence.length} />
      </Section>

      {/* Cursors */}
      <Section title="Cursors">
        <Row label="Local" value={`(${Math.round(d.localCursor.x)}, ${Math.round(d.localCursor.y)})`} />
        {d.remoteCursors.map((c) => (
          <Row key={c.userId} label={c.userName} value={`(${Math.round(c.x)}, ${Math.round(c.y)})`} />
        ))}
        {d.remoteCursors.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>no remote cursors</div>
        )}
      </Section>

      {/* Viewport */}
      <Section title="Viewport">
        <Row label="Zoom" value={`${(stageScale * 100).toFixed(0)}%`} />
        <Row label="Pan" value={`(${Math.round(stagePos.x)}, ${Math.round(stagePos.y)})`} />
      </Section>

      <div style={{ marginTop: 8, color: '#555', fontSize: 10, textAlign: 'center' }}>
        Press ` to toggle
      </div>
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
