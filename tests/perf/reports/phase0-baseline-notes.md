# Phase 0 Baseline — Test Notes & Results

**Date:** 2026-02-20
**Branch:** main (merged from feature/perf-playwright-tests)
**Environment:** Headless Chromium, VITE_TEST_AUTH_BYPASS=true, VITE_TEST_SKIP_SYNC=true
**Run command:** `npm run test:perf:baseline`

---

## Results

### Idle FPS (no interaction)

| Objects | FPS | frames | elapsed | konvaNodes | reactRenders |
|---|---|---|---|---|---|
| 0 | 60.4 | 121 | 2004ms | 1 | 0 |
| 5 | 60.4 | 121 | 2002ms | 6 | 0 |
| 10 | 60.4 | 121 | 2002ms | 11 | 0 |
| 100 | 60.1 | 121 | 2012ms | 101 | 0 |
| 1000 | 61.3 | 123 | 2005ms | 1001 | 0 |

Idle FPS is 60 across all counts. Konva is not continuously redrawing at rest. Zero React renders during idle confirms no background churn.

### Pan FPS (mousedown + 200px drag + mouseup, lower-right quadrant)

| Objects | FPS | frames | elapsed | konvaNodes | stageΔx | reactRenders |
|---|---|---|---|---|---|---|
| 5 | 41.4 | 83 | 2005ms | 6 | -200 ✓ | 1 |
| 10 | 31.5 | 65 | 2062ms | 11 | -200 ✓ | 1 |
| 100 | 3.6 | 10 | 2761ms | 101 | -200 ✓ | 1 |
| 1000 | 0.2 | 2 | 9360ms | 1001 | 0.0 ⚠️ | 2 |

`stageΔx=-200` on 5/10/100 objects confirms the stage genuinely moved. At 1000 objects the page was too frozen to process the mousedown before the FPS window closed (stageΔx=0).

**`reactRenders=1` on every pan is a known bug** — a stage transform should not touch React at all. This is the render cascade Phase 1 fixes.

### Drag FPS (mousedown on canvas center + 50-step move)

| Objects | FPS | frames | elapsed | konvaNodes | dragStart | reactRenders |
|---|---|---|---|---|---|---|
| 100 | 4.2 | 9 | 2160ms | 101 | (640,360) | 2 |
| 1000 | 0.5 | 4 | 7777ms | 1001 | (640,360) | 2 |

`reactRenders=2` per drag (1 for dragged shape, 1 for transformer) — also fixed in Phase 1.

### Create latency (batchCreate → 2nd rAF)

| Objects | Latency |
|---|---|
| 1 | 20.1ms |
| 10 | 95.5ms |
| 50 | 429.0ms |
| 100 | 774.5ms |

Roughly linear (~8ms per object). The cost is Yjs transaction + React reconciliation + Konva draw all serialized.

### React render count

| Scenario | Renders |
|---|---|
| 500ms mousemove, 100 objects (no mousedown) | **0** ✓ |
| Pan (any count) | **1** ← Phase 1 target: 0 |
| Drag (any count) | **2** ← Phase 1 target: ≤2 |

---

## Test methodology notes

- **Idle FPS** — pure rAF frame counter, no mouse interaction. Measures Konva background redraw cost only.
- **Pan FPS** — real `mousedown → mousemove × N → mouseup` gesture in the lower-right quadrant (avoids objects seeded from top-left). `stageΔx` confirms the stage moved.
- **Drag FPS** — `mousedown` at canvas center (lands on an object), then move. `dragStartPx` confirms pointer position.
- **1000-object pan/drag** — uses 3 mouse steps instead of 60 to avoid Playwright CDP timeouts on near-frozen pages. FPS measurement window is the same 2s.
- **Create latency** — `performance.mark('create-start')` before `batchCreate`, `performance.mark('create-end')` after second `requestAnimationFrame`. Measures wall time for React to commit + Konva to redraw.
- **Board isolation** — `clearBoard()` polls `getObjects().length === 0` (up to 10s) before each test. No fixed-sleep, so leftover state from large batches can't bleed into the next test.

---

## Phase 1 targets (for comparison after optimization)

| Scenario | Baseline | Target |
|---|---|---|
| Pan FPS @ 10 objects | 31.5 | ≥ 55 |
| Pan FPS @ 100 objects | 3.6 | ≥ 55 |
| Drag reactRenders | 2 | ≤ 2 (unchanged — already at floor) |
| Pan reactRenders | 1 | 0 |
