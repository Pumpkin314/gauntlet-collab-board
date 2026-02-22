# Debug & Testing Domain

## Overview

Debug tooling for development (DebugOverlay, DebugContext) and a Playwright-based perf/E2E test infrastructure with a bridge pattern for injecting actions from test scripts.

## Key Files

| File | LoC | Role |
|---|---|---|
| `src/contexts/DebugContext.tsx` | 143 | Isolated debug metrics state |
| `src/components/Canvas/DebugOverlay.tsx` | 268 | Togglable diagnostics panel (press `` ` ``) |
| `src/test-bridge.ts` | 47 | `window.__perfBridge` for Playwright perf tests |
| `src/components/PerfBridgeConnector.tsx` | 18 | Connects bridge to live BoardContext actions |
| `src/components/TestSync.tsx` | 138 | Firestore real-time sync debug component |

## Debug System

### DebugContext
- Extracted from BoardContext (Phase 1.0) to prevent debug metric updates from causing board data re-renders
- Holds: connection status, sync status, presence count, cursor metrics, FPS, peer count
- Only `DebugOverlay` consumes `useDebug()`

### DebugOverlay (press `` ` `` to toggle)
- FPS counter (rolling average)
- P2P connection status + peer count
- Awareness metrics (local/remote user count)
- Per-cursor latency (rolling 1s averages)
- Firestore sync stats (last persist time, snapshot count)
- Presence source indicator (WebRTC vs Firestore fallback)

## Test Infrastructure

### Perf Bridge (`window.__perfBridge`)
- Exposed only when `VITE_TEST_AUTH=true` (test mode)
- `PerfBridgeConnector` mounts in `main.tsx` and wires live board actions
- Bridge API: `batchCreate(n)`, `deleteAll()`, `getObjects()`, `getNodeCount()`, `getRenderCount()`, `resetRenderCount()`
- Used by Playwright perf specs to measure render counts, FPS, etc.

### Perf Test Suites (`tests/perf/`)
| Spec | Phase | What it tests |
|---|---|---|
| `phase0-baseline.spec.ts` | 0 | Baseline metrics capture |
| `phase1-render.spec.ts` | 1 | Render cascade elimination |
| `phase2-culling.spec.ts` | 2 | Viewport culling |
| `phase3-canvas.spec.ts` | 3 | Canvas-level optimizations |
| `phase4-mouse.spec.ts` | 4 | Mouse event throttling |
| `phase5-sync.spec.ts` | 5 | Sync performance |

### E2E Tests (`tests/playwright/`)
- `test_canvas_load.py` — canvas loads and renders
- `test_shape_creation.py` — create each shape type
- `test_shape_editing.py` — edit shape properties
- `test_pan_zoom.py` — viewport interactions
- `test_keyboard_shortcuts.py` — hotkeys
- `p2p/test_p2p_sync.py` — multi-browser P2P sync

### Running Tests
- `npm run test:perf:baseline` — Phase 0 perf baseline
- `npm run test:perf:phase1` — Phase 1 perf validation
- `python tests/run_all.py` — all E2E tests
- `python tests/run_p2p.py` — P2P sync tests only
