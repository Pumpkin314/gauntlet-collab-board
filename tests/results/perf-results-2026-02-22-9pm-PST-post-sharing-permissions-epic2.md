# Perf Test Results — 2026-02-22 9pm PST

Post Epic 2 (Sharing & Permissions) implementation. Branch: feature/sharing-permissions.
Also includes basic knowledge frontier bot work.

Changes since last run: BoardMeta schema extension (sharedWith/sharedWithUids), user profile
service, access gate in BoardLayout, ShareModal, Dashboard shared-boards section, viewer mode
(toolbar hidden, drag/transform/delete disabled), Firestore security rules.

## Summary

- **Phases 0–4: ALL PASSED** (25/25) — no FPS regressions from sharing/permissions changes
- **Phase 5 (P2P sync): SKIPPED** — requires multiplayer config (`npm run test:perf:multiplayer`)
- **Phase 6 (multiplayer): SKIPPED** — requires multiplayer config
- **Multiplayer slim: NOT YET RUN** — `npm run test:perf:multiplayer:slim` still pending

## Phase 0 — Baseline

| Metric | Objects | FPS |
|--------|---------|-----|
| Idle   | 0       | 60.3 |
| Idle   | 5       | 60.3 |
| Idle   | 10      | 60.0 |
| Idle   | 100     | 60.4 |
| Idle   | 500     | 60.1 |
| Idle   | 1000    | 60.1 |
| Pan    | 5       | 59.7 |
| Pan    | 10      | 59.6 |
| Pan    | 100     | 59.7 |
| Pan    | 500     | 60.1 |
| Pan    | 1000    | 60.3 |
| Drag   | 100     | 60.2 |
| Drag   | 500     | 60.2 |
| Drag   | 1000    | 60.2 |
| Zoom   | 500     | 59.1 |

### Create Latency

| Objects | Latency |
|---------|---------|
| 1       | 27.4ms  |
| 10      | 76.9ms  |
| 50      | 79.8ms  |
| 100     | 143.3ms |

### Render count during 500ms pan (100 objects): 0

## Phase 1 — Render cascade eliminated

- Dragging 1 shape out of 100: **0 React re-renders** PASS
- Pan FPS with 1000 objects: ~60 FPS PASS

## Phase 2 — Viewport culling

- Konva node count after zoom: PASS
- Pan FPS across 1000 objects: ~60 FPS PASS

## Phase 3 — Canvas draw cost

- Shadow disabling at high shape counts: PASS
- p95 frame draw time: PASS

## Phase 4 — Mouse event re-renders

- Mousemove (cursor tool): **0 React renders** PASS
- Mousemove (line tool): **0 React renders** PASS

## Phase 5 — P2P sync latency

SKIPPED (requires `npm run test:perf:multiplayer` with signaling server)

## Phase 6 — Multiplayer perf

SKIPPED (requires `npm run test:perf:multiplayer` with signaling server)

## Tests Not Yet Run

- `npm run test:perf:multiplayer:slim` — slim multiplayer tests (Phase 5/6 subset)
- `npm run test:perf:multiplayer` — full multiplayer tests (Phase 5/6)

Both require killing port 3000 first and using `playwright.multiplayer.config.ts` (no SKIP_SYNC).

## Comparison vs Previous Run (7pm PST, post-Epic 1)

No regressions. FPS numbers are within noise margin (~0.1-0.5 FPS variation).
Create latencies nearly identical (27.4ms vs 26.3ms for single object — within noise).

## Conclusion

**No performance regressions** from Epic 2 (sharing & permissions) changes.
The access gate in BoardLayout, userRole plumbing through BoardContext, and viewer mode
guards in Canvas.tsx have zero measurable FPS impact on single-user perf.
