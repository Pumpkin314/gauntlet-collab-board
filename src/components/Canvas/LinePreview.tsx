/**
 * LinePreview — dashed ghost line from the confirmed first vertex to the
 * live cursor. Shown only during the two-step line placement flow, before
 * the second double-click. `listening={false}` so it never captures events.
 */
import { Line } from 'react-konva';

interface Props { x1: number; y1: number; x2: number; y2: number; }

export default function LinePreview({ x1, y1, x2, y2 }: Props) {
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
}
