/**
 * LineShape — a straight line (or arrow) with two draggable endpoints.
 * Does NOT use BaseShape (entirely different interaction model).
 * Points stored as absolute canvas coords: [x1, y1, x2, y2].
 *
 * When arrowEnd/arrowStart flags are set, renders Konva's Arrow shape instead
 * of Line. Arrow always draws a pointer at end; pointerAtBeginning adds one at start.
 * For start-only arrows, we reverse the points so the "end" pointer appears at
 * the logical start position.
 *
 * Supports magnetic endpoint snapping when visibleObjects/stageScaleRef are provided.
 * Hold Shift to bypass snapping. Dragging the line body translates both endpoints.
 */

import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { Group, Line, Arrow, Circle } from 'react-konva';
import Konva from 'konva';
import type { ShapeProps } from '../../types/board';
import { findSnapTarget } from '../../utils/connectorSnap';

const SNAP_THRESHOLD_PX = 30;

export default memo(function LineShape({
  id, data, isSelected, onSelect, onUpdate, onDelete,
  visibleObjects, stageScaleRef,
}: ShapeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const pts = data.points ?? [data.x, data.y, data.x + 200, data.y];
  const [x1, y1, x2, y2] = pts;

  // Snap indicator state (shown during endpoint drag)
  const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);
  // Track snap result per endpoint during drag
  const snapResultRef = useRef<{ from: ReturnType<typeof findSnapTarget> | null; to: ReturnType<typeof findSnapTarget> | null }>({
    from: null, to: null,
  });

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (isSelected) {
      group.clearCache();
    } else {
      requestAnimationFrame(() => {
        if (groupRef.current && !isSelected) groupRef.current.cache();
      });
    }
  }, [isSelected, data.points, data.strokeColor, data.color, data.arrowStart, data.arrowEnd]);

  const handleEndpointDragMove = useCallback((index: 0 | 1, e: any) => {
    if (!visibleObjects || !stageScaleRef) return;

    const circle = e.target as Konva.Circle;
    const cx = circle.x();
    const cy = circle.y();

    // Shift bypasses snapping
    if (e.evt?.shiftKey) {
      setSnapIndicator(null);
      snapResultRef.current[index === 0 ? 'from' : 'to'] = null;
      return;
    }

    const scale = stageScaleRef.current ?? 1;
    const candidates = visibleObjects.filter(o => o.type !== 'line' && o.type !== 'frame');
    const excludeIds = new Set([data.id]);

    const result = findSnapTarget(cx, cy, candidates, excludeIds, SNAP_THRESHOLD_PX, scale);

    if (result.snapped) {
      circle.x(result.x);
      circle.y(result.y);
      setSnapIndicator({ x: result.x, y: result.y });
    } else {
      setSnapIndicator(null);
    }

    snapResultRef.current[index === 0 ? 'from' : 'to'] = result.snapped ? result : null;
  }, [visibleObjects, stageScaleRef, data.id]);

  const handleEndpointDragEnd = useCallback((index: 0 | 1, e: any) => {
    const newPts = [...pts];
    newPts[index * 2]     = e.target.x();
    newPts[index * 2 + 1] = e.target.y();

    const endpointKey = index === 0 ? 'from' : 'to';
    const snapResult = snapResultRef.current[endpointKey];

    const updates: Record<string, any> = {
      points: newPts,
      x: newPts[0],
      y: newPts[1],
    };

    if (snapResult?.snapped) {
      updates[`${endpointKey}Id`] = snapResult.objectId;
      updates[`${endpointKey}Anchor`] = snapResult.anchor ?? undefined;
    } else {
      // Clear connection for this endpoint
      updates[`${endpointKey}Id`] = '';
      updates[`${endpointKey}Anchor`] = '';
    }

    onUpdate(data.id, updates);
    setSnapIndicator(null);
    snapResultRef.current[endpointKey] = null;
  }, [pts, data.id, onUpdate]);

  // Segment drag: dragging the line body translates both endpoints
  const segmentDragStartRef = useRef<{ pts: number[] } | null>(null);

  const handleSegmentDragStart = useCallback((e: any) => {
    // Only trigger when dragging the line/arrow shape itself, not endpoints
    const target = e.target;
    if (target instanceof Konva.Circle) return;
    segmentDragStartRef.current = { pts: [...pts] };
  }, [pts]);

  const handleSegmentDragEnd = useCallback((e: any) => {
    if (!segmentDragStartRef.current) return;
    const group = e.target as Konva.Group;
    const dx = group.x();
    const dy = group.y();

    if (dx === 0 && dy === 0) {
      segmentDragStartRef.current = null;
      return;
    }

    const origPts = segmentDragStartRef.current.pts;
    const newPts = [
      origPts[0]! + dx, origPts[1]! + dy,
      origPts[2]! + dx, origPts[3]! + dy,
    ];

    // Reset group position (points are absolute)
    group.x(0);
    group.y(0);

    onUpdate(data.id, {
      points: newPts,
      x: newPts[0],
      y: newPts[1],
      fromId: '',
      toId: '',
      fromAnchor: '' as any,
      toAnchor: '' as any,
    });

    segmentDragStartRef.current = null;
  }, [pts, data.id, onUpdate]);

  const hitWidth = Math.max(12, 20 / (stageScaleRef?.current ?? 1));
  const hasArrow = data.arrowStart || data.arrowEnd;
  const strokeColor = isSelected ? '#4ECDC4' : (data.strokeColor ?? data.color ?? '#333');
  const strokeWidth = (data.strokeWidth ?? 2) * (isSelected ? 1.5 : 1);

  const renderLine = () => {
    if (!hasArrow) {
      return (
        <Line
          points={pts}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          lineCap="round"
          hitStrokeWidth={hitWidth}
        />
      );
    }

    // start-only: reverse points so Arrow's end-pointer appears at logical start
    const startOnly = data.arrowStart && !data.arrowEnd;
    const renderPts = startOnly ? [x2, y2, x1, y1] : pts;
    const pointerAtBeginning = data.arrowStart && data.arrowEnd;

    return (
      <Arrow
        points={renderPts}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill={strokeColor}
        lineCap="round"
        hitStrokeWidth={hitWidth}
        pointerLength={10}
        pointerWidth={10}
        pointerAtBeginning={pointerAtBeginning}
      />
    );
  };

  return (
    <Group
      id={id}
      name="object"
      ref={groupRef}
      draggable={isSelected}
      onClick={() => onSelect(data.id)}
      onTap={() => onSelect(data.id)}
      onDragStart={handleSegmentDragStart}
      onDragEnd={handleSegmentDragEnd}
    >
      {renderLine()}

      {/* Snap indicator — larger translucent circle at snap point */}
      {snapIndicator && (
        <Circle
          x={snapIndicator.x}
          y={snapIndicator.y}
          radius={14}
          fill="rgba(78, 205, 196, 0.3)"
          stroke="#4ECDC4"
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* Endpoint handles */}
      {[0, 1].map((i) => (
        <Circle
          key={i}
          x={pts[i * 2]}
          y={pts[i * 2 + 1]}
          radius={isSelected ? 7 : 0}
          fill="#4ECDC4"
          stroke="white"
          strokeWidth={2}
          draggable
          onDragMove={(e) => handleEndpointDragMove(i as 0 | 1, e)}
          onDragEnd={(e) => handleEndpointDragEnd(i as 0 | 1, e)}
        />
      ))}

    </Group>
  );
});
