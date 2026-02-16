import { useState, useRef } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';
import { useBoard } from '../contexts/BoardContext';

/**
 * StickyNote Component
 * Renders a single sticky note from Firestore data
 */
function StickyNote({ data }) {
  return (
    <Group x={data.x} y={data.y}>
      <Rect
        width={data.width}
        height={data.height}
        fill={data.color}
        stroke="#333"
        strokeWidth={2}
        cornerRadius={8}
        shadowBlur={10}
        shadowColor="rgba(0,0,0,0.2)"
        shadowOffset={{ x: 2, y: 2 }}
      />
      <Text
        x={10}
        y={10}
        width={data.width - 20}
        height={data.height - 20}
        text={data.content}
        fontSize={16}
        fill="#333"
        align="left"
        verticalAlign="top"
        wrap="word"
      />
    </Group>
  );
}

/**
 * Canvas Component with Sticky Notes
 * Double-click to create sticky notes that sync via Firestore
 */
export default function Canvas() {
  const { objects, createStickyNote, loading } = useBoard();
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const stageRef = useRef(null);

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
    setStagePos({
      x: e.target.x(),
      y: e.target.y(),
    });
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

  // Filter sticky notes from objects
  const stickyNotes = objects.filter(obj => obj.type === 'sticky');

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
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
      >
        <Layer>
          {/* Render all sticky notes from Firestore */}
          {stickyNotes.map((note) => (
            <StickyNote key={note.id} data={note} />
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
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          • Drag to pan<br/>
          • Scroll to zoom<br/>
          • Double-click to create sticky
        </div>
        {loading && <div style={{ marginTop: 8, color: '#4ECDC4' }}>Loading...</div>}
      </div>
    </div>
  );
}
