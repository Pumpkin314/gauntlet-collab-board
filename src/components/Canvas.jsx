import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';
import Cursor from './Cursor';
import ObjectRenderer from './Canvas/ObjectRenderer';
import Toolbar from './Canvas/Toolbar';
import ColorPicker from './Canvas/ColorPicker';
import InfoOverlay from './Canvas/InfoOverlay';
import { registerShape } from '../utils/shapeRegistry';
import StickyNote from './shapes/StickyNote';
import RectShape from './shapes/RectShape';
import CircleShape from './shapes/CircleShape';
import TextShape from './shapes/TextShape';
import LineShape from './shapes/LineShape';

// ── Register all shape types (once at module load) ────────────────────────────
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

/**
 * Canvas
 * Hosts the Konva Stage. Delegates shape rendering to ObjectRenderer.
 * Cursor tool = pan mode. Creation tools = double-click to place.
 * Space held = temporary pan in any tool mode.
 */
export default function Canvas() {
  const {
    objects, presence, createObject, updateObject,
    deleteObject, deleteAllObjects, updateCursorPosition, loading,
  } = useBoard();

  const [stagePos,        setStagePos]        = useState({ x: 0, y: 0 });
  const [stageScale,      setStageScale]      = useState(1);
  const [activeTool,      setActiveTool]      = useState('cursor');
  const [selectedId,      setSelectedId]      = useState(null);
  const [colorPickerNote, setColorPickerNote] = useState(null);
  const [colorPickerPos,  setColorPickerPos]  = useState({ x: 0, y: 0 });
  const [spaceHeld,       setSpaceHeld]       = useState(false);

  // Inline editing state
  const [inlineEdit, setInlineEdit] = useState(null); // { id, content, x, y, w, h, scale, rotation, color }

  const stageRef       = useRef(null);
  const transformerRef = useRef(null);
  const layerRef       = useRef(null);

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

  // Stage is draggable in cursor mode or while Space is held
  const isDraggable = activeTool === 'cursor' || spaceHeld;

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
    if (activeTool === 'cursor') return;
    if (e.target !== e.target.getStage()) return;

    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    const x = (pointer.x - stagePos.x) / stageScale;
    const y = (pointer.y - stagePos.y) / stageScale;

    if (activeTool === 'line') {
      createObject('line', x, y, { points: [x, y, x + 200, y] });
    } else {
      createObject(activeTool, x, y);
    }
  };

  // ── Cursor position ───────────────────────────────────────────────────────
  const handleMouseMove = () => {
    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (pointer) {
      updateCursorPosition(
        (pointer.x - stagePos.x) / stageScale,
        (pointer.y - stagePos.y) / stageScale,
      );
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = (id) => {
    setSelectedId(id);
    updateObject(id, { zIndex: Date.now() });
  };

  const handleDeselectClick = (e) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
      commitInlineEdit();
    }
  };

  const handleDelete = (id) => {
    deleteObject(id);
    if (selectedId === id) setSelectedId(null);
  };

  // ── Transform ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedId && transformerRef.current && layerRef.current) {
      const node = layerRef.current.findOne(`#note-${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  // ── Inline editing ────────────────────────────────────────────────────────
  const handleStartInlineEdit = useCallback((data) => {
    const stage     = stageRef.current;
    const container = stage.container().getBoundingClientRect();
    const scale     = stage.scaleX();
    const sx        = stage.x();
    const sy        = stage.y();

    setInlineEdit({
      id:       data.id,
      content:  data.content ?? '',
      color:    data.color,
      x:        container.left + sx + data.x * scale,
      y:        container.top  + sy + data.y * scale,
      w:        data.width  * scale,
      h:        data.height * scale,
      scale,
      rotation: data.rotation ?? 0,
    });
  }, []);

  const commitInlineEdit = useCallback(() => {
    setInlineEdit(null);
  }, []);

  const handleInlineEditBlur = (e) => {
    const content = e.target.value;
    if (inlineEdit) {
      updateObject(inlineEdit.id, { content });
      setInlineEdit(null);
    }
  };

  const handleInlineEditKeyDown = (e) => {
    if (e.key === 'Escape') {
      updateObject(inlineEdit.id, { content: e.target.value });
      setInlineEdit(null);
    }
    // Allow normal Enter; Ctrl+Enter closes
    if (e.key === 'Enter' && e.ctrlKey) {
      updateObject(inlineEdit.id, { content: e.target.value });
      setInlineEdit(null);
    }
    e.stopPropagation(); // prevent Space/Delete shortcuts firing
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
            selectedId={selectedId}
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

      <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />

      <InfoOverlay
        stageScale={stageScale}
        stagePos={stagePos}
        objectCount={objects.length}
        usersOnline={presence.length + 1}
        loading={loading}
      />

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

      <ColorPicker
        noteId={colorPickerNote}
        position={colorPickerPos}
        onColorChange={handleColorChange}
        onClose={() => setColorPickerNote(null)}
      />
    </div>
  );
}
