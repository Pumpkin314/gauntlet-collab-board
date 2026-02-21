/**
 * FrameShape — a visual grouping container with dashed border and editable title.
 * Objects dragged fully inside a frame become its children and move with it.
 */

import { memo } from 'react';
import { Rect, Text } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps, BoardObject } from '../../types/board';

const TITLE_HEIGHT = 28;

interface FrameShapeProps extends ShapeProps {
  onStartEdit: (data: BoardObject) => void;
  isInlineEditing?: boolean;
}

export default memo(function FrameShape({ onStartEdit, isInlineEditing, ...props }: FrameShapeProps) {
  const { data, isSelected } = props;

  return (
    <BaseShape
      {...props}
      minWidth={200}
      minHeight={150}
      onDblClick={() => onStartEdit(data)}
    >
      {(w, h) => (
        <>
          {/* Background fill */}
          <Rect
            width={w}
            height={h}
            fill="rgba(240, 240, 240, 0.5)"
            stroke={isSelected ? '#4ECDC4' : '#999'}
            strokeWidth={isSelected ? 2.5 : 1.5}
            dash={[8, 4]}
            cornerRadius={4}
          />
          {/* Title bar area */}
          <Rect
            width={w}
            height={TITLE_HEIGHT}
            fill="rgba(230, 230, 230, 0.7)"
            cornerRadius={[4, 4, 0, 0]}
          />
          {/* Title text */}
          {!isInlineEditing && (
            <Text
              x={8}
              y={6}
              width={w - 16}
              height={TITLE_HEIGHT - 8}
              text={data.content ?? 'Frame'}
              fontSize={data.fontSize ?? 14}
              fontStyle="bold"
              fill="#555"
              align="left"
              verticalAlign="middle"
              ellipsis
              wrap="none"
            />
          )}
        </>
      )}
    </BaseShape>
  );
});
