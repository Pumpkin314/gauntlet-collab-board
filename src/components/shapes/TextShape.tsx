/**
 * TextShape — a standalone text block with no background fill.
 * Supports inline editing via onStartEdit (same path as StickyNote).
 */

import { memo } from 'react';
import { Text, Rect } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps, BoardObject } from '../../types/board';

interface TextShapeProps extends ShapeProps {
  onStartEdit?: (data: BoardObject) => void;
  isInlineEditing?: boolean;
}

export default memo(function TextShape({ onStartEdit, isInlineEditing, ...props }: TextShapeProps) {
  const { data, isSelected } = props;

  return (
    <BaseShape
      {...props}
      minWidth={60}
      minHeight={24}
      onDblClick={onStartEdit ? () => onStartEdit(data) : undefined}
    >
      {(w, h) => (
        <>
          {/* Subtle selection/hover outline */}
          {isSelected && (
            <Rect
              width={w}
              height={h}
              fill="transparent"
              stroke="#4ECDC4"
              strokeWidth={2}
              dash={[6, 3]}
              cornerRadius={4}
            />
          )}
          {!isInlineEditing && (
            <Text
              x={4}
              y={4}
              width={w - 8}
              height={h - 8}
              text={data.content ?? 'Text'}
              fontSize={data.fontSize ?? 18}
              fill={data.color}
              align="left"
              verticalAlign="top"
              wrap="word"
            />
          )}
        </>
      )}
    </BaseShape>
  );
});
