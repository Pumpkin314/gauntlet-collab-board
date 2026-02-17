import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group, Circle, Transformer } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';
import Cursor from './Cursor';

/**
 * StickyNote Component
 * Interactive sticky note with drag, edit, selection, and hover menu
 */
function StickyNote({
  id,
  data,
  isSelected,
  onSelect,
  onUpdate,
  onStartEdit,
  onShowColorPicker,
  onDelete,
  onTransformStart,
  onTransformEnd,
  onDimsChanged,
}) {
  const groupRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  // Local dimensions so resize is instant — no async React/Firestore round-trip
  const [localWidth, setLocalWidth] = useState(data.width);
  const [localHeight, setLocalHeight] = useState(data.height);

  // Sync local dims when data changes from other users (not from our own resize)
  useEffect(() => {
    setLocalWidth(data.width);
    setLocalHeight(data.height);
  }, [data.width, data.height]);

  // After React commits new localWidth/localHeight to Konva nodes, tell the
  // transformer to recalculate its bounding box
  useEffect(() => {
    if (isSelected && onDimsChanged) {
      onDimsChanged();
    }
  }, [localWidth, localHeight]);

  // Handle drag end - update position in Firestore
  const handleDragEnd = (e) => {
    const node = e.target;
    onUpdate(data.id, {
      x: node.x(),
      y: node.y(),
    });
  };

  // Handle click - select this object
  const handleClick = () => {
    onSelect(data.id);
  };

  // Handle double-click - enter edit mode
  const handleDblClick = () => {
    onStartEdit(data);
  };

  // Handle transform start
  const handleTransformStart = () => {
    if (onTransformStart) {
      onTransformStart();
    }
  };

  // Handle transform end - update size/rotation in Firestore
  const handleTransformEnd = () => {
    const node = groupRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth = Math.max(100, localWidth * scaleX);
    const newHeight = Math.max(80, localHeight * scaleY);

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    // Update local state immediately — React renders correct dims in this same cycle,
    // so the transformer sees the right bounding box with no flash
    setLocalWidth(newWidth);
    setLocalHeight(newHeight);

    // Persist to Firestore
    onUpdate(data.id, {
      x: node.x(),
      y: node.y(),
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    });

    if (onTransformEnd) {
      onTransformEnd();
    }
  };

  return (
    <Group
      id={id}
      name="object"
      ref={groupRef}
      x={data.x}
      y={data.y}
      rotation={data.rotation || 0}
      draggable
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main sticky note rectangle */}
      <Rect
        width={localWidth}
        height={localHeight}
        fill={data.color}
        stroke={isSelected ? "#4ECDC4" : "#333"}
        strokeWidth={isSelected ? 3 : 2}
        cornerRadius={8}
        shadowBlur={10}
        shadowColor="rgba(0,0,0,0.2)"
        shadowOffset={{ x: 2, y: 2 }}
      />

      {/* Text content */}
      <Text
        x={10}
        y={10}
        width={localWidth - 20}
        height={localHeight - 20}
        text={data.content}
        fontSize={16}
        fill="#333"
        align="left"
        verticalAlign="top"
        wrap="word"
      />

      {/* Hover menu - Delete button */}
      {isHovered && (
        <>
          <Group
            x={localWidth - 25}
            y={5}
            onClick={(e) => {
              e.cancelBubble = true;
              onDelete(data.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onDelete(data.id);
            }}
          >
            <Circle
              radius={10}
              fill="#ff6b6b"
              shadowBlur={4}
              shadowColor="rgba(0,0,0,0.3)"
            />
            <Text
              x={-5}
              y={-6}
              text="✕"
              fontSize={12}
              fill="white"
              fontStyle="bold"
            />
          </Group>

          {/* Color picker button */}
          <Group
            x={localWidth - 50}
            y={5}
            onClick={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const pos = stage.getPointerPosition();
              onShowColorPicker(data.id, pos);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const pos = stage.getPointerPosition();
              onShowColorPicker(data.id, pos);
            }}
          >
            <Circle
              radius={10}
              fill="#4ECDC4"
              shadowBlur={4}
              shadowColor="rgba(0,0,0,0.3)"
            />
            <Text
              x={-3}
              y={-6}
              text="⋮"
              fontSize={12}
              fill="white"
              fontStyle="bold"
            />
          </Group>
        </>
      )}
    </Group>
  );
}

/**
 * Canvas Component with Sticky Notes
 * Double-click to create sticky notes that sync via Firestore
 */
export default function Canvas() {
  const { objects, presence, createStickyNote, updateObject, deleteObject, deleteAllObjects, updateCursorPosition, loading } = useBoard();
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [colorPickerNote, setColorPickerNote] = useState(null);
  const [colorPickerPos, setColorPickerPos] = useState({ x: 0, y: 0 });
  const [pendingUpdates, setPendingUpdates] = useState({});
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const layerRef = useRef(null);
  const isTransformingRef = useRef(false);

  // Handle mouse wheel zoom
  const handleWheel = (e) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    // Calculate new scale
    const scaleBy = 1.05;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

    // Limit zoom range
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    // Calculate new position to zoom toward mouse
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale(clampedScale);
    setStagePos(newPos);
  };

  // Handle stage drag (pan)
  const handleDragEnd = (e) => {
    // Only update stage position if dragging the stage itself, not child elements
    if (e.target === e.target.getStage()) {
      setStagePos({
        x: e.target.x(),
        y: e.target.y(),
      });
    }
  };

  // Handle double-click to create sticky note
  const handleDblClick = (e) => {
    // Only create on background double-click (not on existing objects)
    if (e.target === e.target.getStage()) {
      const stage = stageRef.current;
      const pointerPosition = stage.getPointerPosition();

      // Convert screen coordinates to canvas coordinates (accounting for pan/zoom)
      const x = (pointerPosition.x - stagePos.x) / stageScale;
      const y = (pointerPosition.y - stagePos.y) / stageScale;

      createStickyNote(x, y);
    }
  };

  // Handle mouse move to update cursor position
  const handleMouseMove = (_e) => {
    const stage = stageRef.current;
    const pointerPosition = stage.getPointerPosition();

    if (pointerPosition) {
      // Convert screen coordinates to canvas coordinates
      const x = (pointerPosition.x - stagePos.x) / stageScale;
      const y = (pointerPosition.y - stagePos.y) / stageScale;

      updateCursorPosition(x, y);
    }
  };

  // Handle sticky note update with optimistic updates
  const handleNoteUpdate = (noteId, updates) => {
    // Optimistic update: apply changes immediately to local state
    setPendingUpdates(prev => ({
      ...prev,
      [noteId]: {
        ...prev[noteId],
        ...updates
      }
    }));

    // Update Firestore in background
    updateObject(noteId, updates);

    // Clear pending updates after a delay (Firestore should have updated by then)
    setTimeout(() => {
      setPendingUpdates(prev => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    }, 500);
  };

  // Handle start editing
  const handleStartEdit = (note) => {
    setEditingNote(note);
  };

  // Handle save edit
  const handleSaveEdit = (content) => {
    if (editingNote) {
      updateObject(editingNote.id, { content });
      setEditingNote(null);
    }
  };

  // Handle show color picker
  const handleShowColorPicker = (noteId, position) => {
    setColorPickerNote(noteId);
    setColorPickerPos(position);
  };

  // Handle color change
  const handleColorChange = (color) => {
    if (colorPickerNote) {
      updateObject(colorPickerNote, { color });
      setColorPickerNote(null);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all sticky notes? This cannot be undone.')) {
      deleteAllObjects();
    }
  };

  // Handle object selection
  const handleSelect = (id) => {
    setSelectedId(id);
  };

  // Handle deselection (click on background)
  const handleDeselectClick = (e) => {
    // Deselect when clicking on stage background
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  };

  // Handle delete object
  const handleDelete = (id) => {
    deleteObject(id);
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  // Handle transform start - set flag to prevent transformer updates
  const handleTransformStart = () => {
    isTransformingRef.current = true;
  };

  // Handle transform end - clear flag to allow transformer updates
  const handleTransformEnd = () => {
    isTransformingRef.current = false;
  };

  // Attach transformer to selected object
  useEffect(() => {
    if (selectedId && transformerRef.current && layerRef.current) {
      const selectedNode = layerRef.current.findOne(`#note-${selectedId}`);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer().batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  // Filter sticky notes from objects and merge pending updates
  const stickyNotes = objects
    .filter(obj => obj.type === 'sticky')
    .map(obj => ({
      ...obj,
      ...(pendingUpdates[obj.id] || {}) // Apply pending updates if any
    }));

  // Predefined color palette
  const colorPalette = [
    '#FFE66D', // Yellow
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#95E1D3', // Mint
    '#F38181', // Pink
    '#AA96DA', // Purple
    '#FCBAD3', // Light Pink
    '#A8D8EA', // Light Blue
  ];

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
        {/* Content Layer: Sticky notes and shapes */}
        <Layer ref={layerRef}>
          {stickyNotes.map((note) => (
            <StickyNote
              key={note.id}
              id={`note-${note.id}`}
              data={note}
              isSelected={selectedId === note.id}
              onSelect={handleSelect}
              onUpdate={handleNoteUpdate}
              onStartEdit={handleStartEdit}
              onShowColorPicker={handleShowColorPicker}
              onDelete={handleDelete}
              onTransformStart={handleTransformStart}
              onTransformEnd={handleTransformEnd}
              onDimsChanged={() => {
                if (transformerRef.current) {
                  transformerRef.current.forceUpdate();
                }
              }}
            />
          ))}
          {/* Transformer for resize/rotate */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit resize to minimum size
              if (newBox.width < 100 || newBox.height < 80) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>

        {/* UI Layer: Cursors (not affected by pan/zoom) */}
        <Layer listening={false}>
          {presence.map((user) => (
            <Cursor key={user.id} data={user} />
          ))}
        </Layer>
      </Stage>

      {/* Canvas info overlay */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '10px 15px',
        borderRadius: 8,
        fontSize: 12,
        fontFamily: 'monospace'
      }}>
        <div>Zoom: {(stageScale * 100).toFixed(0)}%</div>
        <div>Pan: ({Math.round(stagePos.x)}, {Math.round(stagePos.y)})</div>
        <div>Sticky Notes: {stickyNotes.length}</div>
        <div style={{ color: '#4ECDC4' }}>Users Online: {presence.length + 1}</div>
        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 11 }}>
          • Drag canvas to pan<br/>
          • Scroll to zoom<br/>
          • Double-click to create sticky<br/>
          • Drag sticky to move<br/>
          • Double-click sticky to edit<br/>
          • Right-click sticky for colors
        </div>
        {loading && <div style={{ marginTop: 8, color: '#4ECDC4' }}>Loading...</div>}
      </div>

      {/* Clear All Button */}
      {stickyNotes.length > 0 && (
        <button
          onClick={handleClearAll}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            background: '#ff6b6b',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(255, 107, 107, 0.3)',
          }}
          title="Delete all sticky notes"
        >
          🗑️ Clear All
        </button>
      )}

      {/* Text Editing Modal */}
      {editingNote && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setEditingNote(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 20,
              width: '90%',
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 15px 0', fontSize: 18 }}>Edit Sticky Note</h3>
            <textarea
              autoFocus
              defaultValue={editingNote.content}
              style={{
                width: '100%',
                height: 150,
                padding: 12,
                fontSize: 16,
                border: '2px solid #ddd',
                borderRadius: 8,
                resize: 'none',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleSaveEdit(e.target.value);
                }
                if (e.key === 'Escape') {
                  setEditingNote(null);
                }
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 15, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingNote(null)}
                style={{
                  padding: '8px 16px',
                  border: '2px solid #ddd',
                  background: 'white',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
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
                  padding: '8px 16px',
                  border: '2px solid #4ECDC4',
                  background: '#4ECDC4',
                  color: 'white',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1999,
            }}
            onClick={() => setColorPickerNote(null)}
          />
          <div
            style={{
              position: 'absolute',
              left: colorPickerPos.x,
              top: colorPickerPos.y,
              background: 'white',
              borderRadius: 12,
              padding: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              zIndex: 2000,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}
          >
            {colorPalette.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                style={{
                  width: 40,
                  height: 40,
                  background: color,
                  border: '2px solid #ddd',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease',
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                title={color}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
