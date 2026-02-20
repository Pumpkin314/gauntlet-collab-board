# Phase 3 Performance Results

**Date:** 2026-02-20
**Branch:** feature/perf-phase3 → merged via PR #15
**Baseline:** Phase 1 results (PR #14)

---

## Phase 3a — Render cascade elimination (cursor/overlay)

### Changes
- `BoardContext`: stale presence filtering (>2s) in Yjs + WebRTC paths; idle ts refresh
- `DebugOverlay`: ref-based viewport reads (stageScaleRef/stagePosRef) via RAF; `memo`-wrapped; RAF paused when hidden
- `InfoOverlay`: value-based `memo` comparator
- `Cursor`: stabilized re-render path

### Results
- Pan renders: 2 → 1 (drag move no longer re-renders DebugOverlay/InfoOverlay)
- Idle renders: eliminated for overlay components
- Stale ghost cursors: resolved (2s TTL filter)

---

## Phase 3b — Ref-first pan with throttled state sync

### Changes
- `handleDragMove`: writes to `stagePosRef` + imperative DotGrid per frame; `setStagePos` throttled to ~150ms
- `handleDragEnd`: clears throttle timer, final authoritative sync + DotGrid update
- `stagePosRef` guard: only syncs from state when `!isPanningRef.current`
- All Stage event handlers wrapped in `useCallback`; handlers read pos/scale from refs
- Selection action menu hidden during pan (`!isPanningRef.current` guard)
- `DotGrid`: props + `useEffect` removed; fully imperative via `update()` handle

### Results (manual testing, debug overlay FPS counter)

| Objects | Quick pan FPS | Continuous pan FPS |
|---------|--------------|-------------------|
| 0–2     | 60           | 60                |
| 3       | 60           | minor drop        |
| 4       | 60           | ~50               |
| 5       | 60           | ~40 (aggressive)  |
| 12      | ~45          | <40               |

**Canvas re-renders during pan:** ~60/sec → ~7/sec (throttle boundary)

### Observations
- Throttling `setStagePos` to 150ms successfully decouples React render rate from Konva drag rate
- FPS drops at 4+ objects indicate the remaining bottleneck is **not** the pan state sync — it's per-object render work (React diffing visibleObjects array, ObjectRenderer memo, Konva shape redraws)
- DotGrid is fully smooth at all object counts (imperative path unaffected)
- Selection menu correctly hides during pan, reappears on release

---

## Remaining bottleneck (next phases)

The `visibleObjects` useMemo still creates a new array reference every 150ms (at throttle boundary), causing ObjectRenderer to diff and re-render all visible shapes. At 12 objects this is measurable; at 50+ it will be significant.

**Next:** Phase 4 — viewport culling stability (stable object identity across culling updates) and/or Konva layer optimisation to bypass React entirely for pan.

See `PERFORMANCE_PLAN_V3.md` for the full roadmap.
