/**
 * InfoOverlay — bottom-left debug/status panel showing zoom, pan, object count, etc.
 * Memoized: re-renders only when its numeric/boolean props change, not on every
 * Canvas mouse-move re-render.
 */

import { memo } from 'react';

interface InfoOverlayProps {
  stageScale: number;
  stagePos: { x: number; y: number };
  objectCount: number;
  usersOnline: number;
  loading: boolean;
}

export default memo(function InfoOverlay({
  stageScale,
  stagePos,
  objectCount,
  usersOnline,
  loading,
}: InfoOverlayProps) {
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 20,
      background: 'rgba(0,0,0,0.7)', color: 'white',
      padding: '10px 15px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace',
    }}>
      <div>Zoom: {(stageScale * 100).toFixed(0)}%</div>
      <div>Pan: ({Math.round(stagePos.x)}, {Math.round(stagePos.y)})</div>
      <div>Objects: {objectCount}</div>
      <div style={{ color: '#4ECDC4' }}>Users Online: {usersOnline}</div>
      <div style={{ marginTop: 8, opacity: 0.7, fontSize: 11 }}>
        • Drag canvas to pan<br />
        • Scroll to zoom<br />
        • Double-click to create<br />
        • Click shape to select
      </div>
      {loading && <div style={{ marginTop: 8, color: '#4ECDC4' }}>Syncing…</div>}
    </div>
  );
});
