/**
 * ObjectRenderer
 *
 * Maps the `objects` array to shape components via the shape registry.
 * Passes selectedIds (Set) so each shape knows if it's selected.
 * onSelect now receives (id, nativeEvent) so Canvas can detect shift+click.
 */

import type { BoardObject } from '../../types/board';
import { getShapeEntry } from '../../utils/shapeRegistry';

interface ObjectRendererProps {
  objects: BoardObject[];
  selectedIds: Set<string>;
  inlineEditId: string | null;
  onSelect: (id: string, e?: any) => void;
  onUpdate: (id: string, updates: Partial<BoardObject>) => void;
  onDelete: (id: string) => void;
  onShowColorPicker: (id: string, pos: { x: number; y: number }) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  onDimsChanged: () => void;
  onStartEdit: (data: BoardObject) => void;
}

export default function ObjectRenderer({
  objects,
  selectedIds,
  inlineEditId,
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

        const sharedProps = {
          id:               `note-${obj.id}`,
          data:             obj,
          isSelected:       selectedIds.has(obj.id),
          onSelect,
          onUpdate,
          onDelete,
          onShowColorPicker,
          onTransformStart,
          onTransformEnd,
          onDimsChanged,
        };

        const extraProps: Record<string, unknown> = {};
        if (obj.type === 'sticky' || obj.type === 'text') {
          extraProps.onStartEdit     = onStartEdit;
          extraProps.isInlineEditing = inlineEditId === obj.id;
        }

        return <ShapeComponent key={obj.id} {...sharedProps} {...extraProps} />;
      })}
    </>
  );
}
