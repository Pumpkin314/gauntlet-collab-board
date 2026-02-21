/**
 * RectShape — a plain resizable/draggable rectangle.
 */

import { memo } from 'react';
import { Rect } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps } from '../../types/board';

export default memo(function RectShape(props: ShapeProps) {
  const { data, isSelected, disableShadows } = props;

  return (
    <BaseShape {...props} minWidth={40} minHeight={40}>
      {(w, h) => (
        <Rect
          width={w}
          height={h}
          fill={data.color}
          stroke={isSelected ? '#4ECDC4' : '#333'}
          strokeWidth={isSelected ? 3 : 2}
          cornerRadius={4}
          shadowBlur={disableShadows ? 0 : 8}
          shadowColor="rgba(0,0,0,0.2)"
          shadowOffset={{ x: 2, y: 2 }}
        />
      )}
    </BaseShape>
  );
});
