/**
 * LinePreview — dashed ghost line from the confirmed first vertex to the
 * live cursor. Shown only during the two-step line placement flow, before
 * the second double-click. `listening={false}` so it never captures events.
 * Memoized: endpoint coords change frequently; React.memo prevents the Konva
 * Line from being recreated when unrelated Canvas state updates.
 */
import { memo } from 'react';
import { Line } from 'react-konva';

interface Props { x1: number; y1: number; x2: number; y2: number; }

export default memo(function LinePreview({ x1, y1, x2, y2 }: Props) {
  return (
    <Line
      points={[x1, y1, x2, y2]}
      stroke="#4ECDC4"
      strokeWidth={2}
      dash={[6, 4]}
      lineCap="round"
      opacity={0.7}
      listening={false}
    />
  );
});
