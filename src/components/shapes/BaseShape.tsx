/**
 * BaseShape
 *
 * Shared foundation for all board shapes (sticky, rect, circle, text, …).
 * Handles: drag, transform (resize/rotate), hover menu (delete + color picker),
 * and the localWidth/localHeight pattern that prevents the transformer flash.
 *
 * Usage:
 *   <BaseShape {...shapeProps} minWidth={100} minHeight={80} onDblClick={...}>
 *     {(w, h) => <Rect width={w} height={h} fill={data.color} />}
 *   </BaseShape>
 */

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Group, Circle, Text } from 'react-konva';
import type { ShapeProps } from '../../types/board';

interface BaseShapeProps extends ShapeProps {
  minWidth?: number;
  minHeight?: number;
  /** Called on Konva dblclick; used by StickyNote to open the edit modal */
  onDblClick?: () => void;
  children: (width: number, height: number) => ReactNode;
}

export default function BaseShape({
  id,
  data,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onShowColorPicker,
  onTransformStart,
  onTransformEnd,
  onDimsChanged,
  onDblClick,
  minWidth  = 40,
  minHeight = 40,
  children,
}: BaseShapeProps) {
  const groupRef = useRef<any>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Local dimensions — updated immediately on resize so the transformer
  // never sees a stale bounding box (no Yjs round-trip needed).
  const [localWidth,  setLocalWidth]  = useState(data.width);
  const [localHeight, setLocalHeight] = useState(data.height);

  // Keep local dims in sync when remote updates arrive
  useEffect(() => {
    setLocalWidth(data.width);
    setLocalHeight(data.height);
  }, [data.width, data.height]);

  // After React commits new dims to Konva, tell the Transformer to recalculate
  useEffect(() => {
    if (isSelected && onDimsChanged) {
      onDimsChanged();
    }
  }, [localWidth, localHeight]);

  const handleDragEnd = (e: any) => {
    const node = e.target;
    onUpdate(data.id, { x: node.x(), y: node.y() });
  };

  const handleTransformEnd = () => {
    const node = groupRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth  = Math.max(minWidth,  localWidth  * scaleX);
    const newHeight = Math.max(minHeight, localHeight * scaleY);

    node.scaleX(1);
    node.scaleY(1);

    setLocalWidth(newWidth);
    setLocalHeight(newHeight);

    onUpdate(data.id, {
      x:        node.x(),
      y:        node.y(),
      width:    newWidth,
      height:   newHeight,
      rotation: node.rotation(),
    });

    onTransformEnd?.();
  };

  return (
    <Group
      id={id}
      name="object"
      ref={groupRef}
      x={data.x}
      y={data.y}
      rotation={data.rotation ?? 0}
      draggable
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(data.id)}
      onTap={() => onSelect(data.id)}
      onDblClick={onDblClick}
      onTransformStart={onTransformStart}
      onTransformEnd={handleTransformEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Shape visual — provided by the concrete shape component */}
      {children(localWidth, localHeight)}

      {/* Hover menu */}
      {isHovered && (
        <>
          {/* Delete button */}
          <Group
            x={localWidth - 25}
            y={5}
            onClick={(e: any) => { e.cancelBubble = true; onDelete(data.id); }}
            onTap={(e: any)   => { e.cancelBubble = true; onDelete(data.id); }}
          >
            <Circle radius={10} fill="#ff6b6b" shadowBlur={4} shadowColor="rgba(0,0,0,0.3)" />
            <Text x={-5} y={-6} text="✕" fontSize={12} fill="white" fontStyle="bold" />
          </Group>

          {/* Color picker button */}
          <Group
            x={localWidth - 50}
            y={5}
            onClick={(e: any) => {
              e.cancelBubble = true;
              const pos = e.target.getStage().getPointerPosition();
              onShowColorPicker(data.id, pos);
            }}
            onTap={(e: any) => {
              e.cancelBubble = true;
              const pos = e.target.getStage().getPointerPosition();
              onShowColorPicker(data.id, pos);
            }}
          >
            <Circle radius={10} fill="#4ECDC4" shadowBlur={4} shadowColor="rgba(0,0,0,0.3)" />
            <Text x={-3} y={-6} text="⋮" fontSize={12} fill="white" fontStyle="bold" />
          </Group>
        </>
      )}
    </Group>
  );
}
