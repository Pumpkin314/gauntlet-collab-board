/**
 * InfoOverlay — compact status pill showing zoom, pan, and object count.
 * Hovers to reveal instruction hints.
 */

import { memo } from 'react';

interface InfoOverlayProps {
  stageScale: number;
  stagePos: { x: number; y: number };
  objectCount: number;
  loading: boolean;
}

export default memo(function InfoOverlay({
  stageScale,
  stagePos,
  objectCount,
  loading,
}: InfoOverlayProps) {
  const zoomLabel = `${(stageScale * 100).toFixed(0)}%`;
  const panLabel = `(${Math.round(stagePos.x)}, ${Math.round(stagePos.y)})`;

  return (
    <div
      className="info-overlay-pill"
      style={{
        position: 'absolute',
        top: 20,
        left: 'calc(50% + 220px)',
        background: 'rgba(30,30,30,0.55)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#ccc',
        padding: '5px 12px',
        borderRadius: 20,
        fontSize: 11,
        fontFamily: 'monospace',
        zIndex: 1000,
        cursor: 'default',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .info-overlay-pill .info-details {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: max-height 0.25s ease, opacity 0.2s ease;
        }
        .info-overlay-pill:hover .info-details {
          max-height: 120px;
          opacity: 1;
        }
        @keyframes sync-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {loading && (
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#4ECDC4',
            animation: 'sync-pulse 1.2s ease-in-out infinite',
            flexShrink: 0,
          }} />
        )}
        <div style={{ display: 'flex', gap: 0, textAlign: 'center' }}>
          <span style={{ flex: 1 }}>{zoomLabel}</span>
          <span style={{ color: '#555', padding: '0 6px' }}>·</span>
          <span style={{ flex: 1 }}>{panLabel}</span>
          <span style={{ color: '#555', padding: '0 6px' }}>·</span>
          <span style={{ flex: 1 }}>{objectCount}</span>
        </div>
      </span>

      <div className="info-details" style={{ display: 'flex', gap: 0, marginTop: 4, fontSize: 9, color: '#666', fontStyle: 'italic' }}>
        <span style={{ flex: 1, textAlign: 'center' }}>zoom<br />(scroll)</span>
        <span style={{ padding: '0 6px', color: 'transparent' }}>·</span>
        <span style={{ flex: 1, textAlign: 'center' }}>pan<br />(drag)</span>
        <span style={{ padding: '0 6px', color: 'transparent' }}>·</span>
        <span style={{ flex: 1, textAlign: 'center' }}>obj<br />(2x click)</span>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.stageScale === next.stageScale
  && prev.stagePos.x === next.stagePos.x
  && prev.stagePos.y === next.stagePos.y
  && prev.objectCount === next.objectCount
  && prev.loading === next.loading
);
