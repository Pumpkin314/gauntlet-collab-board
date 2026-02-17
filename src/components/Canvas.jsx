import { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';
import Cursor from './Cursor';
import ObjectRenderer from './Canvas/ObjectRenderer';
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
  const [activeTool,      setActiveTool]      = useState('sticky'); // 'sticky' | 'rect'
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

  const handleSelect = (id) => setSelectedId(id);

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

  // ── Misc ────────────────────────────────────────────────────────────────────

  const colorPalette = [
    '#FFE66D', '#FF6B6B', '#4ECDC4', '#95E1D3',
    '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
  ];

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

      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, background: 'white', padding: '8px 12px',
        borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000,
      }}>
        {[
          { tool: 'sticky', label: '📝', title: 'Sticky Note' },
          { tool: 'rect',   label: '⬜', title: 'Rectangle' },
        ].map(({ tool, label, title }) => (
          <button
            key={tool}
            title={`${title} (double-click canvas to place)`}
            onClick={() => setActiveTool(tool)}
            style={{
              width: 40, height: 40,
              border:       activeTool === tool ? '2px solid #4ECDC4' : '2px solid #ddd',
              background:   activeTool === tool ? '#f0fffe' : 'white',
              borderRadius: 8, cursor: 'pointer', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Info overlay */}
      <div style={{
        position: 'absolute', bottom: 20, left: 20,
        background: 'rgba(0,0,0,0.7)', color: 'white',
        padding: '10px 15px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace',
      }}>
        <div>Zoom: {(stageScale * 100).toFixed(0)}%</div>
        <div>Pan: ({Math.round(stagePos.x)}, {Math.round(stagePos.y)})</div>
        <div>Objects: {objects.length}</div>
        <div style={{ color: '#4ECDC4' }}>Users Online: {presence.length + 1}</div>
        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 11 }}>
          • Drag canvas to pan<br />
          • Scroll to zoom<br />
          • Double-click to create<br />
          • Click shape to select
        </div>
        {loading && <div style={{ marginTop: 8, color: '#4ECDC4' }}>Syncing…</div>}
      </div>

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

      {/* Text Editing Modal */}
      {editingNote && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2000,
          }}
          onClick={() => setEditingNote(null)}
        >
          <div
            style={{
              background: 'white', borderRadius: 12, padding: 20,
              width: '90%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 15px 0', fontSize: 18 }}>Edit Sticky Note</h3>
            <textarea
              autoFocus
              defaultValue={editingNote.content}
              style={{
                width: '100%', height: 150, padding: 12, fontSize: 16,
                border: '2px solid #ddd', borderRadius: 8, resize: 'none',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleSaveEdit(e.target.value);
                if (e.key === 'Escape')             setEditingNote(null);
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 15, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingNote(null)}
                style={{
                  padding: '8px 16px', border: '2px solid #ddd', background: 'white',
                  borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  const textarea = e.target.parentElement.previousSibling;
                  handleSaveEdit(textarea.value);
                }}
                style={{
                  padding: '8px 16px', border: '2px solid #4ECDC4', background: '#4ECDC4',
                  color: 'white', borderRadius: 8, cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Save (Ctrl+Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Picker */}
      {colorPickerNote && (
        <>
          <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }}
            onClick={() => setColorPickerNote(null)}
          />
          <div
            style={{
              position: 'absolute', left: colorPickerPos.x, top: colorPickerPos.y,
              background: 'white', borderRadius: 12, padding: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 2000,
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}
          >
            {colorPalette.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                style={{
                  width: 40, height: 40, background: color,
                  border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer',
                  transition: 'transform 0.2s ease',
                }}
                onMouseEnter={(e) => (e.target.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
                title={color}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
