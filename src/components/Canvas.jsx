import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';
import Cursor from './Cursor';
import ObjectRenderer from './Canvas/ObjectRenderer';
import Toolbar from './Canvas/Toolbar';
import EditModal from './Canvas/EditModal';
import ColorPicker from './Canvas/ColorPicker';
import InfoOverlay from './Canvas/InfoOverlay';
import { registerShape } from '../utils/shapeRegistry';
import StickyNote from './shapes/StickyNote';
import RectShape from './shapes/RectShape';

// ── Register shape components (once at module load) ───────────────────────────
registerShape('sticky', {
  component: StickyNote,
  defaults:  { width: 200, height: 200, color: '#FFE66D', content: 'Double-click to edit' },
  minWidth:  100,
  minHeight: 80,
});
registerShape('rect', {
  component: RectShape,
  defaults:  { width: 160, height: 100, color: '#85C1E2' },
  minWidth:  40,
  minHeight: 40,
});

/**
 * Canvas Component
 * Hosts the Konva Stage, handles pan/zoom, tool selection, and object creation.
 * Shape rendering is delegated to ObjectRenderer + individual shape components.
 */
export default function Canvas() {
  const {
    objects,
    presence,
    createObject,
    updateObject,
    deleteObject,
    deleteAllObjects,
    updateCursorPosition,
    loading,
  } = useBoard();

  const [stagePos,        setStagePos]        = useState({ x: 0, y: 0 });
  const [stageScale,      setStageScale]      = useState(1);
  const [activeTool,      setActiveTool]      = useState('sticky');
  const [selectedId,      setSelectedId]      = useState(null);
  const [editingNote,     setEditingNote]     = useState(null);
  const [colorPickerNote, setColorPickerNote] = useState(null);
  const [colorPickerPos,  setColorPickerPos]  = useState({ x: 0, y: 0 });

  const stageRef       = useRef(null);
  const transformerRef = useRef(null);
  const layerRef       = useRef(null);
  const isTransformingRef = useRef(false);

  // ── Zoom ────────────────────────────────────────────────────────────────────

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage    = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition();

    const scaleBy  = 1.05;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clamped  = Math.max(0.1, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newPos = {
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    };

    setStageScale(clamped);
    setStagePos(newPos);
  };

  // ── Pan ─────────────────────────────────────────────────────────────────────

  const handleDragEnd = (e) => {
    if (e.target === e.target.getStage()) {
      setStagePos({ x: e.target.x(), y: e.target.y() });
    }
  };

  // ── Object creation (double-click on background) ────────────────────────────

  const handleDblClick = (e) => {
    if (e.target !== e.target.getStage()) return;

    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    const x = (pointer.x - stagePos.x) / stageScale;
    const y = (pointer.y - stagePos.y) / stageScale;

    createObject(activeTool, x, y);
  };

  // ── Cursor position ─────────────────────────────────────────────────────────

  const handleMouseMove = () => {
    const stage   = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (pointer) {
      const x = (pointer.x - stagePos.x) / stageScale;
      const y = (pointer.y - stagePos.y) / stageScale;
      updateCursorPosition(x, y);
    }
  };

  // ── Object updates (Yjs is synchronous — no optimistic layer needed) ────────

  const handleNoteUpdate = (noteId, updates) => updateObject(noteId, updates);

  // ── Edit modal ──────────────────────────────────────────────────────────────

  const handleStartEdit = (note) => setEditingNote(note);

  const handleSaveEdit = (content) => {
    if (editingNote) {
      updateObject(editingNote.id, { content });
      setEditingNote(null);
    }
  };

  // ── Color picker ────────────────────────────────────────────────────────────

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

  // ── Clear all ───────────────────────────────────────────────────────────────

  const handleClearAll = () => {
    if (window.confirm('Delete all objects? This cannot be undone.')) {
      deleteAllObjects();
    }
  };

  // ── Selection ───────────────────────────────────────────────────────────────

  const handleSelect = (id) => {
    setSelectedId(id);
    // Bring clicked object to front by bumping its zIndex
    updateObject(id, { zIndex: Date.now() });
  };

  const handleDeselectClick = (e) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  const handleDelete = (id) => {
    deleteObject(id);
    if (selectedId === id) setSelectedId(null);
  };

  // ── Transform ───────────────────────────────────────────────────────────────

  const handleTransformStart = () => { isTransformingRef.current = true; };
  const handleTransformEnd   = () => { isTransformingRef.current = false; };

  // Attach transformer to selected node
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#f5f5f5' }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        draggable
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
        {/* Content layer */}
        <Layer ref={layerRef}>
          <ObjectRenderer
            objects={objects}
            selectedId={selectedId}
            onSelect={handleSelect}
            onUpdate={handleNoteUpdate}
            onDelete={handleDelete}
            onShowColorPicker={handleShowColorPicker}
            onTransformStart={handleTransformStart}
            onTransformEnd={handleTransformEnd}
            onDimsChanged={() => {
              if (transformerRef.current) transformerRef.current.forceUpdate();
            }}
            onStartEdit={handleStartEdit}
          />
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 40 || newBox.height < 40) return oldBox;
              return newBox;
            }}
          />
        </Layer>

        {/* Cursor layer — not affected by pan/zoom */}
        <Layer listening={false}>
          {presence.map((user) => (
            <Cursor key={user.id} data={user} />
          ))}
        </Layer>
      </Stage>

      <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />

      <InfoOverlay
        stageScale={stageScale}
        stagePos={stagePos}
        objectCount={objects.length}
        usersOnline={presence.length + 1}
        loading={loading}
      />

      {/* Clear All */}
      {objects.length > 0 && (
        <button
          onClick={handleClearAll}
          style={{
            position: 'absolute', bottom: 20, right: 20,
            background: '#ff6b6b', color: 'white', border: 'none',
            padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,107,107,0.3)',
          }}
          title="Delete all objects"
        >
          🗑️ Clear All
        </button>
      )}

      <EditModal
        note={editingNote}
        onSave={handleSaveEdit}
        onClose={() => setEditingNote(null)}
      />

      <ColorPicker
        noteId={colorPickerNote}
        position={colorPickerPos}
        onColorChange={handleColorChange}
        onClose={() => setColorPickerNote(null)}
      />
    </div>
  );
}
