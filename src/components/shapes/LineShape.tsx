/**
 * LineShape — a straight line with two draggable endpoints.
 * Does NOT use BaseShape (entirely different interaction model).
 * Points stored as absolute canvas coords: [x1, y1, x2, y2].
 */

import { useState } from 'react';
import { Group, Line, Circle, Text } from 'react-konva';
import type { ShapeProps } from '../../types/board';

export default function LineShape({ id, data, isSelected, onSelect, onUpdate, onDelete }: ShapeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const pts = data.points ?? [data.x, data.y, data.x + 200, data.y];
  const [x1, y1, x2, y2] = pts;

  // Mid-point for delete button
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const handleEndpointDrag = (index: 0 | 1, e: any) => {
    const newPts = [...pts];
    newPts[index * 2]     = e.target.x();
    newPts[index * 2 + 1] = e.target.y();
    onUpdate(data.id, { points: newPts, x: newPts[0], y: newPts[1] });
  };

  return (
    <Group
      id={id}
      name="object"
      onClick={() => onSelect(data.id)}
      onTap={() => onSelect(data.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* The line itself */}
      <Line
        points={pts}
        stroke={isSelected ? '#4ECDC4' : (data.strokeColor ?? data.color ?? '#333')}
        strokeWidth={(data.strokeWidth ?? 2) * (isSelected ? 1.5 : 1)}
        lineCap="round"
        hitStrokeWidth={12}
      />

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

      {/* Delete button at midpoint (on hover) */}
      {isHovered && (
        <Group
          x={mx}
          y={my - 20}
          onClick={(e: any) => { e.cancelBubble = true; onDelete(data.id); }}
          onTap={(e: any)   => { e.cancelBubble = true; onDelete(data.id); }}
        >
          <Circle radius={10} fill="#ff6b6b" shadowBlur={4} shadowColor="rgba(0,0,0,0.3)" />
          <Text x={-5} y={-6} text="✕" fontSize={12} fill="white" fontStyle="bold" />
        </Group>
      )}
    </Group>
  );
}
