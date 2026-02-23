import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Transformer } from 'react-konva';
import Konva from 'konva';
import { useBoard } from '../contexts/BoardContext';
import { useSelection } from '../contexts/SelectionContext';
import Cursor from './Cursor';
import ObjectRenderer from './Canvas/ObjectRenderer';
import Toolbar from './Canvas/Toolbar';
import ColorPicker from './Canvas/ColorPicker';
import SelectionRect from './Canvas/SelectionRect';
import LinePreview, { type LineVariant } from './Canvas/LinePreview';
import InfoOverlay from './Canvas/InfoOverlay';
import DebugOverlay from './Canvas/DebugOverlay';
import DotGrid, { type DotGridHandle } from './Canvas/DotGrid';
import { registerShape } from '../utils/shapeRegistry';
import StickyNote from './shapes/StickyNote';
import RectShape from './shapes/RectShape';
import CircleShape from './shapes/CircleShape';
import TextShape from './shapes/TextShape';
import LineShape from './shapes/LineShape';
import FrameShape from './shapes/FrameShape';
import KnowledgeNodeShape from './shapes/KnowledgeNodeShape';
import ChatWidget from './ChatWidget';
import type { ActiveTool, BoardObject } from '../types/board';
import { getConnectedLines } from '../utils/connectorIndex';
import { resolveEndpoint } from '../utils/anchorResolve';

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
registerShape('frame', {
  component: FrameShape,
  defaults:  { width: 400, height: 300, color: '#f0f0f0', content: 'Frame' },
  minWidth: 200, minHeight: 150,
});
registerShape('kg-node', {
  component: KnowledgeNodeShape,
  defaults:  { width: 220, height: 80, color: '#BDBDBD' },
  minWidth: 140, minHeight: 60,
});

// ── local types ────────────────────────────────────────────────────────────────

interface InlineEdit {
  id:       string;
  content:  string;
  color:    string;
  x:        number;
  y:        number;
  w:        number;
  h:        number;
  scale:    number;
  rotation: number;
}

interface BoxSelectRect {
  startX: number;
  startY: number;
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

/** Transformer boundBoxFunc — pure, no closures, safe to hoist. */
const boundBoxFunc = (
  oldBox: { x: number; y: number; width: number; height: number; rotation: number },
  newBox: { x: number; y: number; width: number; height: number; rotation: number },
) => (newBox.width < 40 || newBox.height < 40 ? oldBox : newBox);

/** Conservative viewport hit-test using bounding-circle (shapes) or AABB (lines). */
function isInViewport(
  obj: BoardObject,
  vl: number, vt: number, vr: number, vb: number,
): boolean {
  if (obj.type === 'line') {
    const pts = obj.points;
    if (!pts || pts.length < 4) return true;
    const minX = Math.min(pts[0]!, pts[2]!);
    const maxX = Math.max(pts[0]!, pts[2]!);
    const minY = Math.min(pts[1]!, pts[3]!);
    const maxY = Math.max(pts[1]!, pts[3]!);
    return maxX >= vl && minX <= vr && maxY >= vt && minY <= vb;
  }
  const w = obj.width ?? 0;
  const h = obj.height ?? 0;
  const cx = obj.x + w / 2;
  const cy = obj.y + h / 2;
  const r = Math.sqrt(w * w + h * h) / 2;
  const closestX = Math.max(vl, Math.min(cx, vr));
  const closestY = Math.max(vt, Math.min(cy, vb));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

/** Compute the four corners of a rotated rectangle (rotation around top-left origin). */
function getRotatedCorners(
  x: number, y: number, w: number, h: number, rotationDeg: number
): Array<{ x: number; y: number }> {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const offsets = [
    { dx: 0, dy: 0 },
    { dx: w, dy: 0 },
    { dx: w, dy: h },
    { dx: 0, dy: h },
  ];
  return offsets.map(({ dx, dy }) => ({
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
  }));
}

/** Check if child is fully inside frame, accounting for rotation on both. */
function isFullyInside(child: BoardObject, frame: BoardObject): boolean {
  const cw = child.width ?? 0;
  const ch = child.height ?? 0;
  const childRot = child.rotation ?? 0;
  const frameRot = frame.rotation ?? 0;

  const childCorners = getRotatedCorners(child.x, child.y, cw, ch, childRot);

  if (Math.abs(frameRot) < 0.01) {
    return childCorners.every(
      c =>
        c.x >= frame.x &&
        c.y >= frame.y &&
        c.x <= frame.x + frame.width &&
        c.y <= frame.y + frame.height
    );
  }

  const rad = (-frameRot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return childCorners.every(c => {
    const dx = c.x - frame.x;
    const dy = c.y - frame.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    return localX >= 0 && localY >= 0 && localX <= frame.width && localY <= frame.height;
  });
}

/** Collect all descendant IDs of a frame (recursive) */
function getDescendantIds(frameId: string, allObjects: BoardObject[]): Set<string> {
  const result = new Set<string>();
  const queue = [frameId];
  while (queue.length > 0) {
    const parentId = queue.pop()!;
    for (const obj of allObjects) {
      if (obj.parentId === parentId && !result.has(obj.id)) {
        result.add(obj.id);
        if (obj.type === 'frame') queue.push(obj.id);
      }
    }
  }
  return result;
}

export default function Canvas() {
  const {
    objects, presence, createObject, updateObject,
    deleteObject, deleteAllObjects, updateCursorPosition, batchCreate, batchUpdate, batchDelete, loading,
  } = useBoard();

  const { selectedIds, select, toggleSelect, setSelection, deselectAll, selectAll } = useSelection();

  const [stagePos,        setStagePos]        = useState({ x: 0, y: 0 });
  const [stageScale,      setStageScale]      = useState(1);
  const [activeTool,      setActiveTool]      = useState<ActiveTool>('cursor');
  const [toolMode,        setToolMode]        = useState<'infinite' | 'single'>('infinite');
  const [colorPickerNote, setColorPickerNote] = useState<string | null>(null);
  const [colorPickerPos,  setColorPickerPos]  = useState({ x: 0, y: 0 });
  const [spaceHeld,       setSpaceHeld]       = useState(false);
  const [inlineEdit,      setInlineEdit]      = useState<InlineEdit | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const [lineVariant,     setLineVariant]     = useState<LineVariant>('line');
  const [boardieOpen,     setBoardieOpen]     = useState(false);

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const stageRef       = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const layerRef       = useRef<Konva.Layer | null>(null);
  const clipboardRef   = useRef<BoardObject[]>([]);
  const dotGridRef     = useRef<DotGridHandle>(null);

  const [boxSelectRect,   setBoxSelectRect]   = useState<BoxSelectRect | null>(null);
  const isBoxDraggingRef  = useRef(false);
  const [pendingLineStart, setPendingLineStart] = useState<{ x: number; y: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastDblClickRef = useRef(0);
  const panSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorPosRef = useRef({ x: 0, y: 0 });
  const stagePosRef = useRef(stagePos);
  if (!isPanningRef.current) stagePosRef.current = stagePos;
  const stageScaleRef = useRef(stageScale);
  stageScaleRef.current = stageScale;
  const [lineCursorPos, setLineCursorPos] = useState({ x: 0, y: 0 });

  // ── Window resize tracking ──────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Frame-aware update: containment check + move children ───────────────
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const handleFrameAwareUpdate = useCallback((id: string, updates: Partial<BoardObject>) => {
    updateObject(id, updates);

    const allObjs = objectsRef.current;
    const obj = allObjs.find(o => o.id === id);
    if (!obj) return;

    const posChanged = updates.x !== undefined || updates.y !== undefined;
    const frameResized = obj.type === 'frame' && (updates.width !== undefined || updates.height !== undefined);
    if (!posChanged && !frameResized) return;

    const updatedObj = { ...obj, ...updates };

    // If a frame was dragged, move all descendants by the delta
    if (obj.type === 'frame') {
      const dx = (updates.x ?? obj.x) - obj.x;
      const dy = (updates.y ?? obj.y) - obj.y;
      if (dx !== 0 || dy !== 0) {
        const descendantIds = getDescendantIds(id, allObjs);
        if (descendantIds.size > 0) {
          const childUpdates = allObjs
            .filter(o => descendantIds.has(o.id))
            .map(child => {
              if (child.type === 'line' && child.points && child.points.length >= 4) {
                return {
                  id: child.id,
                  changes: {
                    x: child.x + dx,
                    y: child.y + dy,
                    points: [
                      child.points[0]! + dx, child.points[1]! + dy,
                      child.points[2]! + dx, child.points[3]! + dy,
                    ],
                  },
                };
              }
              return { id: child.id, changes: { x: child.x + dx, y: child.y + dy } };
            });
          batchUpdate(childUpdates);
        }
      }
    }

    // Release children that fell outside after frame resize
    if (frameResized) {
      const children = allObjs.filter(o => o.parentId === id);
      const releaseUpdates = children
        .filter(child => !isFullyInside(child, updatedObj))
        .map(child => ({ id: child.id, changes: { parentId: '' as any } }));
      if (releaseUpdates.length > 0) batchUpdate(releaseUpdates);
    }

    // Skip containment recheck when this object's parent frame is also being
    // dragged (multi-select). The parent hasn't committed its new position yet,
    // so checking against its stale bounds would incorrectly release the child.
    const currentParent = obj.parentId ?? '';
    if (currentParent && selectedIdsRef.current.has(currentParent)) return;

    // Containment check: assign/release parentId based on frame containment
    const ownDescendants = obj.type === 'frame' ? getDescendantIds(id, allObjs) : new Set<string>();
    const frames = allObjs.filter(
      f => f.type === 'frame' && f.id !== id && !ownDescendants.has(f.id)
    );

    // Find the smallest frame that fully contains this object (prefer tightest fit)
    let bestFrame: BoardObject | null = null;
    let bestArea = Infinity;
    for (const frame of frames) {
      if (isFullyInside(updatedObj, frame)) {
        const area = frame.width * frame.height;
        if (area < bestArea) {
          bestArea = area;
          bestFrame = frame;
        }
      }
    }

    const newParentId = bestFrame?.id ?? '';
    const oldParentId = obj.parentId ?? '';
    if (oldParentId !== newParentId) {
      updateObject(id, { parentId: newParentId as any });
    }
  }, [updateObject, batchUpdate]);

  // ── Cleanup throttle timer on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (panSyncTimerRef.current) clearTimeout(panSyncTimerRef.current);
    };
  }, []);

  // ── Viewport culling (stable identity) ───────────────────────────────────
  const prevVisibleRef = useRef<{ ids: string; result: typeof objects }>({ ids: '', result: [] });
  const visibleObjects = useMemo(() => {
    const margin = 200;
    const vl = (-stagePos.x - margin) / stageScale;
    const vt = (-stagePos.y - margin) / stageScale;
    const vr = (windowSize.width - stagePos.x + margin) / stageScale;
    const vb = (windowSize.height - stagePos.y + margin) / stageScale;

    const filtered = objects.filter(obj =>
      selectedIds.has(obj.id) || isInViewport(obj, vl, vt, vr, vb)
    );

    const idKey = filtered.map(o => o.id).join(',');
    const prev = prevVisibleRef.current;
    if (idKey === prev.ids && filtered.length === prev.result.length) {
      // Same visible set — check if any object reference changed
      const changed = filtered.some((obj, i) => obj !== prev.result[i]);
      if (!changed) return prev.result;
    }
    prevVisibleRef.current = { ids: idKey, result: filtered };
    return filtered;
  }, [objects, stagePos, stageScale, windowSize, selectedIds]);

  // ── Space-key pan override ────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
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
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;

      // `/` toggles the Boardie chat panel
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-testid="boardie-toggle"], [data-testid="boardie-close"]')?.click();
        return;
      }

      const selected = [...selectedIds];

      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length > 0) {
        e.preventDefault();
        const deletingSet = new Set(selected);
        const allObjs = objectsRef.current;

        // Release frame children
        const releaseUpdates = allObjs
          .filter(o => o.parentId && deletingSet.has(o.parentId) && !deletingSet.has(o.id))
          .map(o => ({ id: o.id, changes: { parentId: '' as any } }));

        // Detach connectors: clear fromId/toId on lines connected to deleted objects
        for (const delId of deletingSet) {
          for (const conn of getConnectedLines(delId, allObjs)) {
            if (deletingSet.has(conn.line.id)) continue;
            const clearField = conn.endpoint === 'from' ? 'fromId' : 'toId';
            const clearAnchor = conn.endpoint === 'from' ? 'fromAnchor' : 'toAnchor';
            releaseUpdates.push({
              id: conn.line.id,
              changes: { [clearField]: '', [clearAnchor]: '' } as any,
            });
          }
        }

        if (releaseUpdates.length > 0) batchUpdate(releaseUpdates);
        batchDelete(selected);
        deselectAll();
        return;
      }

      if (e.key === 'Escape') {
        if (pendingLineStart) { setPendingLineStart(null); return; }
        deselectAll();
        setInlineEdit(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll(objects.map((o) => o.id));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.length > 0) {
        clipboardRef.current = objects.filter((o) => selected.includes(o.id));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault();
        const items = clipboardRef.current.map(({ type, x, y, id: _, createdBy: _1, createdByName: _2, zIndex: _3, fromId, toId, fromAnchor, toAnchor, ...rest }) => ({
          type, x: x + 20, y: y + 20, ...JSON.parse(JSON.stringify(rest)),
        }));
        const newIds = batchCreate(items);
        selectAll(newIds);
        clipboardRef.current = clipboardRef.current.map((o) => ({
          ...o, x: o.x + 20, y: o.y + 20,
        }));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selected.length > 0) {
        e.preventDefault();
        const items = objects
          .filter((o) => selected.includes(o.id))
          .map(({ type, x, y, id: _, createdBy: _1, createdByName: _2, zIndex: _3, fromId, toId, fromAnchor, toAnchor, ...rest }) => ({ type, x: x + 20, y: y + 20, ...JSON.parse(JSON.stringify(rest)) }));
        const newIds = batchCreate(items);
        selectAll(newIds);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, objects, pendingLineStart, batchDelete, batchCreate, batchUpdate, deselectAll, selectAll]);

  // ── Transformer: attach to selected non-line nodes ───────────────────────
  const objectsForTransformerRef = useRef(objects);
  objectsForTransformerRef.current = objects;

  useEffect(() => {
    if (!transformerRef.current || !layerRef.current) return;

    if (selectedIds.size > 0) {
      const nodes = [...selectedIds]
        .map((id) => {
          const obj = objectsForTransformerRef.current.find((o) => o.id === id);
          if (obj?.type === 'line') return null;
          return layerRef.current!.findOne(`#note-${id}`);
        })
        .filter((n): n is Konva.Node => n != null);
      transformerRef.current.nodes(nodes);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds]);

  // ── Tool change handlers ─────────────────────────────────────────────────
  const handleToolChange = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    setToolMode(tool === 'box-select' ? 'single' : 'infinite');
    setPendingLineStart(null);
  }, []);

  const handleModeToggle = useCallback(() => {
    setToolMode((prev) => (prev === 'infinite' ? 'single' : 'infinite'));
  }, []);

  const isDraggable = activeTool !== 'box-select' || spaceHeld;

  // ── Right-click: cancel pending line step 1 ──────────────────────────────
  const handleContextMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    if (pendingLineStart) setPendingLineStart(null);
  }, [pendingLineStart]);

  // ── Box-select drag ───────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'box-select') return;
    if (e.target !== e.target.getStage()) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const pos = stagePosRef.current;
    const scale = stageScaleRef.current;
    const cx = (pointer.x - pos.x) / scale;
    const cy = (pointer.y - pos.y) / scale;
    isBoxDraggingRef.current = true;
    setBoxSelectRect({ startX: cx, startY: cy, x: cx, y: cy, width: 0, height: 0 });
  }, [activeTool]);

  const handleMouseUp = useCallback(() => {
    if (!isBoxDraggingRef.current || !boxSelectRect) return;
    isBoxDraggingRef.current = false;
    const { x, y, width, height } = boxSelectRect;
    if (width > 4 || height > 4) {
      const hit = objects.filter((obj) => {
        const ox = obj.points ? Math.min(obj.points[0] ?? 0, obj.points[2] ?? 0) : obj.x;
        const oy = obj.points ? Math.min(obj.points[1] ?? 0, obj.points[3] ?? 0) : obj.y;
        const ow = obj.points ? Math.abs((obj.points[2] ?? 0) - (obj.points[0] ?? 0)) : obj.width;
        const oh = obj.points ? Math.abs((obj.points[3] ?? 0) - (obj.points[1] ?? 0)) : obj.height;
        return ox < x + width && ox + ow > x && oy < y + height && oy + oh > y;
      });
      setSelection(new Set(hit.map((o) => o.id)));
    }
    setBoxSelectRect(null);
    if (toolMode === 'single') {
      setActiveTool('cursor');
      setToolMode('infinite');
    }
  }, [boxSelectRect, objects, setSelection, toolMode]);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.05;
    const clamped = Math.max(0.1, Math.min(5,
      e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy));
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
    // Drive the grid directly so it updates in the same frame as the Stage,
    // not one React render later (mirrors the localCursorRef pattern).
    dotGridRef.current?.update(newPos, clamped);
  };

  // ── Pan + drag tracking ───────────────────────────────────────────────────
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === e.target.getStage()) {
      isPanningRef.current = false;
      layerRef.current?.listening(true);
      if (panSyncTimerRef.current) {
        clearTimeout(panSyncTimerRef.current);
        panSyncTimerRef.current = null;
      }
      const pos = { x: e.target.x(), y: e.target.y() };
      setStagePos(pos);
      dotGridRef.current?.update(pos, stageScaleRef.current);
    } else {
      setIsDraggingShape(false);

      // Persist connector updates
      if (connectorDragCacheRef.current.length > 0) {
        const node = e.target;
        const konvaId = node.id();
        const objId = konvaId.replace('note-', '');
        const draggedObj = objectsRef.current.find(o => o.id === objId);
        if (draggedObj) {
          const currentObj = { ...draggedObj, x: node.x(), y: node.y() };
          const connUpdates: Array<{ id: string; changes: Partial<BoardObject> }> = [];
          for (const entry of connectorDragCacheRef.current) {
            const otherEndIdx = entry.endpoint === 'from' ? 2 : 0;
            const otherPt = { x: entry.origPoints[otherEndIdx]!, y: entry.origPoints[otherEndIdx + 1]! };
            const resolved = resolveEndpoint(currentObj, undefined, otherPt);
            const pts = [...entry.origPoints];
            const endpointIdx = entry.endpoint === 'from' ? 0 : 1;
            pts[endpointIdx * 2] = resolved.x;
            pts[endpointIdx * 2 + 1] = resolved.y;
            connUpdates.push({ id: entry.lineId, changes: { points: pts, x: pts[0], y: pts[1] } });
          }
          if (connUpdates.length > 0) batchUpdate(connUpdates);
        }
        // Re-cache line groups via RAF
        for (const entry of connectorDragCacheRef.current) {
          requestAnimationFrame(() => {
            const group = entry.konvaNode as Konva.Group;
            if (group && !group.isClientRectOnScreen?.()) group.cache();
          });
        }
        connectorDragCacheRef.current = [];
      }

      frameDragStartRef.current = null;
      frameDragChildNodesRef.current.clear();
      frameDragChildOriginsRef.current.clear();
      frameDragChildPointsRef.current.clear();
    }
  }, [batchUpdate]);

  /** Ref-first pan: update ref + imperative DotGrid every frame,
   *  throttle state sync to ~150ms for viewport culling. */
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) {
      // Frame drag: imperatively move cached descendant nodes
      if (frameDragStartRef.current) {
        const node = e.target;
        const dx = node.x() - frameDragStartRef.current.x;
        const dy = node.y() - frameDragStartRef.current.y;
        for (const [childId, childNode] of frameDragChildNodesRef.current) {
          const origin = frameDragChildOriginsRef.current.get(childId);
          if (origin) {
            childNode.x(origin.x + dx);
            childNode.y(origin.y + dy);
          }
          const origPoints = frameDragChildPointsRef.current.get(childId);
          if (origPoints) {
            const shifted = origPoints.map((v, i) => v + (i % 2 === 0 ? dx : dy));
            const lineNode = (childNode as Konva.Group).children?.[0];
            if (lineNode && 'points' in lineNode) {
              (lineNode as Konva.Line).points(shifted);
            }
          }
        }
      }

      // Imperatively update connected lines
      if (connectorDragCacheRef.current.length > 0) {
        const node = e.target;
        const konvaId = node.id();
        const objId = konvaId.replace('note-', '');
        const draggedObj = objectsRef.current.find(o => o.id === objId);
        if (draggedObj) {
          const currentObj = {
            ...draggedObj,
            x: node.x(),
            y: node.y(),
          };
          for (const entry of connectorDragCacheRef.current) {
            const otherEndIdx = entry.endpoint === 'from' ? 2 : 0;
            const otherPt = { x: entry.origPoints[otherEndIdx]!, y: entry.origPoints[otherEndIdx + 1]! };
            const resolved = resolveEndpoint(currentObj, undefined, otherPt);
            const lineGroup = entry.konvaNode as Konva.Group;
            lineGroup.clearCache();
            // Find the Line/Arrow child and update its points
            const lineChild = lineGroup.findOne('Line') || lineGroup.findOne('Arrow');
            const endpointIdx = entry.endpoint === 'from' ? 0 : 1;
            if (lineChild) {
              const pts = [...entry.origPoints];
              pts[endpointIdx * 2] = resolved.x;
              pts[endpointIdx * 2 + 1] = resolved.y;
              (lineChild as any).points(pts);
            }
            // Update endpoint circle position
            const circles = (lineGroup as Konva.Group).find('Circle');
            const targetCircle = circles[endpointIdx];
            if (targetCircle) {
              targetCircle.x(resolved.x);
              targetCircle.y(resolved.y);
            }
          }
        }
        // Force repaint — .points() changes don't auto-trigger Konva redraw
        layerRef.current?.batchDraw();
      }
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const pos = { x: stage.x(), y: stage.y() };
    stagePosRef.current = pos;
    dotGridRef.current?.update(pos, stage.scaleX());

    if (!panSyncTimerRef.current) {
      panSyncTimerRef.current = setTimeout(() => {
        panSyncTimerRef.current = null;
        setStagePos(stagePosRef.current);
      }, 150);
    }
  }, []);

  // ── Object creation ───────────────────────────────────────────────────────
  const handleDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const now = Date.now();
    if (now - lastDblClickRef.current < 200) return;
    lastDblClickRef.current = now;

    if (activeTool === 'cursor' || activeTool === 'box-select') return;
    if (e.target !== e.target.getStage()) return;

    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const pos = stagePosRef.current;
    const scale = stageScaleRef.current;
    const x = (pointer.x - pos.x) / scale;
    const y = (pointer.y - pos.y) / scale;

    if (activeTool === 'line') {
      if (!pendingLineStart) {
        setPendingLineStart({ x, y });
      } else {
        const arrowOverrides: Partial<import('../types/board').BoardObject> = {};
        if (lineVariant === 'arrow') arrowOverrides.arrowEnd = true;
        if (lineVariant === 'double-arrow') { arrowOverrides.arrowStart = true; arrowOverrides.arrowEnd = true; }
        createObject('line', pendingLineStart.x, pendingLineStart.y, {
          points: [pendingLineStart.x, pendingLineStart.y, x, y],
          ...arrowOverrides,
        });
        setPendingLineStart(null);
        if (toolMode === 'single') {
          setActiveTool('cursor');
          setToolMode('infinite');
        }
      }
      return;
    }

    createObject(activeTool, x, y);
    if (toolMode === 'single') {
      setActiveTool('cursor');
      setToolMode('infinite');
    }
  }, [activeTool, pendingLineStart, toolMode, createObject, lineVariant]);

  // ── Cursor position + box-select rect update ─────────────────────────────
  const handleMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const pos = stagePosRef.current;
    const scale = stageScaleRef.current;
    const cx = (pointer.x - pos.x) / scale;
    const cy = (pointer.y - pos.y) / scale;
    if (!isPanningRef.current) {
      updateCursorPosition(cx, cy);
    }
    cursorPosRef.current = { x: cx, y: cy };
    if (pendingLineStart) {
      setLineCursorPos({ x: cx, y: cy });
    }
    if (isBoxDraggingRef.current && boxSelectRect) {
      setBoxSelectRect((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          x:      Math.min(cx, prev.startX),
          y:      Math.min(cy, prev.startY),
          width:  Math.abs(cx - prev.startX),
          height: Math.abs(cy - prev.startY),
        };
      });
    }
  }, [updateCursorPosition, pendingLineStart, boxSelectRect]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback((id: string, e?: unknown) => {
    const konvaEvent = e as Konva.KonvaEventObject<MouseEvent> | undefined;
    if (konvaEvent?.evt?.shiftKey) {
      toggleSelect(id);
    } else {
      select(id);
    }
    const obj = objectsRef.current.find(o => o.id === id);
    if (obj?.type !== 'frame') {
      updateObject(id, { zIndex: Date.now() });
    }
  }, [select, toggleSelect, updateObject]);

  const handleDeselectClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      deselectAll();
      if (inlineEdit) setInlineEdit(null);
    }
  }, [deselectAll, inlineEdit]);

  const handleDelete = useCallback((id: string) => {
    const allObjs = objectsRef.current;
    const obj = allObjs.find(o => o.id === id);
    const updates: Array<{ id: string; changes: Partial<BoardObject> }> = [];

    if (obj?.type === 'frame') {
      const children = allObjs.filter(o => o.parentId === id);
      for (const c of children) updates.push({ id: c.id, changes: { parentId: '' as any } });
    }

    // Detach connectors
    for (const conn of getConnectedLines(id, allObjs)) {
      const clearField = conn.endpoint === 'from' ? 'fromId' : 'toId';
      const clearAnchor = conn.endpoint === 'from' ? 'fromAnchor' : 'toAnchor';
      updates.push({ id: conn.line.id, changes: { [clearField]: '', [clearAnchor]: '' } as any });
    }

    if (updates.length > 0) batchUpdate(updates);
    deleteObject(id);
    deselectAll();
  }, [deleteObject, deselectAll, batchUpdate]);

  // ── Inline editing ────────────────────────────────────────────────────────
  const handleStartInlineEdit = useCallback((data: BoardObject) => {
    const stage = stageRef.current;
    if (!stage) return;
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

  const handleInlineEditBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (inlineEdit) {
      updateObject(inlineEdit.id, { content: e.target.value });
      setInlineEdit(null);
    }
  };

  const handleInlineEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!inlineEdit) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
      updateObject(inlineEdit.id, { content: e.currentTarget.value });
      setInlineEdit(null);
    }
    e.stopPropagation();
  };

  // ── Color picker ──────────────────────────────────────────────────────────
  const handleShowColorPicker = useCallback((noteId: string, position: { x: number; y: number }) => {
    setColorPickerNote(noteId);
    setColorPickerPos(position);
  }, []);

  const handleColorChange = useCallback((color: string) => {
    if (colorPickerNote) {
      updateObject(colorPickerNote, { color });
      setColorPickerNote(null);
    }
  }, [colorPickerNote, updateObject]);

  // ── Clear all ─────────────────────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    if (window.confirm('Delete all objects? This cannot be undone.')) {
      deleteAllObjects();
      deselectAll();
    }
  }, [deleteAllObjects, deselectAll]);

  // ── Stable callbacks for child props ─────────────────────────────────────
  /** Called by ObjectRenderer when a transform begins; marks drag-in-progress
   *  so the selection action menu stays hidden (avoids stale-position jitter). */
  const handleTransformStart = useCallback(() => setIsDraggingShape(true), []);
  const handleTransformEnd   = useCallback(() => setIsDraggingShape(false), []);

  // ── Connector updates during Transformer rotate/resize ──────────────────
  interface TransformConnectorEntry {
    lineId: string;
    lineNode: Konva.Group;
    endpoint: 'from' | 'to';
    connectedObjId: string;
    origPoints: number[];
  }
  const transformConnectorCacheRef = useRef<TransformConnectorEntry[]>([]);

  const handleTransformerTransformStart = useCallback(() => {
    setIsDraggingShape(true);
    // Cache connected lines for all nodes being transformed
    const entries: TransformConnectorEntry[] = [];
    const layer = layerRef.current;
    if (!layer) return;

    const allObjs = objectsRef.current;
    const checkedLineIds = new Set<string>();
    for (const selId of selectedIds) {
      for (const conn of getConnectedLines(selId, allObjs)) {
        if (checkedLineIds.has(conn.line.id)) continue;
        if (selectedIds.has(conn.line.id)) continue; // skip lines that are themselves selected
        checkedLineIds.add(conn.line.id);
        const lineNode = layer.findOne(`#note-${conn.line.id}`) as Konva.Group | null;
        if (lineNode) {
          entries.push({
            lineId: conn.line.id,
            lineNode,
            endpoint: conn.endpoint,
            connectedObjId: selId,
            origPoints: [...(conn.line.points ?? [])],
          });
        }
      }
    }
    transformConnectorCacheRef.current = entries;
  }, [selectedIds]);

  const handleTransformerTransform = useCallback(() => {
    if (transformConnectorCacheRef.current.length === 0) return;
    const layer = layerRef.current;
    if (!layer) return;

    for (const entry of transformConnectorCacheRef.current) {
      const objNode = layer.findOne(`#note-${entry.connectedObjId}`) as Konva.Group | null;
      if (!objNode) continue;

      // Read live transform state from the Konva node
      const baseObj = objectsRef.current.find(o => o.id === entry.connectedObjId);
      if (!baseObj) continue;
      const liveObj: BoardObject = {
        ...baseObj,
        x: objNode.x(),
        y: objNode.y(),
        width: baseObj.width * objNode.scaleX(),
        height: baseObj.height * objNode.scaleY(),
        rotation: objNode.rotation(),
      };

      const otherEndIdx = entry.endpoint === 'from' ? 2 : 0;
      const otherPt = { x: entry.origPoints[otherEndIdx]!, y: entry.origPoints[otherEndIdx + 1]! };
      const resolved = resolveEndpoint(liveObj, undefined, otherPt);

      entry.lineNode.clearCache();
      const lineChild = entry.lineNode.findOne('Line') || entry.lineNode.findOne('Arrow');
      const endpointIdx = entry.endpoint === 'from' ? 0 : 1;
      if (lineChild) {
        const pts = [...entry.origPoints];
        pts[endpointIdx * 2] = resolved.x;
        pts[endpointIdx * 2 + 1] = resolved.y;
        (lineChild as any).points(pts);
      }
      const circles = entry.lineNode.find('Circle');
      const targetCircle = circles[endpointIdx];
      if (targetCircle) {
        targetCircle.x(resolved.x);
        targetCircle.y(resolved.y);
      }
    }
    layerRef.current?.batchDraw();
  }, []);

  const handleTransformerTransformEnd = useCallback(() => {
    setIsDraggingShape(false);

    if (transformConnectorCacheRef.current.length === 0) return;
    const layer = layerRef.current;
    if (!layer) return;

    const connUpdates: Array<{ id: string; changes: Partial<BoardObject> }> = [];
    for (const entry of transformConnectorCacheRef.current) {
      const objNode = layer.findOne(`#note-${entry.connectedObjId}`) as Konva.Group | null;
      if (!objNode) continue;

      const baseObj = objectsRef.current.find(o => o.id === entry.connectedObjId);
      if (!baseObj) continue;
      const liveObj: BoardObject = {
        ...baseObj,
        x: objNode.x(),
        y: objNode.y(),
        width: baseObj.width * objNode.scaleX(),
        height: baseObj.height * objNode.scaleY(),
        rotation: objNode.rotation(),
      };

      const otherEndIdx = entry.endpoint === 'from' ? 2 : 0;
      const otherPt = { x: entry.origPoints[otherEndIdx]!, y: entry.origPoints[otherEndIdx + 1]! };
      const resolved = resolveEndpoint(liveObj, undefined, otherPt);

      const pts = [...entry.origPoints];
      const endpointIdx = entry.endpoint === 'from' ? 0 : 1;
      pts[endpointIdx * 2] = resolved.x;
      pts[endpointIdx * 2 + 1] = resolved.y;
      connUpdates.push({ id: entry.lineId, changes: { points: pts, x: pts[0], y: pts[1] } });

      // Re-cache
      requestAnimationFrame(() => { entry.lineNode?.cache(); });
    }
    if (connUpdates.length > 0) batchUpdate(connUpdates);
    transformConnectorCacheRef.current = [];
  }, [batchUpdate]);

  /** Called by ObjectRenderer after a resize so Transformer bbox stays in sync. */
  const handleDimsChanged = useCallback(() => {
    transformerRef.current?.forceUpdate();
  }, []);

  // ── Transformer drag: move selected lines with group ────────────────────
  const trDragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const handleTransformerDragStart = useCallback(() => {
    setIsDraggingShape(true);
    const tr = transformerRef.current;
    if (tr) trDragStartPosRef.current = { x: tr.x(), y: tr.y() };
  }, []);

  const handleTransformerDragEnd = useCallback(() => {
    setIsDraggingShape(false);
    const tr = transformerRef.current;
    if (!tr || !trDragStartPosRef.current) return;
    const dx = tr.x() - trDragStartPosRef.current.x;
    const dy = tr.y() - trDragStartPosRef.current.y;
    trDragStartPosRef.current = null;
    if (dx === 0 && dy === 0) return;

    // Find selected lines and translate their points
    const lineUpdates: Array<{ id: string; changes: Partial<BoardObject> }> = [];
    for (const selId of selectedIds) {
      const obj = objectsRef.current.find(o => o.id === selId);
      if (obj?.type === 'line' && obj.points && obj.points.length >= 4) {
        const pts = obj.points;
        const newPts = [pts[0]! + dx, pts[1]! + dy, pts[2]! + dx, pts[3]! + dy];
        lineUpdates.push({
          id: obj.id,
          changes: { points: newPts, x: newPts[0], y: newPts[1], fromId: '', toId: '', fromAnchor: '' as any, toAnchor: '' as any },
        });
        // Also imperatively move the Konva node
        const lineNode = layerRef.current?.findOne(`#note-${obj.id}`);
        if (lineNode) {
          lineNode.x(0);
          lineNode.y(0);
        }
      }
    }
    if (lineUpdates.length > 0) batchUpdate(lineUpdates);
  }, [selectedIds, batchUpdate]);

  // ── Frame drag: imperative child movement (local-only until dragEnd) ─────
  const frameDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const frameDragChildNodesRef = useRef<Map<string, Konva.Node>>(new Map());
  const frameDragChildOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const frameDragChildPointsRef = useRef<Map<string, number[]>>(new Map());

  // ── Connector drag cache: imperatively update connected lines during drag ──
  interface ConnectorDragEntry {
    lineId: string;
    konvaNode: Konva.Node;
    endpoint: 'from' | 'to';
    origPoints: number[];
  }
  const connectorDragCacheRef = useRef<ConnectorDragEntry[]>([]);

  /** Fired when any drag begins on the Stage; distinguishes shape drags from
   *  canvas pans so the selection action menu is hidden during shape movement. */
  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) {
      setIsDraggingShape(true);

      // If dragging a frame, cache descendant node refs for imperative movement
      const node = e.target;
      const konvaId = node.id();
      const objId = konvaId.replace('note-', '');
      const obj = objectsRef.current.find(o => o.id === objId);

      // Cache connected lines for imperative movement during drag
      const connEntries: ConnectorDragEntry[] = [];
      const allObjs = objectsRef.current;
      const idsToCheck = [objId];

      // If frame, also check descendants for external connectors
      if (obj?.type === 'frame') {
        const descendants = getDescendantIds(objId, allObjs);
        idsToCheck.push(...descendants);
      }

      const layer = layerRef.current;
      if (layer) {
        const checkedLineIds = new Set<string>();
        for (const checkId of idsToCheck) {
          for (const conn of getConnectedLines(checkId, allObjs)) {
            if (checkedLineIds.has(conn.line.id)) continue;
            checkedLineIds.add(conn.line.id);
            const lineNode = layer.findOne(`#note-${conn.line.id}`);
            if (lineNode) {
              connEntries.push({
                lineId: conn.line.id,
                konvaNode: lineNode,
                endpoint: conn.endpoint,
                origPoints: [...(conn.line.points ?? [])],
              });
            }
          }
        }
      }
      connectorDragCacheRef.current = connEntries;

      if (obj?.type === 'frame') {
        frameDragStartRef.current = { x: node.x(), y: node.y() };
        const allObjs = objectsRef.current;
        const descendants = getDescendantIds(objId, allObjs);
        const layer = layerRef.current;
        const nodeMap = new Map<string, Konva.Node>();
        const originMap = new Map<string, { x: number; y: number }>();
        if (layer) {
          for (const childId of descendants) {
            const childNode = layer.findOne(`#note-${childId}`);
            if (childNode) {
              nodeMap.set(childId, childNode);
              // Read origins from Yjs data (source of truth), not Konva nodes,
              // which may retain stale imperative positions from a prior drag.
              const childObj = allObjs.find(o => o.id === childId);
              originMap.set(childId, childObj
                ? { x: childObj.x, y: childObj.y }
                : { x: childNode.x(), y: childNode.y() });
            }
          }
        }
        frameDragChildNodesRef.current = nodeMap;
        frameDragChildOriginsRef.current = originMap;
        const pointsMap = new Map<string, number[]>();
        for (const childId of descendants) {
          const childObj = allObjs.find(o => o.id === childId);
          if (childObj?.type === 'line' && childObj.points && childObj.points.length >= 4) {
            pointsMap.set(childId, [...childObj.points]);
          }
        }
        frameDragChildPointsRef.current = pointsMap;
      } else {
        frameDragStartRef.current = null;
      }
    } else {
      isPanningRef.current = true;
      layerRef.current?.listening(false);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div data-testid="canvas-stage" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#f5f5f5' }}>
      <DotGrid ref={dotGridRef} />
      <Stage
        ref={stageRef}
        width={windowSize.width}
        height={windowSize.height}
        draggable={isDraggable}
        style={{ cursor: isDraggable ? 'grab' : 'crosshair' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
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
            objects={visibleObjects}
            selectedIds={selectedIds}
            inlineEditId={inlineEdit?.id ?? null}
            onSelect={handleSelect}
            onUpdate={handleFrameAwareUpdate}
            onDelete={handleDelete}
            onShowColorPicker={handleShowColorPicker}
            onTransformStart={handleTransformStart}
            onTransformEnd={handleTransformEnd}
            onDimsChanged={handleDimsChanged}
            onStartEdit={handleStartInlineEdit}
            stageScaleRef={stageScaleRef}
          />
          {boxSelectRect && <SelectionRect {...boxSelectRect} />}
          {pendingLineStart && (
            <LinePreview
              x1={pendingLineStart.x} y1={pendingLineStart.y}
              x2={lineCursorPos.x}    y2={lineCursorPos.y}
              lineVariant={lineVariant}
            />
          )}
          <Transformer
            ref={transformerRef}
            onTransformStart={handleTransformerTransformStart}
            onTransform={handleTransformerTransform}
            onTransformEnd={handleTransformerTransformEnd}
            onDragStart={handleTransformerDragStart}
            onDragEnd={handleTransformerDragEnd}
            boundBoxFunc={boundBoxFunc}
          />
        </Layer>

        <Layer listening={false}>
          {presence.map((user) => (
            <Cursor key={user.id} data={user} />
          ))}
        </Layer>
      </Stage>

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
        lineVariant={lineVariant}
        onToolChange={handleToolChange}
        onModeToggle={handleModeToggle}
        onLineVariantChange={setLineVariant}
      />

      <InfoOverlay
        stageScale={stageScale}
        stagePos={stagePos}
        objectCount={objects.length}
        loading={loading}
      />

      {selectedIds.size > 1 && (
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#4ECDC4', color: 'white', padding: '4px 12px',
          borderRadius: 20, fontSize: 13, fontWeight: 600, zIndex: 1000,
        }}>
          {selectedIds.size} objects selected
        </div>
      )}

      <button
        onClick={objects.length > 0 ? handleClearAll : undefined}
        disabled={objects.length === 0}
        style={{
          position: 'absolute', bottom: 20, left: boardieOpen ? 380 : 20,
          transition: 'left 0.25s ease, opacity 0.2s ease, background 0.2s ease', zIndex: 1001,
          background: objects.length > 0 ? '#ff6b6b' : 'rgba(255,107,107,0.25)',
          color: objects.length > 0 ? 'white' : 'rgba(255,255,255,0.4)',
          border: 'none',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: objects.length > 0 ? 'pointer' : 'default',
          boxShadow: objects.length > 0 ? '0 4px 12px rgba(255,107,107,0.3)' : 'none',
        }}
      >
        🗑️ Clear All
      </button>

      <DebugOverlay stageScaleRef={stageScaleRef} stagePosRef={stagePosRef} />

      <ChatWidget stagePosRef={stagePosRef} stageScaleRef={stageScaleRef} onOpenChange={setBoardieOpen} />

      <ColorPicker
        noteId={colorPickerNote}
        position={colorPickerPos}
        onColorChange={handleColorChange}
        onClose={() => setColorPickerNote(null)}
      />

      {/* Selection action menu — HTML overlay, never affects Transformer bbox.
          Hidden while a shape drag is in progress to avoid stale position lag. */}
      {!isDraggingShape && !isPanningRef.current && selectedIds.size === 1 && (() => {
        const selId  = [...selectedIds][0];
        const selObj = objects.find((o) => o.id === selId);
        if (!selObj || !selId) return null;

        let btnScreenX: number;
        let btnScreenY: number;
        if (selObj.type === 'line') {
          const pts = selObj.points ?? [selObj.x, selObj.y, selObj.x + 200, selObj.y];
          const mx = ((pts[0] ?? 0) + (pts[2] ?? 0)) / 2;
          const my = ((pts[1] ?? 0) + (pts[3] ?? 0)) / 2;
          btnScreenX = stagePos.x + mx * stageScale;
          btnScreenY = stagePos.y + my * stageScale - 28;
        } else {
          const r = (selObj.rotation ?? 0) * Math.PI / 180;
          const canvasTCX = selObj.x + (selObj.width / 2) * Math.cos(r);
          const canvasTCY = selObj.y + (selObj.width / 2) * Math.sin(r);
          btnScreenX = stagePos.x + canvasTCX * stageScale + Math.sin(r) * 28;
          btnScreenY = stagePos.y + canvasTCY * stageScale - Math.cos(r) * 28;
        }

        const btnStyle: React.CSSProperties = {
          width: 24, height: 24, border: 'none', borderRadius: '50%',
          cursor: 'pointer', fontSize: 12, fontWeight: 'bold', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        };

        const rotateDeg = selObj.type === 'line' ? 0 : (selObj.rotation ?? 0);
        return (
          <div style={{
            position: 'absolute',
            left: btnScreenX, top: btnScreenY,
            transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
            display: 'flex', gap: 8, zIndex: 1200,
          }}>
            {selObj.type !== 'line' && (
              <button
                title="Change color"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleShowColorPicker(selObj.id, { x: rect.right + 8, y: rect.top });
                }}
                style={{ ...btnStyle, background: '#4ECDC4' }}
              >⋮</button>
            )}
            <button
              title="Delete"
              onClick={() => handleDelete(selObj.id)}
              style={{ ...btnStyle, background: '#ff6b6b' }}
            >✕</button>
          </div>
        );
      })()}
    </div>
  );
}
