import { memo } from 'react';
import { Rect, Text, Group } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps } from '../../types/board';

const FRONTIER_STROKE = '#2196F3';
const PROVISIONAL_STROKE = '#388E3C';

export default memo(function KnowledgeNodeShape(props: ShapeProps) {
  const { data, isSelected } = props;
  const isFrontier = data.kgConfidence === 'unexplored';
  const isProvisional = data.kgConfidence === 'provisional';

  return (
    <BaseShape
      {...props}
      minWidth={140}
      minHeight={60}
    >
      {(w, h) => (
        <>
          <Rect
            width={w}
            height={h}
            fill={data.color}
            stroke={isSelected ? '#4ECDC4' : isFrontier ? FRONTIER_STROKE : isProvisional ? PROVISIONAL_STROKE : '#666'}
            strokeWidth={isSelected ? 3 : isFrontier ? 2.5 : isProvisional ? 2.5 : 1.5}
            dash={isProvisional && !isSelected ? [8, 4] : undefined}
            cornerRadius={12}
            shadowBlur={isFrontier ? 8 : 4}
            shadowColor={isFrontier ? 'rgba(33,150,243,0.4)' : 'rgba(0,0,0,0.15)'}
            shadowOffset={{ x: 1, y: 2 }}
          />
          {/* Description text */}
          <Text
            x={10}
            y={data.kgGradeLevel ? 24 : 10}
            width={w - 20}
            height={h - (data.kgGradeLevel ? 34 : 20)}
            text={data.content ?? ''}
            fontSize={13}
            fill={data.kgConfidence === 'gap' || data.kgConfidence === 'mastered' ? '#fff' : '#333'}
            align="left"
            verticalAlign="top"
            wrap="word"
            ellipsis
          />
          {/* Grade level pill */}
          {data.kgGradeLevel && (
            <Group x={8} y={6}>
              <Rect
                width={50}
                height={16}
                fill="rgba(0,0,0,0.15)"
                cornerRadius={8}
              />
              <Text
                x={4}
                y={2}
                width={42}
                height={14}
                text={`Grade ${data.kgGradeLevel}`}
                fontSize={9}
                fill={data.kgConfidence === 'gap' || data.kgConfidence === 'mastered' ? '#fff' : '#555'}
                align="center"
                fontStyle="bold"
              />
            </Group>
          )}
        </>
      )}
    </BaseShape>
  );
});
