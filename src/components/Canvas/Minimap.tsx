import { memo, useRef, useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { BoardObject } from '../../types/board';

interface MinimapProps {
  objectsRef: MutableRefObject<BoardObject[]>;
  stagePosRef: MutableRefObject<{ x: number; y: number }>;
  stageScaleRef: MutableRefObject<number>;
  isPanningRef: MutableRefObject<boolean>;
  windowWidth: number;
  windowHeight: number;
  onPanTo: (worldX: number, worldY: number) => void;
}

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const PADDING = 20;
const THROTTLE_MS = 100;

/**
 * Bird's-eye minimap rendered on a raw <canvas> element.
 * Uses LOD culling: only the ~10% largest objects draw as colored rects;
 * the rest render as single-pixel dots. Redraws are throttled to ~10 FPS.
 */
function MinimapInner({
  objectsRef,
  stagePosRef,
  stageScaleRef,
  isPanningRef,
  windowWidth,
  windowHeight,
  onPanTo,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDrawRef = useRef(0);
  const rafRef = useRef(0);
  const isDraggingRef = useRef(false);

  const draw = useCallback((viewportOnly = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const objects = objectsRef.current;
    const pos = stagePosRef.current;
    const scale = stageScaleRef.current;

    // Compute world bounds from all objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      const w = obj.width ?? 0;
      const h = obj.height ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }

    // Include viewport in bounds
    const vpWorldX = -pos.x / scale;
    const vpWorldY = -pos.y / scale;
    const vpWorldW = windowWidth / scale;
    const vpWorldH = windowHeight / scale;
    if (vpWorldX < minX) minX = vpWorldX;
    if (vpWorldY < minY) minY = vpWorldY;
    if (vpWorldX + vpWorldW > maxX) maxX = vpWorldX + vpWorldW;
    if (vpWorldY + vpWorldH > maxY) maxY = vpWorldY + vpWorldH;

    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = 1000; maxY = 1000;
    }

    // Add margin
    const margin = Math.max(maxX - minX, maxY - minY) * 0.1;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scaleX = MINIMAP_W / worldW;
    const scaleY = MINIMAP_H / worldH;
    const s = Math.min(scaleX, scaleY);

    if (!viewportOnly) {
      ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

      // LOD: top N by area as rects, rest as dots
      const threshold = Math.max(10, Math.floor(objects.length * 0.1));
      const sorted = [...objects].sort((a, b) =>
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
      );

      for (let i = 0; i < objects.length; i++) {
        const obj = sorted[i];
        const mx = (obj.x - minX) * s;
        const my = (obj.y - minY) * s;

        if (i < threshold) {
          const mw = Math.max(2, (obj.width ?? 0) * s);
          const mh = Math.max(2, (obj.height ?? 0) * s);
          ctx.fillStyle = obj.color ?? '#999';
          ctx.fillRect(mx, my, mw, mh);
        } else {
          ctx.fillStyle = '#bbb';
          ctx.fillRect(mx, my, 1, 1);
        }
      }
    } else {
      // Only clear viewport indicator area (approx)
      // For simplicity, redraw the whole viewport indicator
    }

    // Viewport indicator
    const vx = (vpWorldX - minX) * s;
    const vy = (vpWorldY - minY) * s;
    const vw = vpWorldW * s;
    const vh = vpWorldH * s;

    if (viewportOnly) {
      // Quick clear + redraw
      ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
      // Redraw background and objects (needed since we cleared)
      // Fall back to full redraw for correctness
      draw(false);
      return;
    }

    ctx.strokeStyle = 'rgba(78, 205, 196, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.fillStyle = 'rgba(78, 205, 196, 0.1)';
    ctx.fillRect(vx, vy, vw, vh);

    // Store transform for click-to-pan
    (canvas as any).__minimapTransform = { minX, minY, s };
  }, [objectsRef, stagePosRef, stageScaleRef, windowWidth, windowHeight]);

  // Throttled redraw loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastDrawRef.current >= THROTTLE_MS) {
        lastDrawRef.current = now;
        draw(isPanningRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw, isPanningRef]);

  const handlePointerEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const transform = (canvas as any).__minimapTransform;
    if (!transform) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldX = mx / transform.s + transform.minX;
    const worldY = my / transform.s + transform.minY;
    onPanTo(worldX, worldY);
  }, [onPanTo]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    handlePointerEvent(e);
  }, [handlePointerEvent]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    handlePointerEvent(e);
  }, [handlePointerEvent]);

  const onPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={MINIMAP_W}
      height={MINIMAP_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed',
        bottom: PADDING,
        right: PADDING,
        width: MINIMAP_W,
        height: MINIMAP_H,
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid #e0e0e0',
        cursor: 'crosshair',
        zIndex: 1000,
      }}
    />
  );
}

export const Minimap = memo(MinimapInner);
