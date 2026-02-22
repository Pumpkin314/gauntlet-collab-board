import type { BoardObject } from '../types/board';

export interface AnchorPoint {
  x: number;
  y: number;
  weight: number;
  anchor?: 'top' | 'right' | 'bottom' | 'left';
}

export interface SnapResult {
  snapped: boolean;
  x: number;
  y: number;
  objectId?: string;
  anchor?: 'top' | 'right' | 'bottom' | 'left' | null;
}

/** Returns weighted snap points for an object's boundary. */
export function getAnchorPoints(obj: BoardObject): AnchorPoint[] {
  if (obj.type === 'line' || obj.type === 'frame') return [];

  const { x, y, width: w, height: h } = obj;

  if (obj.type === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const points: AnchorPoint[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const anchorName = i === 0 ? 'right' : i === 2 ? 'bottom' : i === 4 ? 'left' : i === 6 ? 'top' : undefined;
      points.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        weight: anchorName ? 1.0 : 0.6,
        anchor: anchorName,
      });
    }
    return points;
  }

  // Rect-like shapes (sticky, rect, text)
  const midpoints: AnchorPoint[] = [
    { x: x + w / 2, y,         weight: 1.0, anchor: 'top' },
    { x: x + w,     y: y + h / 2, weight: 1.0, anchor: 'right' },
    { x: x + w / 2, y: y + h,     weight: 1.0, anchor: 'bottom' },
    { x,            y: y + h / 2, weight: 1.0, anchor: 'left' },
  ];

  const corners: AnchorPoint[] = [
    { x,        y,        weight: 1.0 },
    { x: x + w, y,        weight: 1.0 },
    { x: x + w, y: y + h, weight: 1.0 },
    { x,        y: y + h, weight: 1.0 },
  ];

  // Interpolated boundary points between corners and midpoints
  const interp: AnchorPoint[] = [
    { x: x + w * 0.25, y,         weight: 0.6 },
    { x: x + w * 0.75, y,         weight: 0.6 },
    { x: x + w,        y: y + h * 0.25, weight: 0.6 },
    { x: x + w,        y: y + h * 0.75, weight: 0.6 },
    { x: x + w * 0.75, y: y + h,  weight: 0.6 },
    { x: x + w * 0.25, y: y + h,  weight: 0.6 },
    { x,               y: y + h * 0.75, weight: 0.6 },
    { x,               y: y + h * 0.25, weight: 0.6 },
  ];

  return [...midpoints, ...corners, ...interp];
}

/**
 * Finds the nearest snap target within threshold.
 * Effective threshold scales with point weight and inverse zoom.
 */
export function findSnapTarget(
  cursorX: number,
  cursorY: number,
  candidates: BoardObject[],
  excludeIds: Set<string>,
  thresholdScreenPx: number,
  scale: number,
): SnapResult {
  let bestDist = Infinity;
  let best: SnapResult = { snapped: false, x: cursorX, y: cursorY };

  for (const obj of candidates) {
    if (excludeIds.has(obj.id)) continue;
    const anchors = getAnchorPoints(obj);
    for (const pt of anchors) {
      const effectiveThreshold = (thresholdScreenPx * pt.weight) / scale;
      const dx = cursorX - pt.x;
      const dy = cursorY - pt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < effectiveThreshold && dist < bestDist) {
        bestDist = dist;
        best = {
          snapped: true,
          x: pt.x,
          y: pt.y,
          objectId: obj.id,
          anchor: pt.anchor ?? null,
        };
      }
    }
  }

  return best;
}
