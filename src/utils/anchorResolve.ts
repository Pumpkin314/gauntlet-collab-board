import type { BoardObject } from '../types/board';

/**
 * Given a connected object and optional anchor hint, compute the absolute
 * attachment point. If no hint, returns the nearest edge midpoint to otherPt.
 */
export function resolveEndpoint(
  obj: BoardObject,
  anchorHint?: 'top' | 'right' | 'bottom' | 'left' | null,
  otherPt?: { x: number; y: number },
): { x: number; y: number } {
  const { x, y, width: w, height: h } = obj;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const edgeMidpoints: Record<string, { x: number; y: number }> = {
    top:    { x: cx, y },
    right:  { x: x + w, y: cy },
    bottom: { x: cx, y: y + h },
    left:   { x, y: cy },
  };

  if (anchorHint && edgeMidpoints[anchorHint]) {
    return edgeMidpoints[anchorHint];
  }

  if (!otherPt) return { x: cx, y };

  // Pick the nearest edge midpoint to the other endpoint
  let bestDist = Infinity;
  let bestPt = edgeMidpoints.top;
  for (const pt of Object.values(edgeMidpoints)) {
    const dx = otherPt.x - pt.x;
    const dy = otherPt.y - pt.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestPt = pt;
    }
  }
  return bestPt;
}
