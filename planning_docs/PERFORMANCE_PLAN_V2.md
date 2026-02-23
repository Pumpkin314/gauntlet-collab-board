# Performance Optimization Plan V2: 1000 Objects Target

## Context
FPS drops to ~75% with just 5 shapes. Target: smooth 60fps with 1000 objects, 5 concurrent users. The codebase uses React 18 + Konva.js (canvas) + Yjs (CRDT sync).

**Structural decision:** Continue with phased optimizations. No upfront layer extraction — the Phase 1 fixes naturally create the separation where it matters. Rationale: 80% of BoardContext's 24 setState calls are debug-only telemetry. 0/6 shape components use React.memo. The cursorStore pattern already proves the ref-based bypass approach works. Fixing these specific bottlenecks accomplishes the same separation a formal refactor would, with less risk and measurable impact per phase.

---

## Phase 0: Profiling Baseline (before any code changes)

Record baselines for before/after comparison. Without this, we can't prove any fix actually helped.

1. **React Profiler** recordings for: drag 1 object, drag with 50 objects, pan with 1000 objects, select-all with 1000 objects
2. **Chrome Performance** tab for same scenarios — capture FPS + long task markers
3. **Memory snapshot** (heap) — baseline for later comparison when Konva caching is added
4. Save screenshots/exports of each profile

**Commit:** `chore: add performance baseline recordings` (or just save locally)

---

## Phase 1: Stop the React Render Cascade

The single biggest category. Every Yjs mutation currently re-renders every shape component.

### 1.0 — Extract debug/telemetry state into a separate context
**File:** `src/contexts/BoardContext.tsx`
**Problem:** 19 of 24 setState calls in BoardContext are debug-only (`setDebugInfo`, `setYjsLatencyMs`, `setYjsReceiveGapMs`, `setYjsLatestSampleMs`, `setYjsReceiveRate`, `setYjsSendRate`). Each one triggers a re-render of every context consumer — Canvas, ObjectRenderer, all shapes.
**Fix:** Move all debug state into a `DebugContext` (or a ref-based store like cursorStore). Only `DebugOverlay` consumes it. The main BoardContext should only re-render when objects or presence actually change.

### 1.1 — `syncToReact` rebuilds the entire objects array on every Yjs mutation
**File:** `src/contexts/BoardContext.tsx:606-613`
**Problem:** Every property change (drag, resize, keystroke) triggers full iteration of Y.Map → new array → sort → setObjects → all consumers re-render.
**Fix:** Diff-based sync using `observeDeep` event data. Maintain a `Map<string, BoardObject>` ref. On Yjs events, update only changed entries. Derive the sorted array only on structural changes (add/delete). For property-only updates, produce a new array with the same object references for unchanged items, so React.memo can skip them.

### 1.2 — ObjectRenderer and all shapes re-render on every objects change
**File:** `src/components/Canvas/ObjectRenderer.tsx`, all shape files
**Problem:** No React.memo on any of the 6 shape components. Every `objects` array change re-renders all shapes even when only one changed.
**Fix:**
- Wrap `BaseShape` (or each concrete shape) in `React.memo` with shallow comparison on `data` fields
- Stabilize callback props with `useCallback` in Canvas.tsx (`onSelect`, `onUpdate`, `onDelete`, etc.)
- ObjectRenderer itself should be memoized

### 1.3 — BoardContext value object recreated every render
**File:** `src/contexts/BoardContext.tsx:888-911`
**Problem:** `const value = {...}` creates a new object reference on every render, forcing all consumers to re-render even if nothing changed.
**Fix:** Split into `BoardDataContext` (objects, presence — changes on mutations) and `BoardActionsContext` (createObject, updateObject, etc. — never changes). `useMemo` each value object. Components that only call actions (e.g., Toolbar) never re-render on data changes.

### 1.4 — Transformer useEffect depends on `objects`
**File:** `src/components/Canvas.tsx:189-205`
**Problem:** `useEffect(..., [selectedIds, objects])` re-attaches transformer nodes on every objects change, even when selection didn't change.
**Fix:** Remove `objects` from the dependency array. Store objects in a ref for the `.find()` call inside. Transformer only needs to update when `selectedIds` changes.

**Commit:** `perf: eliminate React render cascade for board objects`
**Profile check:** React DevTools Profiler — create 100 objects, drag one. Verify only the dragged shape re-renders. All others should show "Did not render."

---

## Phase 2: Viewport Culling

### 2.1 — All objects render regardless of visibility
**File:** `src/components/Canvas/ObjectRenderer.tsx`, `src/components/Canvas.tsx`
**Problem:** All 1000 Konva nodes exist even when off-screen. Konva processes them for hit detection and draw calls.
**Fix:** Compute visible viewport bounds from `stagePos` and `stageScale`. AABB-test each object. Only pass visible objects to ObjectRenderer — off-screen objects are completely unmounted (no Konva node). Add a margin (e.g., 200px) to avoid pop-in during fast pans. Selected objects always render regardless of viewport (transformer needs them).

**Commit:** `perf: unmount off-screen objects via viewport culling`
**Profile check:** Create 1000 objects in a grid. Pan to show ~50. Verify React tree only has ~50 shape nodes. FPS should be near 60 during pan.

---

## Phase 3: Canvas Drawing Optimizations

### 2.2 — StickyNote shadows expensive at scale
**File:** `src/components/shapes/StickyNote.tsx:33-35`
**Problem:** `shadowBlur={10}` requires an offscreen buffer per shape. With 1000 sticky notes this is a major GPU/CPU cost.
**Fix:** Pass `disableShadows` prop (true when object count > 50). Set `shadowBlur={0}` when disabled.

### 2.3 — Konva hit detection is O(n) per mouse event
**Problem:** Every shape has `listening={true}` and `draggable={true}`. Konva tests all shapes for hit on every mouse event.
**Fix:** Use `node.cache()` for non-selected shapes (caching rasterizes to an offscreen canvas, speeds up both draw and hit test). Consider setting `listening={false}` on shapes far from cursor and using a spatial index for manual hit testing.

**Commit:** `perf: disable shadows above threshold, cache static shapes`
**Profile check:** Create 100 sticky notes. Confirm no shadows visible. Check Canvas draw time in Performance tab.

---

## Phase 4: Mouse Event Hot Path

### 3.1 — React state updates on every mousemove during line/box-select
**File:** `src/components/Canvas.tsx:343-367`
**Problem:** `setLineCursorPos` and `setBoxSelectRect` fire on every mousemove, triggering full Canvas re-render (and all children).
**Fix:** Use refs + RAF loop (same pattern as remote cursors in Cursor.tsx). LinePreview and SelectionRect read from refs and update Konva nodes directly via `node.position()` / `node.width()`.

### 3.2 — `handleSelect` writes zIndex to Yjs unconditionally
**File:** `src/components/Canvas.tsx:377`
**Problem:** `updateObject(id, { zIndex: Date.now() })` on every click triggers full syncToReact even when clicking an already-frontmost object.
**Fix:** Compare with current max zIndex. Only write if the object isn't already at the front.

**Commit:** `perf: ref-based line preview and conditional zIndex updates`
**Profile check:** Draw a line with 500 objects. No FPS drop. Click same object twice — second click should not trigger Yjs write.

---

## Phase 5: Sync & Networking Cleanup

### 4.1 — Console.log in hot awareness paths
**File:** `src/contexts/BoardContext.tsx:428, 491`
**Problem:** `console.log` on every awareness update. Synchronous, serializes objects, surprisingly expensive.
**Fix:** Remove entirely or gate behind `localStorage.getItem('COLLAB_DEBUG')`.

### 4.2 — Debug state updates trigger full context re-renders every 500ms
**File:** `src/contexts/BoardContext.tsx:246-249`
**Problem:** `updateDebug` → `setDebugInfo()` → all context consumers re-render. Fires on every awareness event and every 500ms sample.
**Fix:** Already addressed by Phase 1 item 1.0 (DebugContext extraction). Verify it's fully decoupled.

**Commit:** `perf: remove hot-path console.logs, verify debug isolation`
**Profile check:** Move cursor with 2 peers. No console.log calls in Performance tab. Debug overlay updates don't cause Canvas re-render.

---

## Critical Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/contexts/BoardContext.tsx` | 1, 5 | Extract debug context, diff-based syncToReact, split data/actions contexts, remove console.logs |
| `src/components/Canvas/ObjectRenderer.tsx` | 1, 2 | React.memo, viewport filter |
| `src/components/Canvas.tsx` | 1, 2, 4 | Fix transformer deps, pass viewport bounds, ref-based mouse handlers, conditional zIndex |
| `src/components/shapes/BaseShape.tsx` | 1 | React.memo wrapper |
| `src/components/shapes/StickyNote.tsx` | 1, 3 | React.memo, conditional shadows |
| `src/components/shapes/RectShape.tsx` | 1 | React.memo |
| `src/components/shapes/CircleShape.tsx` | 1 | React.memo |
| `src/components/shapes/TextShape.tsx` | 1 | React.memo |
| `src/components/shapes/LineShape.tsx` | 1 | React.memo |
| `src/contexts/DebugContext.tsx` (new) | 1 | New file for isolated debug state |

## Verification (after each phase)
1. Chrome DevTools Performance tab
2. Create 100 → 500 → 1000 objects (use `batchCreate` in console)
3. Profile: drag a shape, pan the board, scroll to zoom
4. FPS counter in debug overlay (backtick toggle)
5. React DevTools Profiler: verify only changed components re-render
6. Target: 60fps with 1000 objects during pan/drag with 5 concurrent users
