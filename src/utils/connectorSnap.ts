import type { BoardObject } from '../types/board';

export interface SnapResult {
  snapped: boolean;
  x: number;
  y: number;
  objectId?: string;
  anchor?: 'top' | 'right' | 'bottom' | 'left' | null;
}

/** Rotate a point around a center by angleDeg degrees. */
export function rotatePoint(
  px: number, py: number,
  cx: number, cy: number,
  angleDeg: number,
): { x: number; y: number } {
  if (angleDeg === 0) return { x: px, y: py };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Edge defined by two endpoints and an anchor name. */
interface Edge {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  anchor: 'top' | 'right' | 'bottom' | 'left';
}

/** Project a point onto a line segment, returning the closest point and distance. */
function projectOntoSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; dist: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { x: ax, y: ay, dist: Math.hypot(px - ax, py - ay) };
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  return { x: projX, y: projY, dist: Math.hypot(px - projX, py - projY) };
}

interface KeyPoint {
  x: number;
  y: number;
  anchor: 'top' | 'right' | 'bottom' | 'left' | undefined;
}

/** Get the 4 corners and 4 edge midpoints of a rect-like object, rotation-aware. */
function getRectKeyPoints(obj: BoardObject): KeyPoint[] {
  const { x, y, width: w, height: h, rotation } = obj;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rot = rotation ?? 0;
  const r = (px: number, py: number) => rotatePoint(px, py, cx, cy, rot);

  // Edge midpoints
  const top    = r(x + w / 2, y);
  const right  = r(x + w, y + h / 2);
  const bottom = r(x + w / 2, y + h);
  const left   = r(x, y + h / 2);

  // Corners
  const tl = r(x, y);
  const tr = r(x + w, y);
  const br = r(x + w, y + h);
  const bl = r(x, y + h);

  return [
    { ...top,    anchor: 'top' as const },
    { ...right,  anchor: 'right' as const },
    { ...bottom, anchor: 'bottom' as const },
    { ...left,   anchor: 'left' as const },
    { ...tl, anchor: undefined },
    { ...tr, anchor: undefined },
    { ...br, anchor: undefined },
    { ...bl, anchor: undefined },
  ];
}

/** Get the 4 edges of a rect-like object, rotation-aware. */
function getRectEdges(obj: BoardObject): Edge[] {
  const { x, y, width: w, height: h, rotation } = obj;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rot = rotation ?? 0;
  const r = (px: number, py: number) => rotatePoint(px, py, cx, cy, rot);

  const tl = r(x, y);
  const tr = r(x + w, y);
  const br = r(x + w, y + h);
  const bl = r(x, y + h);

  return [
    { p1: tl, p2: tr, anchor: 'top' },
    { p1: tr, p2: br, anchor: 'right' },
    { p1: br, p2: bl, anchor: 'bottom' },
    { p1: bl, p2: tl, anchor: 'left' },
  ];
}

/**
 * Two-tier snap: first check corners/midpoints (strong snap), then fall back
 * to edge projection (free slide along nearest edge).
 *
 * For circles: snap to 4 cardinal points (strong), then project onto ellipse boundary.
 */
export function findSnapTarget(
  cursorX: number,
  cursorY: number,
  candidates: BoardObject[],
  excludeIds: Set<string>,
  thresholdScreenPx: number,
  scale: number,
): SnapResult {
  const threshold = thresholdScreenPx / scale;
  const cornerMidThreshold = threshold * 0.5; // tighter radius for discrete points

  let bestPointDist = Infinity;
  let bestPointResult: SnapResult | null = null;

  let bestEdgeDist = Infinity;
  let bestEdgeResult: SnapResult | null = null;

  for (const obj of candidates) {
    if (excludeIds.has(obj.id)) continue;
    if (obj.type === 'line' || obj.type === 'frame') continue;

    if (obj.type === 'circle') {
      // Circle: snap to cardinal points, then project onto boundary
      const { x, y, width: w, height: h } = obj;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;

      const cardinals: { x: number; y: number; anchor: 'top' | 'right' | 'bottom' | 'left' }[] = [
        { x: cx + rx, y: cy, anchor: 'right' },
        { x: cx, y: cy + ry, anchor: 'bottom' },
        { x: cx - rx, y: cy, anchor: 'left' },
        { x: cx, y: cy - ry, anchor: 'top' },
      ];

      for (const pt of cardinals) {
        const dist = Math.hypot(cursorX - pt.x, cursorY - pt.y);
        if (dist < cornerMidThreshold && dist < bestPointDist) {
          bestPointDist = dist;
          bestPointResult = { snapped: true, x: pt.x, y: pt.y, objectId: obj.id, anchor: pt.anchor };
        }
      }

      // Edge snap: project cursor onto ellipse boundary
      const dx = cursorX - cx;
      const dy = cursorY - cy;
      const angle = Math.atan2(dy / ry, dx / rx);
      const projX = cx + rx * Math.cos(angle);
      const projY = cy + ry * Math.sin(angle);
      const dist = Math.hypot(cursorX - projX, cursorY - projY);
      if (dist < threshold && dist < bestEdgeDist) {
        bestEdgeDist = dist;
        // Determine nearest named anchor
        const nearestAnchor = Math.abs(angle) < Math.PI / 4 ? 'right'
          : angle > Math.PI * 0.75 || angle < -Math.PI * 0.75 ? 'left'
          : angle > 0 ? 'bottom' : 'top';
        bestEdgeResult = { snapped: true, x: projX, y: projY, objectId: obj.id, anchor: nearestAnchor };
      }
      continue;
    }

    // Rect-like: corners + midpoints (tier 1)
    const keyPoints = getRectKeyPoints(obj);
    for (const pt of keyPoints) {
      const dist = Math.hypot(cursorX - pt.x, cursorY - pt.y);
      if (dist < cornerMidThreshold && dist < bestPointDist) {
        bestPointDist = dist;
        bestPointResult = { snapped: true, x: pt.x, y: pt.y, objectId: obj.id, anchor: pt.anchor ?? null };
      }
    }

    // Edge projection (tier 2)
    const edges = getRectEdges(obj);
    for (const edge of edges) {
      const proj = projectOntoSegment(cursorX, cursorY, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
      if (proj.dist < threshold && proj.dist < bestEdgeDist) {
        bestEdgeDist = proj.dist;
        bestEdgeResult = { snapped: true, x: proj.x, y: proj.y, objectId: obj.id, anchor: edge.anchor };
      }
    }
  }

  // Tier 1 wins over tier 2
  if (bestPointResult) return bestPointResult;
  if (bestEdgeResult) return bestEdgeResult;
  return { snapped: false, x: cursorX, y: cursorY };
}
