/**
 * StickyNote shape — sticky note with text content and double-click to edit.
 */

import { Rect, Text } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps, BoardObject } from '../../types/board';

interface StickyNoteProps extends ShapeProps {
  onStartEdit: (data: BoardObject) => void;
  /** Set true while the inline textarea overlay is active — hides the Konva Text */
  isInlineEditing?: boolean;
}

export default function StickyNote({ onStartEdit, isInlineEditing, ...props }: StickyNoteProps) {
  const { data, isSelected } = props;

  return (
    <BaseShape
      {...props}
      minWidth={100}
      minHeight={80}
      onDblClick={() => onStartEdit(data)}
    >
      {(w, h) => (
        <>
          <Rect
            width={w}
            height={h}
            fill={data.color}
            stroke={isSelected ? '#4ECDC4' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
            cornerRadius={8}
            shadowBlur={10}
            shadowColor="rgba(0,0,0,0.2)"
            shadowOffset={{ x: 2, y: 2 }}
          />
          {/* Hidden while the HTML textarea overlay is active */}
          {!isInlineEditing && (
            <Text
              x={10}
              y={10}
              width={w - 20}
              height={h - 20}
              text={data.content ?? ''}
              fontSize={data.fontSize ?? 16}
              fill="#333"
              align="left"
              verticalAlign="top"
              wrap="word"
            />
          )}
        </>
      )}
    </BaseShape>
  );
}
