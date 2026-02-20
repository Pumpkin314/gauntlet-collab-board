import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface DotGridHandle {
  update(pos: { x: number; y: number }, scale: number): void;
}

/**
 * Three density tiers, each 8× coarser than the next.
 * radius is the dot radius in screen pixels (constant regardless of zoom).
 */
const TIERS = [
  { canvasSpacing: 256, radius: 1.5 }, // coarse — visible when zoomed out
  { canvasSpacing: 32,  radius: 1.0 }, // fine   — visible at normal zoom
  { canvasSpacing: 4,   radius: 1.0 }, // micro  — visible when zoomed in
] as const;

/**
 * Fade-in/fade-out opacity envelope so dots are never too dense or too sparse.
 * Tiers overlap during transitions to avoid any visible "pop".
 */
function tierOpacity(screenSpacing: number): number {
  const fadeIn  = Math.max(0, Math.min(1, (screenSpacing - 8)   / 15));
  const fadeOut = Math.max(0, Math.min(1, (150 - screenSpacing) / 30));
  return fadeIn * fadeOut * 0.55;
}

/**
 * Pure function: computes the CSS background properties for the dot grid.
 * Returns partial CSSProperties so it can be spread onto a div's style or
 * applied imperatively via element.style.*
 */
function computeGridStyle(
  pos:   { x: number; y: number },
  scale: number,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const images:    string[] = [];
  const sizes:     string[] = [];
  const positions: string[] = [];

  for (const tier of TIERS) {
    const screenSpacing = tier.canvasSpacing * scale;
    const opacity = tierOpacity(screenSpacing);

    // Skip tiers that would be invisible — omitting the layer avoids an
    // empty radial-gradient that still costs compositor memory.
    if (Math.round(opacity * 100) === 0) continue;

    // radial-gradient places dots at the tile center (50% 50%), so we shift
    // the tile origin by -screenSpacing/2 to land dots at canvas-space multiples
    // of canvasSpacing. This guarantees coarse dots coincide with fine/micro dots.
    const offX = ((pos.x - screenSpacing / 2) % screenSpacing + screenSpacing) % screenSpacing;
    const offY = ((pos.y - screenSpacing / 2) % screenSpacing + screenSpacing) % screenSpacing;

    images.push(
      `radial-gradient(circle, rgba(150,150,150,${opacity.toFixed(3)}) ${tier.radius}px, transparent ${tier.radius}px)`,
    );
    sizes.push(`${screenSpacing}px ${screenSpacing}px`);
    positions.push(`${offX}px ${offY}px`);
  }

  if (images.length === 0) {
    return { backgroundImage: 'none', backgroundSize: '', backgroundPosition: '' };
  }

  return {
    backgroundImage:    images.join(', '),
    backgroundSize:     sizes.join(', '),
    backgroundPosition: positions.join(', '),
  };
}

/**
 * CSS dot-grid background that tracks the Konva stage viewport.
 *
 * Rendered as a plain `<div>` behind the Stage so zero Canvas draw calls are
 * needed — the browser compositor handles the radial-gradient tiling on the GPU.
 *
 * All runtime updates come through the imperative `update()` handle, called from
 * `handleWheel`, `handleDragMove`, and `handleDragEnd` in Canvas. No props are
 * needed — the grid is fully driven by the imperative path.
 */
const DotGrid = forwardRef<DotGridHandle>(function DotGrid(_props, ref) {
  const divRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    update(pos, scale) {
      const div = divRef.current;
      if (!div) return;
      const s = computeGridStyle(pos, scale);
      div.style.backgroundImage    = s.backgroundImage;
      div.style.backgroundSize     = s.backgroundSize;
      div.style.backgroundPosition = s.backgroundPosition;
    },
  }));

  const initial = computeGridStyle({ x: 0, y: 0 }, 1);

  return (
    <div
      ref={divRef}
      style={{
        position:           'absolute',
        inset:              0,
        pointerEvents:      'none',
        zIndex:             0,
        backgroundImage:    initial.backgroundImage,
        backgroundSize:     initial.backgroundSize,
        backgroundPosition: initial.backgroundPosition,
      }}
    />
  );
});

export default DotGrid;
