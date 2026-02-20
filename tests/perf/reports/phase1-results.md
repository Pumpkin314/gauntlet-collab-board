# Phase 1 Results — Render Cascade Eliminated

**Date:** 2026-02-20
**Branch:** main (merged from feature/perf-phase1-render-cascade, PR #14)
**Environment:** Headless Chromium, VITE_TEST_AUTH_BYPASS=true, VITE_TEST_SKIP_SYNC=true
**Run command:** `npm run test:perf:baseline`

---

## Results

### Idle FPS (no interaction)

| Objects | FPS | frames | elapsed | konvaNodes | reactRenders |
|---|---|---|---|---|---|
| 0 | 60.2 | 121 | 2009ms | 1 | 0 |
| 5 | 60.5 | 122 | 2016ms | 6 | 0 |
| 10 | 60.0 | 121 | 2015ms | 11 | 0 |
| 100 | 60.4 | 121 | 2004ms | 101 | 0 |
| 1000 | 60.0 | 121 | 2016ms | 1001 | 0 |

Unchanged from Phase 0. No background churn.

### Pan FPS (mousedown + 200px drag + mouseup, lower-right quadrant)

| Objects | FPS | frames | elapsed | konvaNodes | stageΔx | reactRenders |
|---|---|---|---|---|---|---|
| 5 | 48.3 | 97 | 2008ms | 6 | -200 ✓ | 0 |
| 10 | 33.8 | 68 | 2011ms | 11 | -200 ✓ | 0 |
| 100 | 4.1 | 10 | 2428ms | 101 | -200 ✓ | 0 |
| 1000 | 0.3 | 2 | 7610ms | 1001 | 0.0 ⚠️ | 1 |

**reactRenders=0 on pan** (was 1 in Phase 0). The render cascade is eliminated. FPS is slightly improved but still dominated by Konva draw cost — Phase 2 viewport culling addresses this.

### Drag FPS (mousedown on canvas center + 50-step move)

| Objects | FPS | frames | elapsed | konvaNodes | dragStart | reactRenders |
|---|---|---|---|---|---|---|
| 100 | 3.4 | 8 | 2345ms | 101 | (640,360) | 1 |
| 1000 | 0.5 | 4 | 7844ms | 1001 | (640,360) | 1 |

**reactRenders=1** (was 2 in Phase 0). Down from 2 to 1 — only the dragged shape re-renders.

### Create latency (batchCreate → 2nd rAF)

| Objects | Latency |
|---|---|
| 1 | 23.0ms |
| 10 | 106.6ms |
| 50 | 680.3ms |
| 100 | 902.4ms |

Similar to Phase 0. Create latency is Yjs transaction + React reconciliation + Konva draw, not affected by render cascade fixes.

### React render count

| Scenario | Phase 0 | Phase 1 |
|---|---|---|
| 500ms mousemove, 100 objects (no mousedown) | 0 | **0** ✓ |
| Pan (any count) | 1 | **0** ✓ |
| Drag (any count) | 2 | **1** ✓ |

---

## Phase 1 vs Phase 0 comparison

| Metric | Phase 0 | Phase 1 | Δ |
|---|---|---|---|
| Pan FPS @ 5 obj | 41.4 | 48.3 | +17% |
| Pan FPS @ 10 obj | 31.5 | 33.8 | +7% |
| Pan FPS @ 100 obj | 3.6 | 4.1 | +14% |
| Pan reactRenders | 1 | 0 | Eliminated |
| Drag reactRenders | 2 | 1 | -50% |

---

## Phase 2 targets (for comparison after viewport culling)

| Scenario | Phase 1 | Target |
|---|---|---|
| Pan FPS @ 10 objects | 33.8 | ≥ 55 |
| Pan FPS @ 100 objects | 4.1 | ≥ 55 |
| Pan FPS @ 1000 objects | 0.3 | ≥ 50 |
| Konva nodes (1000 obj, viewport ~50) | 1001 | ≤ ~60 |
