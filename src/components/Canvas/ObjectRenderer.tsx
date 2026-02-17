/**
 * ObjectRenderer
 *
 * Maps the `objects` array from BoardContext to the correct shape component
 * via the shape registry. Replaces the manual .filter(type === 'sticky') chains
 * in Canvas.jsx and makes adding new shape types zero-config here.
 */

import type { BoardObject } from '../../types/board';
import type { ShapeProps } from '../../types/board';
import { getShapeEntry } from '../../utils/shapeRegistry';

interface ObjectRendererProps {
  objects: BoardObject[];
  selectedId: string | null;
  onSelect: ShapeProps['onSelect'];
  onUpdate: ShapeProps['onUpdate'];
  onDelete: ShapeProps['onDelete'];
  onShowColorPicker: ShapeProps['onShowColorPicker'];
  onTransformStart?: ShapeProps['onTransformStart'];
  onTransformEnd?: ShapeProps['onTransformEnd'];
  onDimsChanged: () => void;
  // Sticky-note specific
  onStartEdit: (data: BoardObject) => void;
}

export default function ObjectRenderer({
  objects,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onShowColorPicker,
  onTransformStart,
  onTransformEnd,
  onDimsChanged,
  onStartEdit,
}: ObjectRendererProps) {
  return (
    <>
      {objects.map((obj) => {
        const entry = getShapeEntry(obj.type);
        if (!entry) return null;

        const { component: ShapeComponent } = entry;

        const sharedProps: ShapeProps = {
          id:               `note-${obj.id}`,
          data:             obj,
          isSelected:       selectedId === obj.id,
          onSelect,
          onUpdate,
          onDelete,
          onShowColorPicker,
          onTransformStart,
          onTransformEnd,
          onDimsChanged,
        };

        // Pass sticky-specific prop only when relevant
        const extraProps = obj.type === 'sticky' ? { onStartEdit } : {};

        return <ShapeComponent key={obj.id} {...sharedProps} {...extraProps} />;
      })}
    </>
  );
}
