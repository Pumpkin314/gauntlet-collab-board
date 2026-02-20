/**
 * CircleShape — an ellipse with the standard BaseShape interaction model.
 * Konva Ellipse uses radiusX/radiusY; we derive them from width/height.
 */

import { memo } from 'react';
import { Ellipse } from 'react-konva';
import BaseShape from './BaseShape';
import type { ShapeProps } from '../../types/board';

export default memo(function CircleShape(props: ShapeProps) {
  const { data, isSelected } = props;

  return (
    <BaseShape {...props} minWidth={40} minHeight={40}>
      {(w, h) => (
        <Ellipse
          radiusX={w / 2}
          radiusY={h / 2}
          offsetX={-w / 2}
          offsetY={-h / 2}
          fill={data.color}
          stroke={isSelected ? '#4ECDC4' : '#333'}
          strokeWidth={isSelected ? 3 : 2}
          shadowBlur={8}
          shadowColor="rgba(0,0,0,0.2)"
          shadowOffset={{ x: 2, y: 2 }}
        />
      )}
    </BaseShape>
  );
});
