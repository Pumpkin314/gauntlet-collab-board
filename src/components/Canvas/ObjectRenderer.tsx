/**
 * ObjectRenderer
 *
 * Maps the `objects` array to shape components via the shape registry.
 * Passes selectedIds (Set) so each shape knows if it's selected.
 * onSelect now receives (id, nativeEvent) so Canvas can detect shift+click.
 */

import { memo, useEffect } from 'react';
import type { BoardObject } from '../../types/board';
import { getShapeEntry } from '../../utils/shapeRegistry';
import type {} from '../../test-bridge'; // pull in Window.__perfBridge declaration

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';

interface ObjectRendererProps {
  objects: BoardObject[];
  selectedIds: Set<string>;
  inlineEditId: string | null;
  onSelect: (id: string, e?: unknown) => void;
  onUpdate: (id: string, updates: Partial<BoardObject>) => void;
  onDelete: (id: string) => void;
  onShowColorPicker: (id: string, pos: { x: number; y: number }) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  onDimsChanged: () => void;
  onStartEdit: (data: BoardObject) => void;
  stageScaleRef?: React.RefObject<number>;
}

export default memo(function ObjectRenderer({
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
  stageScaleRef,
}: ObjectRendererProps) {
  useEffect(() => {
    if (isTestMode && window.__perfBridge) {
      window.__perfBridge.renderCount++;
    }
  });

  const disableShadows = objects.length > 20;

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
          disableShadows,
        };

        const extraProps: Record<string, unknown> = {};
        if (obj.type === 'sticky' || obj.type === 'text' || obj.type === 'frame') {
          extraProps.onStartEdit     = onStartEdit;
          extraProps.isInlineEditing = inlineEditId === obj.id;
        }
        if (obj.type === 'line') {
          extraProps.visibleObjects = objects;
          extraProps.stageScaleRef  = stageScaleRef;
        }

        return <ShapeComponent key={obj.id} {...sharedProps} {...extraProps} />;
      })}
    </>
  );
});
