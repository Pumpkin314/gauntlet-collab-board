/**
 * ColorPicker — floating color palette popover anchored to a shape's hover menu.
 * Memoized: only re-renders when noteId/position/callbacks change.
 */

import { memo } from 'react';

const COLOR_PALETTE = [
  '#FFE66D', '#FF6B6B', '#4ECDC4', '#95E1D3',
  '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
];

interface ColorPickerProps {
  noteId: string | null;
  position: { x: number; y: number };
  onColorChange: (color: string) => void;
  onClose: () => void;
}

export default memo(function ColorPicker({ noteId, position, onColorChange, onClose }: ColorPickerProps) {
  if (!noteId) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute', left: position.x, top: position.y,
          background: 'white', borderRadius: 12, padding: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 2000,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}
      >
        {COLOR_PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            style={{
              width: 40, height: 40, background: color,
              border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer',
              transition: 'transform 0.2s ease',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.transform = 'scale(1.1)')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.transform = 'scale(1)')}
            title={color}
          />
        ))}
      </div>
    </>
  );
});
