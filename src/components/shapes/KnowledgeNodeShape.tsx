import { memo } from 'react';
import { Rect, Text, Group } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps } from '../../types/board';

const CONFIDENCE_FILLS: Record<string, string> = {
  unexplored: '#E0E0E0',
  mastered: '#4CAF50',
  shaky: '#FFC107',
  gap: '#EF5350',
  provisional: '#A5D6A7',
};

const CONFIDENCE_STROKES: Record<string, string> = {
  unexplored: '#BDBDBD',
  mastered: '#388E3C',
  shaky: '#F9A825',
  gap: '#C62828',
  provisional: '#388E3C',
};

export default memo(function KnowledgeNodeShape(props: ShapeProps) {
  const { data, isSelected } = props;
  const confidence = data.kgConfidence ?? 'unexplored';
  const fill = CONFIDENCE_FILLS[confidence] ?? '#E0E0E0';
  const stroke = CONFIDENCE_STROKES[confidence] ?? '#BDBDBD';
  const isDark = confidence === 'gap' || confidence === 'mastered';
  const remainingCount = (data.kgRemainingChildren ?? 0) + (data.kgRemainingPrereqs ?? 0);

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
            fill={fill}
            stroke={isSelected ? '#4ECDC4' : stroke}
            strokeWidth={isSelected ? 3 : 1.5}
            cornerRadius={12}
            shadowBlur={4}
            shadowColor="rgba(0,0,0,0.15)"
            shadowOffset={{ x: 1, y: 2 }}
          />
          <Text
            x={10}
            y={data.kgGradeLevel ? 24 : 10}
            width={w - 20}
            height={h - (data.kgGradeLevel ? 34 : 20)}
            text={data.content ?? ''}
            fontSize={13}
            fill={isDark ? '#fff' : '#333'}
            align="left"
            verticalAlign="top"
            wrap="word"
            ellipsis
          />
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
                fill={isDark ? '#fff' : '#555'}
                align="center"
                fontStyle="bold"
              />
            </Group>
          )}
          {/* "+N more" badge */}
          {remainingCount > 0 && (
            <Group x={w - 52} y={h - 20}>
              <Rect
                width={48}
                height={16}
                fill="#7C4DFF"
                cornerRadius={8}
              />
              <Text
                x={4}
                y={2}
                width={40}
                height={14}
                text={`+${remainingCount} more`}
                fontSize={9}
                fill="#fff"
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
