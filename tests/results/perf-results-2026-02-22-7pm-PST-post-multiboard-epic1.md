# Perf Test Results — 2026-02-22

Post multi-board routing merge (PR #35). Branch: main @ 482e287.

## Summary

- **Phases 0–4: ALL PASSED** (29/29) — no FPS regressions from routing/dashboard/minimap changes
- **Phase 5 (P2P sync): SKIPPED** — requires signaling server (`npm run dev:signal`)
- **Phase 6 (multiplayer): SKIPPED** — requires signaling server + multiplayer config

## Phase 0 — Baseline

| Metric | Objects | FPS | Konva Nodes | React Renders |
|--------|---------|-----|-------------|---------------|
| Idle   | 0       | 60.2 | 1          | 0             |
| Idle   | 5       | 60.4 | 6          | 0             |
| Idle   | 10      | 60.3 | 8          | 0             |
| Idle   | 100     | 60.4 | 15         | 0             |
| Idle   | 500     | 60.1 | 36         | 0             |
| Idle   | 1000    | 60.2 | 36         | 0             |
| Pan    | 5       | 59.6 | 6          | 0             |
| Pan    | 10      | 59.6 | 8          | 1             |
| Pan    | 100     | 60.0 | 15         | 1             |
| Pan    | 500     | 60.1 | 36         | 0             |
| Pan    | 1000    | 60.2 | 36         | 1             |
| Drag   | 100     | 60.2 | 15         | 1             |
| Drag   | 500     | 60.2 | 36         | 1             |
| Drag   | 1000    | 60.1 | 36         | 1             |
| Zoom   | 500     | 59.6 | 36         | 0             |

### Create Latency

| Objects | Latency |
|---------|---------|
| 1       | 26.3ms  |
| 10      | 77.3ms  |
| 50      | 73.9ms  |
| 100     | 135.1ms |

### Render count during 500ms pan (100 objects): 0

## Phase 1 — Render cascade eliminated

- Dragging 1 shape out of 100: **0 React re-renders** (threshold: <=2) PASS
- Pan FPS with 1000 objects: **60.2** (threshold: >=55) PASS

## Phase 2 — Viewport culling

- Konva node count after zoom: **16** PASS
- Pan FPS across 1000 objects: **60.4-60.5** across 4 segments PASS

## Phase 3 — Canvas draw cost

- No shadows when shape count > 50: **PASS** (shadows=false at 60 shapes)
- p95 frame draw time: **0.40ms** (threshold: <8ms) PASS

## Phase 4 — Mouse event re-renders

- 500ms mousemove (cursor tool): **0 React renders** PASS
- 500ms mousemove (line tool): **0 React renders** PASS

## Phase 5 — P2P sync latency

SKIPPED (no signaling server). Run with: `npm run dev:signal && npm run test:perf`

## Phase 6 — Multiplayer perf

SKIPPED (no signaling server). Run with:
```
npm run dev:signal
npm run test:perf:multiplayer --config playwright.multiplayer.config.ts
```

## Conclusion

**No performance regressions** from the multi-board routing, dashboard, or minimap changes.
All single-user perf metrics hold at 60 FPS across all object counts (0–1000).
