import { useState, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Text } from 'react-konva';

/**
 * Basic Konva Canvas Component
 * Demonstrates pan/zoom and basic shape rendering
 */
export default function Canvas() {
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

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#f5f5f5' }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        draggable
        onWheel={handleWheel}
        onDragEnd={handleDragEnd}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
      >
        <Layer>
          {/* Demo shapes - will be replaced with Firestore-synced objects */}
          <Rect
            x={100}
            y={100}
            width={150}
            height={100}
            fill="#FFE66D"
            stroke="#333"
            strokeWidth={2}
            cornerRadius={8}
            shadowBlur={10}
            shadowColor="rgba(0,0,0,0.2)"
            shadowOffset={{ x: 2, y: 2 }}
          />
          <Text
            x={110}
            y={120}
            text="Sticky Note"
            fontSize={16}
            fill="#333"
          />

          <Circle
            x={400}
            y={200}
            radius={50}
            fill="#4ECDC4"
            stroke="#333"
            strokeWidth={2}
            shadowBlur={10}
            shadowColor="rgba(0,0,0,0.2)"
            shadowOffset={{ x: 2, y: 2 }}
          />

          {/* Grid dots for reference */}
          {Array.from({ length: 20 }).map((_, i) =>
            Array.from({ length: 20 }).map((_, j) => (
              <Circle
                key={`dot-${i}-${j}`}
                x={i * 100}
                y={j * 100}
                radius={2}
                fill="#ccc"
              />
            ))
          )}
        </Layer>
      </Stage>

      {/* Canvas info overlay */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '10px 15px',
        borderRadius: 8,
        fontSize: 12,
        fontFamily: 'monospace'
      }}>
        <div>Zoom: {(stageScale * 100).toFixed(0)}%</div>
        <div>Pan: ({Math.round(stagePos.x)}, {Math.round(stagePos.y)})</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          • Drag to pan<br/>
          • Scroll to zoom
        </div>
      </div>
    </div>
  );
}
