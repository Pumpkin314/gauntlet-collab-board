/**
 * SelectionRect — semi-transparent drag-selection rectangle overlay.
 * Pure display: no state, no logic. Rendered only while a box-select
 * drag is in progress. `listening={false}` ensures it never intercepts
 * pointer events intended for shapes underneath.
 */
import { Rect } from 'react-konva';

interface Props { x: number; y: number; width: number; height: number; }

export default function SelectionRect({ x, y, width, height }: Props) {
  return (
    <Rect
      x={x} y={y} width={width} height={height}
      fill="rgba(78,205,196,0.15)"
      stroke="#4ECDC4"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
}
