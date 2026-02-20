/**
 * Module-level cursor position store.
 *
 * Bypasses React entirely — awareness handlers write here, and Cursor RAF
 * loops read from here. Zero allocations on update, zero re-renders.
 */

interface CursorPos {
  x: number;
  y: number;
}

const cursors = new Map<string, CursorPos>();

export function setCursorPosition(userId: string, x: number, y: number): void {
  const existing = cursors.get(userId);
  if (existing) {
    existing.x = x;
    existing.y = y;
  } else {
    cursors.set(userId, { x, y });
  }
}

export function getCursorPosition(userId: string): CursorPos | undefined {
  return cursors.get(userId);
}

export function removeCursor(userId: string): void {
  cursors.delete(userId);
}
