# Performance Upgrade — Implementation Side Notes

Companion to `PERFORMANCE_PLAN_V3.md`. Read the relevant section here before implementing each step. This file surfaces open questions, risks, and decision points the plan leaves ambiguous — a second voice to keep implementation grounded.

---

## Prerequisite — App-Side Instrumentation

### Auth bypass (Section A)

No open questions. Keep the mock user object minimal — only `uid` and `displayName` are needed. Don't add roles or permissions that don't exist in the real auth model.

### `window.__board` handle (Section B)

**Inconsistency to resolve before implementing:** The plan shows `batchCreate([...])` accepting an array in the definition, but `measureCreateLatency` in `metrics.ts` calls `window.__board.batchCreate(n)` with a plain number. Decide on one signature before writing either file — accepting a number is simpler for tests; accepting an array is more flexible for seeding specific object types. Pick one and keep both the handle and the helper consistent.

### `window.__perf` / `perfStore` (Section C)

**Superseded — do not implement.** `window.__perf` and `perfStore` were replaced by `window.__perfBridge.renderCount` in the implemented test suite. The actual phase specs use `window.__perfBridge` exclusively. Any reference to `window.__perf`, `perfStore`, or `window.__board` in plan docs is obsolete — ignore it.

### `VITE_TEST_SKIP_SYNC=true`

This env var appears in the `playwright.config.ts` webServer command but is never defined in the instrumentation section. Clarify what it's supposed to do (likely: skip Yjs WebSocket connection so tests run offline) and add handling for it in `BoardContext.tsx` alongside the auth bypass. If it's left undefined, the app will attempt WebSocket connections during tests and results will be noisy.

**Commit order:** Instrumentation commit (`test: add test instrumentation hooks`) must land before any phase spec files are written, since the specs depend on `window.__board` and `window.__perf` existing.

---

## Phase 0 — Baseline

**The baseline is only meaningful if sync is disabled.** If `VITE_TEST_SKIP_SYNC` isn't implemented, Yjs WebSocket churn will inflate latency numbers and make before/after comparison unreliable. Resolve the `VITE_TEST_SKIP_SYNC` question (above) before running `perf:baseline`.

**Save the baseline JSON before touching any app code.** It's easy to forget and run it mid-optimization — at that point it's no longer a baseline.

---

## Phase 1 — Stop the React Render Cascade

### 1.0 — Debug context extraction

Verify `DebugOverlay` is the *only* consumer of debug state before removing it from `BoardContext`. A grep for `setDebugInfo`, `setYjsLatencyMs`, etc. across all component files will confirm this quickly.

### 1.1 — Diff-based `syncToReact`

**Observer scope — open question:**
`observeDeep` fires on every nested property change across the entire document. Implement with it first, then profile. If the observer callback itself shows up as expensive in the Performance tab after Phase 1, narrow to a targeted `observe` on the top-level map (add/delete) plus per-entry deep observation only for actively mutating objects.

**Hard constraint — zIndex:** Treat zIndex changes as structural (trigger re-sort). If they go through the property-only path, render order silently drifts. This bug will be hard to reproduce and extremely hard to diagnose.

**Hard constraint — immutability:** `syncToReact` must produce a *new object reference* for every changed entry. In-place mutation makes `React.memo` see the same reference and skip renders — stale visuals that appear to be bugs in the shape components themselves.

### 1.2 — `React.memo` on shape components

**Implement after 1.1, not before.** If `syncToReact` still produces new references for all objects on every mutation, memo re-renders everything anyway. The profiler will show no improvement and the change looks useless.

**Callback stability:** Verify `onSelect`, `onUpdate`, `onDelete` in `Canvas.tsx` are wrapped in `useCallback` with stable deps. If any of these close over React state rather than a ref, they get new function references every render and bust memo on every shape.

### 1.3 — Split BoardContext into data/actions

**Highest blast radius change in Phase 1.** Every component consuming `useBoard()` / `useBoardContext()` needs updating. Grep for all callsites before starting.

**Verify action stability:** The split only pays off if action functions have stable references. Confirm each action is `useCallback`-wrapped with deps that don't change (e.g., a Yjs doc ref, not React state). An action that closes over `objects` directly will produce a new reference on every render.

### 1.4 — Transformer `useEffect` deps

Before removing `objects` from the dep array, confirm the `.find()` call inside reads from a ref, not the closed-over `objects` array. Remove `objects` from deps first, then move the read to a ref — in that order, or you'll get a stale closure on the transformer attachment.

**Phase 1 spec check:** `phase1-render.spec.ts` uses `window.__perfBridge.renderCount` (not `window.__perf` — that was never implemented). The test resets `renderCount`, simulates a drag, then asserts `renderCount <= 2`. No additional instrumentation is needed; the bridge is already wired up.

---

## Phase 2 — Viewport Culling

### 2.1 — Unmount off-screen objects

**Open question — bounds for unmounted nodes:**
`getClientRect()` is a Konva method requiring a mounted node. Unmounted objects have no node to query.

Choose one approach before implementing:
- **Conservative math (recommended for first pass):** Derive a bounding circle from `(x, y, width, height, rotation)` using the diagonal as radius. Add the viewport margin. This is an approximation but avoids any dependency on mounted nodes.
- **Cached clientRect:** After each render, store each shape's `getClientRect()` in a ref keyed by object ID. Use that cache for culling. Higher accuracy for rotated shapes, higher complexity.
- **Always render selected objects regardless.** Selected shapes must render for the transformer — their `getClientRect()` is always available if you need it.

**Pop-in:** The plan's 200px margin is a starting value. If pan velocity is high (trackpad momentum), consider increasing it or scaling it with pan speed.

**Phase 2 spec check:** `phase2-culling.spec.ts` reads `Konva.stages[0].getLayers()[0].getChildren().length`. Confirm Konva exposes `Konva.stages` globally in the dev build — it does in standard Konva setups but verify against the actual import pattern in this codebase.

---

## Phase 3 — Canvas Drawing Optimizations

### 2.2 — Conditional shadows

Confirm the `disableShadows` prop routes cleanly from `ObjectRenderer` → `StickyNote` without threading through unrelated components. If the prop-drilling path is awkward, a small context or a derived value passed alongside the objects array works.

### 2.3 — `node.cache()` for static shapes

**Open question — selection highlight location:**
Whether selection busts the cache depends on where the highlight is rendered.

Determine this before implementing:
- If the selection outline is *inside* `BaseShape` (conditional stroke), the cache must clear on every select/deselect — partial defeat of the purpose for an interactive board.
- If selection is handled *externally* (Konva `Transformer` overlay only), the cached shape never needs to change on selection. This is the safer design.

Check `BaseShape.tsx` for selection styling before deciding on the invalidation list.

**Memory cost:** `node.cache()` allocates an offscreen canvas per shape. With 1000 shapes this is significant. Compare heap snapshot before and after caching against the Phase 0 baseline. If memory growth is unacceptable, limit caching to shapes inactive for N frames rather than all non-selected shapes.

---

## Phase 4 — Mouse Event Hot Path

### 3.1 — Ref-based line preview and box-select

The `cursorStore` pattern in `Cursor.tsx` already does this in this codebase — follow that pattern exactly rather than inventing a new one.

**Phase 4 spec check:** The test verifies "no React setState fires during mousemove via `window.__perf`." This isn't directly trackable via `perfStore` marks unless a specific mark is added around `setLineCursorPos` / `setBoxSelectRect` calls. Before the phase is complete, confirm either: (a) a mark is added to count these calls, or (b) the test uses a different signal (e.g., React DevTools hook or a counter on the ref update path).

### 3.2 — Conditional zIndex writes

Confirm the "current max zIndex" comparison reads from the Yjs source of truth, not the React `objects` array. Reading from React state during a click handler risks a stale value if the last render hasn't flushed yet.

---

## Phase 5 — Sync & Networking Cleanup

### 4.1 — Remove hot-path console.logs

Gate behind `localStorage.getItem('COLLAB_DEBUG')` rather than deleting entirely. Useful for future debugging without re-adding.

### 4.2 — Debug decoupling verification

This is a verification step, not new work. With the React Profiler open, simulate cursor movement with a peer. No `Canvas` or shape component should appear in the flame graph. If they do, the DebugContext extraction from Phase 1.0 is incomplete.

**Phase 5 spec check:** `phase5-sync.spec.ts` uses `page.on('console')` to assert zero console messages during mousemove. This will false-positive if any other unrelated `console.log` fires during the test window — make sure the test is scoped to the mousemove interval only, not the full test lifecycle.

---

## General Reminders (every phase)

- **Profile before and after each phase commit.** The Playwright specs replace manual Chrome DevTools sessions — but they only work if the instrumentation is correct. If a spec passes but FPS didn't actually improve, the measurement is wrong.
- **Don't combine phases in one commit.** Each phase is independently verifiable. Mixed commits make regressions impossible to attribute.
- **Appendix items (`observeDeep` cost, manual hit testing) are stretch goals.** Only pursue them if profiling after Phases 1–4 shows they're still dominant bottlenecks.
- **V3 adds Playwright on top of V2 phases — the optimization logic is unchanged.** If anything in this file conflicts with `PERFORMANCE_PLAN_V2_NOTED.md`, V3 takes precedence.
