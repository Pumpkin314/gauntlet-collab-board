import type { BoardObject, ShapeType } from '../types/board';
import { resolveColor } from './capabilities';

export interface BoardStateFilter {
  type?: string;
  color?: string;
  content_contains?: string;
  spatial?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  spatial_threshold?: number;
}

export interface ResolvedObject {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  content?: string;
}

/**
 * Filter board objects by type, color, content, and spatial position.
 * All provided filters are AND'd together.
 */
export function resolveObjects(objects: BoardObject[], filter: BoardStateFilter): ResolvedObject[] {
  if (objects.length === 0) return [];

  const threshold = filter.spatial_threshold ?? 0.25;

  // Compute bounding box across ALL objects (before filtering)
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const obj of objects) {
    if (obj.x < xMin) xMin = obj.x;
    if (obj.x + obj.width > xMax) xMax = obj.x + obj.width;
    if (obj.y < yMin) yMin = obj.y;
    if (obj.y + obj.height > yMax) yMax = obj.y + obj.height;
  }

  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  // Degenerate bounding box → widen threshold
  const effectiveThreshold = (xRange < 50 && yRange < 50) ? 0.5 : threshold;

  let result = objects;

  if (filter.type) {
    result = result.filter((obj) => obj.type === filter.type);
  }

  if (filter.color) {
    const targetHex = resolveColor(filter.color).toLowerCase();
    result = result.filter((obj) => obj.color.toLowerCase() === targetHex);
  }

  if (filter.content_contains) {
    const needle = filter.content_contains.toLowerCase();
    result = result.filter((obj) => obj.content?.toLowerCase().includes(needle));
  }

  if (filter.spatial && objects.length > 1) {
    const t = effectiveThreshold;
    result = result.filter((obj) => {
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;

      switch (filter.spatial) {
        case 'top':
          return cy < yMin + yRange * t;
        case 'bottom':
          return cy > yMax - yRange * t;
        case 'left':
          return cx < xMin + xRange * t;
        case 'right':
          return cx > xMax - xRange * t;
        case 'center':
          return (
            cx > xMin + xRange * t &&
            cx < xMax - xRange * t &&
            cy > yMin + yRange * t &&
            cy < yMax - yRange * t
          );
        default:
          return true;
      }
    });
  }

  return result.map(toResolved);
}

function toResolved(obj: BoardObject): ResolvedObject {
  const resolved: ResolvedObject = {
    id: obj.id,
    type: obj.type,
    x: Math.round(obj.x),
    y: Math.round(obj.y),
    width: Math.round(obj.width),
    height: Math.round(obj.height),
    color: obj.color,
  };
  if (obj.content !== undefined) {
    resolved.content = obj.content;
  }
  return resolved;
}
