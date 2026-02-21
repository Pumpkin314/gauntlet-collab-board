/**
 * LineShape — a straight line (or arrow) with two draggable endpoints.
 * Does NOT use BaseShape (entirely different interaction model).
 * Points stored as absolute canvas coords: [x1, y1, x2, y2].
 *
 * When arrowEnd/arrowStart flags are set, renders Konva's Arrow shape instead
 * of Line. Arrow always draws a pointer at end; pointerAtBeginning adds one at start.
 * For start-only arrows, we reverse the points so the "end" pointer appears at
 * the logical start position.
 */

import { memo, useEffect, useRef } from 'react';
import { Group, Line, Arrow, Circle } from 'react-konva';
import Konva from 'konva';
import type { ShapeProps } from '../../types/board';

export default memo(function LineShape({ id, data, isSelected, onSelect, onUpdate, onDelete }: ShapeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const pts = data.points ?? [data.x, data.y, data.x + 200, data.y];
  const [x1, y1, x2, y2] = pts;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (isSelected) {
      group.clearCache();
    } else {
      requestAnimationFrame(() => {
        if (groupRef.current && !isSelected) groupRef.current.cache();
      });
    }
  }, [isSelected, data.points, data.strokeColor, data.color, data.arrowStart, data.arrowEnd]);

  const handleEndpointDrag = (index: 0 | 1, e: any) => {
    const newPts = [...pts];
    newPts[index * 2]     = e.target.x();
    newPts[index * 2 + 1] = e.target.y();
    onUpdate(data.id, { points: newPts, x: newPts[0], y: newPts[1] });
  };

  const hasArrow = data.arrowStart || data.arrowEnd;
  const strokeColor = isSelected ? '#4ECDC4' : (data.strokeColor ?? data.color ?? '#333');
  const strokeWidth = (data.strokeWidth ?? 2) * (isSelected ? 1.5 : 1);

  const renderLine = () => {
    if (!hasArrow) {
      return (
        <Line
          points={pts}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineCap="round"
          hitStrokeWidth={12}
        />
      );
    }

    // start-only: reverse points so Arrow's end-pointer appears at logical start
    const startOnly = data.arrowStart && !data.arrowEnd;
    const renderPts = startOnly ? [x2, y2, x1, y1] : pts;
    const pointerAtBeginning = data.arrowStart && data.arrowEnd;

    return (
      <Arrow
        points={renderPts}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill={strokeColor}
        lineCap="round"
        hitStrokeWidth={12}
        pointerLength={10}
        pointerWidth={10}
        pointerAtBeginning={pointerAtBeginning}
      />
    );
  };

  return (
    <Group
      id={id}
      name="object"
      ref={groupRef}
      onClick={() => onSelect(data.id)}
      onTap={() => onSelect(data.id)}
    >
      {renderLine()}

      {/* Endpoint handles */}
      {[0, 1].map((i) => (
        <Circle
          key={i}
          x={pts[i * 2]}
          y={pts[i * 2 + 1]}
          radius={isSelected ? 7 : 0}
          fill="#4ECDC4"
          stroke="white"
          strokeWidth={2}
          draggable
          onDragEnd={(e) => handleEndpointDrag(i as 0 | 1, e)}
        />
      ))}

    </Group>
  );
});
