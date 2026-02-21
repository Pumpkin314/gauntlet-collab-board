import type { ViewportCenter } from './types';

/**
 * Compute grid positions for `count` items centered around `center`.
 * Items are arranged in a roughly-square grid with `spacing` pixels between centers.
 */
export function gridPositions(
  count: number,
  center: ViewportCenter,
  spacing = 220,
): Array<{ x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const startX = center.x - ((cols - 1) * spacing) / 2;
  const startY = center.y - ((rows - 1) * spacing) / 2;

  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: startX + col * spacing,
      y: startY + row * spacing,
    });
  }
  return positions;
}

/**
 * Distribute `count` items evenly around a circle of the given radius.
 * First item starts at the top (270°).
 */
export function circlePositions(
  count: number,
  cx: number,
  cy: number,
  radius: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });
}

/**
 * Generate positions for a linear flow (pipeline / flowchart).
 * Items are evenly spaced along the given axis starting from (startX, startY).
 */
export function flowPositions(
  count: number,
  dir: 'horizontal' | 'vertical',
  startX: number,
  startY: number,
  spacing = 220,
): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: dir === 'horizontal' ? startX + i * spacing : startX,
    y: dir === 'vertical'   ? startY + i * spacing : startY,
  }));
}

/**
 * Tile `count` equally-sized cells inside a container rectangle, with `padding`
 * between cells and the container edges. Returns position + dimensions per cell.
 */
export function fitInside(
  container: { x: number; y: number; w: number; h: number },
  count: number,
  padding = 20,
): Array<{ x: number; y: number; width: number; height: number }> {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const cellW = (container.w - padding * (cols + 1)) / cols;
  const cellH = (container.h - padding * (rows + 1)) / rows;

  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: container.x + padding + col * (cellW + padding),
      y: container.y + padding + row * (cellH + padding),
      width:  Math.round(cellW),
      height: Math.round(cellH),
    };
  });
}
