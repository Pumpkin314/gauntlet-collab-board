/**
 * LinePreview — dashed ghost line from the confirmed first vertex to the
 * live cursor. Shown only during the two-step line placement flow, before
 * the second double-click. `listening={false}` so it never captures events.
 * Supports arrow variant preview via optional arrowStart/arrowEnd flags.
 */
import { memo } from 'react';
import { Line, Arrow } from 'react-konva';

export type LineVariant = 'line' | 'arrow' | 'double-arrow';

interface Props {
  x1: number; y1: number; x2: number; y2: number;
  lineVariant?: LineVariant;
}

export default memo(function LinePreview({ x1, y1, x2, y2, lineVariant = 'line' }: Props) {
  const common = {
    stroke: '#4ECDC4',
    strokeWidth: 2,
    dash: [6, 4] as number[],
    lineCap: 'round' as const,
    opacity: 0.7,
    listening: false,
  };

  if (lineVariant === 'line') {
    return <Line points={[x1, y1, x2, y2]} {...common} />;
  }

  const isDoubleArrow = lineVariant === 'double-arrow';
  return (
    <Arrow
      points={[x1, y1, x2, y2]}
      {...common}
      fill="#4ECDC4"
      pointerLength={10}
      pointerWidth={10}
      pointerAtBeginning={isDoubleArrow}
    />
  );
});
