import type { BoardObject } from '../types/board';
import { rotatePoint } from './connectorSnap';

/** Project point onto segment, return closest point. */
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

const MIDPOINT_SNAP_RADIUS = 20;

/**
 * Given a connected object and the other endpoint's position, compute the
 * attachment point on the object's boundary.
 *
 * Two-tier: if otherPt is near an edge midpoint, snaps there. Otherwise
 * projects freely onto the nearest edge. Rotation-aware (Konva origin pivot).
 */
export function resolveEndpoint(
  obj: BoardObject,
  anchorHint?: 'top' | 'right' | 'bottom' | 'left' | null,
  otherPt?: { x: number; y: number },
): { x: number; y: number } {
  const { x, y, width: w, height: h, rotation } = obj;
  const rot = rotation ?? 0;
  const r = (px: number, py: number) => rotatePoint(px, py, x, y, rot);

  // Circle/ellipse: project onto ellipse perimeter
  if (obj.type === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;

    const cardinals: { pt: { x: number; y: number }; name: string }[] = [
      { pt: { x: cx, y: y },         name: 'top' },
      { pt: { x: x + w, y: cy },     name: 'right' },
      { pt: { x: cx, y: y + h },     name: 'bottom' },
      { pt: { x: x, y: cy },         name: 'left' },
    ];

    if (anchorHint) {
      const match = cardinals.find(c => c.name === anchorHint);
      if (match) return match.pt;
    }

    if (!otherPt) return cardinals[0].pt;

    // Tier 1: snap to cardinal if close
    for (const c of cardinals) {
      if (Math.hypot(otherPt.x - c.pt.x, otherPt.y - c.pt.y) < MIDPOINT_SNAP_RADIUS) return c.pt;
    }

    // Tier 2: project onto ellipse perimeter
    const angle = Math.atan2((otherPt.y - cy) / ry, (otherPt.x - cx) / rx);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  }

  // Rotated edge midpoints (rect-like objects)
  const midpoints: { pt: { x: number; y: number }; name: string }[] = [
    { pt: r(x + w / 2, y),         name: 'top' },
    { pt: r(x + w, y + h / 2),     name: 'right' },
    { pt: r(x + w / 2, y + h),     name: 'bottom' },
    { pt: r(x, y + h / 2),         name: 'left' },
  ];

  if (anchorHint) {
    const match = midpoints.find(m => m.name === anchorHint);
    if (match) return match.pt;
  }

  if (!otherPt) return midpoints[0].pt;

  // Tier 1: check if otherPt is near a midpoint
  for (const mp of midpoints) {
    const dist = Math.hypot(otherPt.x - mp.pt.x, otherPt.y - mp.pt.y);
    if (dist < MIDPOINT_SNAP_RADIUS) return mp.pt;
  }

  // Tier 2: project onto nearest edge (free slide)
  const corners = [r(x, y), r(x + w, y), r(x + w, y + h), r(x, y + h)];
  const edges = [
    { p1: corners[0], p2: corners[1] },
    { p1: corners[1], p2: corners[2] },
    { p1: corners[2], p2: corners[3] },
    { p1: corners[3], p2: corners[0] },
  ];

  let bestDist = Infinity;
  let bestPt = midpoints[0].pt;
  for (const edge of edges) {
    const proj = projectOntoSegment(otherPt.x, otherPt.y, edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
    if (proj.dist < bestDist) {
      bestDist = proj.dist;
      bestPt = { x: proj.x, y: proj.y };
    }
  }
  return bestPt;
}
