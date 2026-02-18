import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';
import { useSelection } from '../contexts/SelectionContext';
import Cursor from './Cursor';
import ObjectRenderer from './Canvas/ObjectRenderer';
import Toolbar from './Canvas/Toolbar';
import ColorPicker from './Canvas/ColorPicker';
import SelectionRect from './Canvas/SelectionRect';
import InfoOverlay from './Canvas/InfoOverlay';
import DebugOverlay from './Canvas/DebugOverlay';
import { registerShape } from '../utils/shapeRegistry';
import StickyNote from './shapes/StickyNote';
import RectShape from './shapes/RectShape';
import CircleShape from './shapes/CircleShape';
import TextShape from './shapes/TextShape';
import LineShape from './shapes/LineShape';

// ── Register all shape types ───────────────────────────────────────────────────
registerShape('sticky', {
  component: StickyNote,
  defaults:  { width: 200, height: 200, color: '#FFE66D', content: 'Double-click to edit' },
  minWidth: 100, minHeight: 80,
});
registerShape('rect', {
  component: RectShape,
  defaults:  { width: 160, height: 100, color: '#85C1E2' },
  minWidth: 40, minHeight: 40,
});
registerShape('circle', {
  component: CircleShape,
  defaults:  { width: 120, height: 120, color: '#AA96DA' },
  minWidth: 40, minHeight: 40,
});
registerShape('text', {
  component: TextShape,
  defaults:  { width: 200, height: 60, color: '#333333', content: 'Text' },
  minWidth: 60, minHeight: 24,
});
registerShape('line', {
  component: LineShape,
  defaults:  { width: 200, height: 0, color: '#333333', strokeWidth: 2 },
  minWidth: 0, minHeight: 0,
});

export default function Canvas() {
  const {
    objects, presence, createObject, updateObject,
    deleteObject, deleteAllObjects, updateCursorPosition, batchCreate, batchDelete, loading,
  } = useBoard();

  const { selectedIds, select, toggleSelect, setSelection, deselectAll, selectAll, isSelected } = useSelection();

  const [stagePos,        setStagePos]        = useState({ x: 0, y: 0 });
  const [stageScale,      setStageScale]      = useState(1);
  const [activeTool,      setActiveTool]      = useState('cursor');
  const [toolMode,        setToolMode]        = useState('infinite'); // 'infinite' | 'single'
  const [colorPickerNote, setColorPickerNote] = useState(null);
  const [colorPickerPos,  setColorPickerPos]  = useState({ x: 0, y: 0 });
  const [spaceHeld,       setSpaceHeld]       = useState(false);
  const [inlineEdit,      setInlineEdit]      = useState(null);

  const stageRef       = useRef(null);
  const transformerRef = useRef(null);
  const layerRef       = useRef(null);
  const clipboardRef   = useRef([]);
  // Box-select: rect state + ref to avoid stale closures in mousemove
  const [boxSelectRect,   setBoxSelectRect]   = useState(null); // {startX,startY,x,y,width,height}
  const isBoxDraggingRef = useRef(false);

  // ── Space-key pan override ────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea')) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ignore when typing in a text input
      if (e.target.closest('input, textarea')) return;

      const selected = [...selectedIds];

      // Delete / Backspace → delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length > 0) {
        e.preventDefault();
        batchDelete(selected);
        deselectAll();
        return;
      }

      // Escape → deselect all
      if (e.key === 'Escape') {
        deselectAll();
        setInlineEdit(null);
        return;
      }

      // Ctrl/Cmd + A → select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll(objects.map((o) => o.id));
        return;
      }

      // Ctrl/Cmd + C → copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.length > 0) {
        clipboardRef.current = objects.filter((o) => selected.includes(o.id));
        return;
      }

      // Ctrl/Cmd + V → paste with +20px offset
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault();
        const items = clipboardRef.current.map(({ type, x, y, ...rest }) => ({
          type, x: x + 20, y: y + 20, ...rest,
        }));
        const newIds = batchCreate(items);
        selectAll(newIds);
        // Update clipboard so repeated paste keeps offsetting
        clipboardRef.current = clipboardRef.current.map((o) => ({
          ...o, x: o.x + 20, y: o.y + 20,
        }));
        return;
      }

      // Ctrl/Cmd + D → duplicate (same as copy+paste)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selected.length > 0) {
        e.preventDefault();
        const items = objects
          .filter((o) => selected.includes(o.id))
          .map(({ type, x, y, ...rest }) => ({ type, x: x + 20, y: y + 20, ...rest }));
        const newIds = batchCreate(items);
        selectAll(newIds);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, objects, batchDelete, batchCreate, deselectAll, selectAll]);

  // ── Transformer: attach to selected non-line nodes ───────────────────────
  // Lines self-manage their handles (endpoint circles) so they must be
  // excluded; otherwise the Transformer shows redundant handles over them.
  useEffect(() => {
    if (!transformerRef.current || !layerRef.current) return;

    if (selectedIds.size > 0) {
      const nodes = [...selectedIds]
        .map((id) => {
          const obj = objects.find((o) => o.id === id);
          if (obj?.type === 'line') return null;
          return layerRef.current.findOne(`#note-${id}`);
        })
        .filter(Boolean);
      transformerRef.current.nodes(nodes);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds, objects]);

  // ── Tool change handlers ─────────────────────────────────────────────────
  // Switching to a different tool always resets mode to infinite.
  const handleToolChange = (tool) => {
    setActiveTool(tool);
    setToolMode('infinite');
  };

  // Clicking the already-active tool button flips the mode.
  const handleModeToggle = () => {
    setToolMode((prev) => (prev === 'infinite' ? 'single' : 'infinite'));
  };

  // box-select drag draws a selection rect instead of panning; all other tools pan.
  const isDraggable = activeTool !== 'box-select' || spaceHeld;

  // ── Box-select drag ───────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (activeTool !== 'box-select') return;
    if (e.target !== e.target.getStage()) return;
    const pointer = stageRef.current.getPointerPosition();
    const cx = (pointer.x - stagePos.x) / stageScale;
    const cy = (pointer.y - stagePos.y) / stageScale;
    isBoxDraggingRef.current = true;
    setBoxSelectRect({ startX: cx, startY: cy, x: cx, y: cy, width: 0, height: 0 });
  };

  const handleMouseUp = () => {
    if (!isBoxDraggingRef.current || !boxSelectRect) return;
    isBoxDraggingRef.current = false;
    const { x, y, width, height } = boxSelectRect;
    if (width > 4 || height > 4) {
      const hit = objects.filter((obj) => {
        const ox = obj.points ? Math.min(obj.points[0], obj.points[2]) : obj.x;
        const oy = obj.points ? Math.min(obj.points[1], obj.points[3]) : obj.y;
        const ow = obj.points ? Math.abs(obj.points[2] - obj.points[0]) : obj.width;
        const oh = obj.points ? Math.abs(obj.points[3] - obj.points[1]) : obj.height;
        // AABB intersection (more forgiving than strict containment)
        return ox < x + width && ox + ow > x && oy < y + height && oy + oh > y;
      });
      setSelection(new Set(hit.map((o) => o.id)));
    }
    setBoxSelectRect(null);
    if (toolMode === 'single') {
      setActiveTool('cursor');
      setToolMode('infinite');
    }
  };

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage    = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition();
    const scaleBy  = 1.05;
    const clamped  = Math.max(0.1, Math.min(5,
      e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy));
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    setStageScale(clamped);
    setStagePos({
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    });
  };

  // ── Pan ───────────────────────────────────────────────────────────────────
  const handleDragEnd = (e) => {
    if (e.target === e.target.getStage()) {
      setStagePos({ x: e.target.x(), y: e.target.y() });
    }
  };

  // ── Object creation ───────────────────────────────────────────────────────
  const handleDblClick = (e) => {
    if (activeTool === 'cursor' || activeTool === 'box-select') return;
    if (e.target !== e.target.getStage()) return;

    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    const x = (pointer.x - stagePos.x) / stageScale;
    const y = (pointer.y - stagePos.y) / stageScale;

    if (activeTool === 'line') {
      // Two-step line creation handled in commit 2.6; for now fall through
      createObject('line', x, y, { points: [x, y, x + 200, y] });
    } else {
      createObject(activeTool, x, y);
      if (toolMode === 'single') {
        setActiveTool('cursor');
        setToolMode('infinite');
      }
    }
  };

  // ── Cursor position + box-select rect update ─────────────────────────────
  const handleMouseMove = () => {
    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const cx = (pointer.x - stagePos.x) / stageScale;
    const cy = (pointer.y - stagePos.y) / stageScale;
    updateCursorPosition(cx, cy);
    if (isBoxDraggingRef.current && boxSelectRect) {
      setBoxSelectRect((prev) => ({
        ...prev,
        x:      Math.min(cx, prev.startX),
        y:      Math.min(cy, prev.startY),
        width:  Math.abs(cx - prev.startX),
        height: Math.abs(cy - prev.startY),
      }));
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id, e) => {
    if (e?.evt?.shiftKey) {
      toggleSelect(id);
    } else {
      select(id);
    }
    updateObject(id, { zIndex: Date.now() });
  }, [select, toggleSelect, updateObject]);

  const handleDeselectClick = (e) => {
    if (e.target === e.target.getStage()) {
      deselectAll();
      if (inlineEdit) setInlineEdit(null);
    }
  };

  const handleDelete = useCallback((id) => {
    deleteObject(id);
    deselectAll();
  }, [deleteObject, deselectAll]);

  // ── Inline editing ────────────────────────────────────────────────────────
  const handleStartInlineEdit = useCallback((data) => {
    const stage     = stageRef.current;
    const container = stage.container().getBoundingClientRect();
    const scale     = stage.scaleX();
    setInlineEdit({
      id:       data.id,
      content:  data.content ?? '',
      color:    data.color,
      x:        container.left + stage.x() + data.x * scale,
      y:        container.top  + stage.y() + data.y * scale,
      w:        data.width  * scale,
      h:        data.height * scale,
      scale,
      rotation: data.rotation ?? 0,
    });
  }, []);

  const handleInlineEditBlur = (e) => {
    if (inlineEdit) {
      updateObject(inlineEdit.id, { content: e.target.value });
      setInlineEdit(null);
    }
  };

  const handleInlineEditKeyDown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
      updateObject(inlineEdit.id, { content: e.target.value });
      setInlineEdit(null);
    }
    e.stopPropagation();
  };

  // ── Color picker ──────────────────────────────────────────────────────────
  const handleShowColorPicker = (noteId, position) => {
    setColorPickerNote(noteId);
    setColorPickerPos(position);
  };

  const handleColorChange = (color) => {
    if (colorPickerNote) {
      updateObject(colorPickerNote, { color });
      setColorPickerNote(null);
    }
  };

  // ── Clear all ─────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    if (window.confirm('Delete all objects? This cannot be undone.')) {
      deleteAllObjects();
      deselectAll();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#f5f5f5' }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        draggable={isDraggable}
        style={{ cursor: isDraggable ? 'grab' : 'crosshair' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDragEnd={handleDragEnd}
        onDblClick={handleDblClick}
        onClick={handleDeselectClick}
        onTap={handleDeselectClick}
        onMouseMove={handleMouseMove}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
      >
        <Layer ref={layerRef}>
          <ObjectRenderer
            objects={objects}
            selectedIds={selectedIds}
            inlineEditId={inlineEdit?.id ?? null}
            onSelect={handleSelect}
            onUpdate={updateObject}
            onDelete={handleDelete}
            onShowColorPicker={handleShowColorPicker}
            onTransformStart={() => {}}
            onTransformEnd={() => {}}
            onDimsChanged={() => {
              if (transformerRef.current) transformerRef.current.forceUpdate();
            }}
            onStartEdit={handleStartInlineEdit}
          />
          {boxSelectRect && <SelectionRect {...boxSelectRect} />}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 40 || newBox.height < 40) return oldBox;
              return newBox;
            }}
          />
        </Layer>

        <Layer listening={false}>
          {presence.map((user) => (
            <Cursor key={user.id} data={user} />
          ))}
        </Layer>
      </Stage>

      {/* Inline edit textarea overlay */}
      {inlineEdit && (
        <textarea
          autoFocus
          defaultValue={inlineEdit.content}
          onBlur={handleInlineEditBlur}
          onKeyDown={handleInlineEditKeyDown}
          style={{
            position:   'fixed',
            left:       inlineEdit.x + 10 * inlineEdit.scale,
            top:        inlineEdit.y + 10 * inlineEdit.scale,
            width:      inlineEdit.w - 20 * inlineEdit.scale,
            height:     inlineEdit.h - 20 * inlineEdit.scale,
            fontSize:   16 * inlineEdit.scale,
            transform:  inlineEdit.rotation ? `rotate(${inlineEdit.rotation}deg)` : undefined,
            transformOrigin: 'top left',
            background: 'transparent',
            border:     'none',
            outline:    '2px solid #4ECDC4',
            borderRadius: 4,
            resize:     'none',
            padding:    0,
            fontFamily: 'inherit',
            color:      '#333',
            zIndex:     1500,
            lineHeight: 1.4,
          }}
        />
      )}

      <Toolbar
        activeTool={activeTool}
        toolMode={toolMode}
        onToolChange={handleToolChange}
        onModeToggle={handleModeToggle}
      />

      <InfoOverlay
        stageScale={stageScale}
        stagePos={stagePos}
        objectCount={objects.length}
        usersOnline={presence.length + 1}
        loading={loading}
      />

      {/* Selection count badge */}
      {selectedIds.size > 1 && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#4ECDC4', color: 'white', padding: '4px 12px',
          borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 1000,
        }}>
          {selectedIds.size} objects selected
        </div>
      )}

      {objects.length > 0 && (
        <button
          onClick={handleClearAll}
          style={{
            position: 'absolute', bottom: 20, right: 20,
            background: '#ff6b6b', color: 'white', border: 'none',
            padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,107,107,0.3)',
          }}
        >
          🗑️ Clear All
        </button>
      )}

      <DebugOverlay stageScale={stageScale} stagePos={stagePos} />

      <ColorPicker
        noteId={colorPickerNote}
        position={colorPickerPos}
        onColorChange={handleColorChange}
        onClose={() => setColorPickerNote(null)}
      />
    </div>
  );
}
