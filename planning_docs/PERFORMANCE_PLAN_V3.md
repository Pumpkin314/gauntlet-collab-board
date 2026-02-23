# Performance Optimization Plan V3: 1000 Objects + Playwright Automation

## Context
FPS drops to ~75% with just 5 shapes. Target: smooth 60fps with 1000 objects, 5 concurrent users. Stack: React 18 + Konva.js (canvas) + Yjs (CRDT sync).

The phased optimization plan now includes an automated Playwright test suite that runs as a performance checkpoint after each phase. Tests capture objective before/after metrics, replacing manual Chrome DevTools profiling sessions.

**Latency measurement fix:** Previous attempts summed frame deltas (`total += now - last`), giving elapsed time instead of per-operation latency. All tests will use `performance.mark()` pairs per discrete operation and read `entry.duration` from `performance.getEntriesByName()` — never cumulative sums.

---

## App-Side Instrumentation (Prerequisite — one-time setup)

These small additions to the app gate test hooks behind env vars and never ship to production.

### A. VITE_TEST_AUTH_BYPASS
**File:** `src/contexts/AuthContext.tsx`
When `import.meta.env.VITE_TEST_AUTH_BYPASS === 'true'`, skip Firebase Auth and inject a mock user object (`{ uid: 'test-user', displayName: 'Test User' }`). This allows Playwright to run against `http://localhost:3000` without a Google OAuth flow.

### B. window.__board test handle
**File:** `src/contexts/BoardContext.tsx`
When `VITE_TEST_AUTH_BYPASS === 'true'`, attach to `window`:
```ts
window.__board = {
  batchCreate,      // create N objects programmatically
  getAllObjects,     // read current objects array
  deleteAllObjects, // reset board state
  getObjectCount: () => objects.length,
};
```
Playwright calls these via `page.evaluate(() => window.__board.batchCreate([...]))`.

### C. window.__perf performance store
**File:** `src/utils/perfStore.ts` (new, ~40 lines)
Module-level store (same pattern as cursorStore) that accumulates per-operation marks:
```ts
export const perfStore = {
  marks: new Map<string, number>(),
  measures: new Map<string, number[]>(),
  mark(name: string) { this.marks.set(name, performance.now()); },
  measure(name: string, startMark: string, endMark: string) {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    if (start == null || end == null) return;
    const arr = this.measures.get(name) ?? [];
    arr.push(end - start); // single duration, not cumulative
    this.measures.set(name, arr);
  },
  getAll() { return Object.fromEntries(this.measures); },
  clear() { this.marks.clear(); this.measures.clear(); },
};
window.__perf = perfStore;
```
Key measurement points (gated by test env var):
- `syncToReact` start/end → per-sync duration
- `batchCreate` commit → Yjs transaction time
- RAF frame timestamps → rolling FPS readable from Playwright

**Commit:** `test: add test instrumentation hooks behind VITE_TEST_AUTH_BYPASS`

---

## Test Infrastructure

### Files to Create

```
playwright.config.ts          # root config: baseURL, browser, timeout
tests/
  perf/
    helpers/
      metrics.ts              # measureFps(), waitForObjectCount(), measureCreateLatency()
    baseline.spec.ts          # Phase 0: capture baseline numbers
    phase1-render.spec.ts     # Phase 1: verify render cascade eliminated
    phase2-culling.spec.ts    # Phase 2: verify viewport unmounting
    phase3-canvas.spec.ts     # Phase 3: shadow threshold, draw time
    phase4-events.spec.ts     # Phase 4: ref-based mouse events
    phase5-sync.spec.ts       # Phase 5: no console.log in hot path
    reports/                  # JSON output per run (gitignored)
```

### playwright.config.ts
```ts
export default defineConfig({
  testDir: './tests/perf',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'VITE_TEST_AUTH_BYPASS=true VITE_TEST_SKIP_SYNC=true npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
});
```

### package.json additions
```json
"perf:test": "playwright test tests/perf/",
"perf:baseline": "playwright test tests/perf/baseline.spec.ts --reporter=json > tests/perf/reports/baseline.json",
"perf:ci": "playwright test tests/perf/ --reporter=json > tests/perf/reports/latest.json"
```

---

## Correct Latency Measurement (shared helpers in metrics.ts)

### The bug we're fixing
```ts
// ❌ WRONG — accumulates elapsed time, not per-operation latency
let total = 0;
let last = performance.now();
// ... later in RAF loop:
total += performance.now() - last;  // total grows forever
last = performance.now();
```

### FPS — correct
```ts
export async function measureFps(page: Page, durationMs = 2000): Promise<number> {
  return page.evaluate((duration) => new Promise<number>((resolve) => {
    const timestamps: number[] = [];
    let rafId: number;
    const tick = (t: number) => {
      timestamps.push(t);
      if (t - timestamps[0] < duration) {
        rafId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafId);
        // Count frames in the FINAL 1-second window only — not since start
        const windowStart = t - 1000;
        resolve(timestamps.filter(ts => ts >= windowStart).length);
      }
    };
    requestAnimationFrame(tick);
  }), durationMs);
}
```

### Per-operation latency — correct
```ts
export async function measureCreateLatency(page: Page, count: number): Promise<number> {
  return page.evaluate(async (n) => {
    const before = window.__board.getObjectCount();
    performance.mark('create-start');

    window.__board.batchCreate(n); // triggers Yjs → React sync

    await new Promise<void>((resolve) => {
      const check = () => {
        if (window.__board.getObjectCount() >= before + n) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });

    performance.mark('create-end');
    performance.measure('create-latency', 'create-start', 'create-end');
    // Single duration for this operation — NOT a running total
    return performance.getEntriesByName('create-latency')[0].duration;
  }, count);
}
```

---

## Test Scenarios

### baseline.spec.ts (Phase 0)
Runs before any optimizations. Saves output to `reports/baseline.json` for comparison.

| Scenario | Objects | Metric | Expected (post-optimization target) |
|----------|---------|--------|--------------------------------------|
| Idle FPS | 0 | FPS | 60 |
| Create latency | 100 | ms | < 50ms |
| Pan FPS | 100 | FPS during 2s pan | ≥ 58fps |
| Pan FPS | 500 | FPS during 2s pan | ≥ 55fps |
| Pan FPS | 1000 | FPS during 2s pan | ≥ 50fps |
| Zoom FPS | 100 | FPS during wheel | ≥ 55fps |

### phase1-render.spec.ts
```
✓ Updating 1 object does not re-render other 99 objects
  (window.__perf shows syncToReact fires once, duration < 5ms)
✓ batchCreate(100) triggers 1 React setState, not 100
✓ Pan FPS with 100 objects ≥ 58fps
✓ Pan FPS with 500 objects ≥ 55fps
```

### phase2-culling.spec.ts
```
✓ With 1000 objects spread 5000x5000px, Konva layer child count ≤ ~60
  (Konva.stages[0].getLayers()[0].getChildren().length)
✓ Objects outside viewport: layer.findOne('#note-<id>') === null
✓ Pan FPS with 1000 objects ≥ 50fps
```

### phase3-canvas.spec.ts
```
✓ With 51 sticky notes: Konva Rect nodes have shadowBlur === 0
✓ With 49 sticky notes: Konva Rect nodes have shadowBlur === 10
✓ Pan FPS with 100 sticky notes ≥ 58fps
```

### phase4-events.spec.ts
```
✓ During line drawing, mousemove does NOT call setLineCursorPos
  (no React setState fires during simulated mousemove — verified via window.__perf)
✓ Clicking already-frontmost object: zero Yjs writes for zIndex
```

### phase5-sync.spec.ts
```
✓ No console.log during simulated cursor movement with 2 sessions
  (page.on('console') captures zero messages during mousemove simulation)
✓ DebugOverlay 500ms tick: Canvas component render count stays 0
```

---

## Optimization Phases (unchanged from V2)

See PERFORMANCE_PLAN_V2.md for Phases 1–5 details. Each phase now has a corresponding `phase{N}-*.spec.ts` that verifies the fix worked.

**Workflow per phase:**
1. `npm run perf:baseline` — save pre-fix numbers
2. Implement the phase's fixes
3. `npm run perf:test` — run all specs
4. Compare output to baseline
5. Commit

---

## Critical Files

| File | Purpose |
|------|---------|
| `src/contexts/AuthContext.tsx` | Add VITE_TEST_AUTH_BYPASS mock user |
| `src/contexts/BoardContext.tsx` | Add window.__board handle |
| `src/utils/perfStore.ts` (new) | window.__perf instrumentation |
| `playwright.config.ts` (new) | Playwright config |
| `tests/perf/helpers/metrics.ts` (new) | measureFps, measureCreateLatency, etc. |
| `tests/perf/baseline.spec.ts` (new) | Baseline capture |
| `tests/perf/phase{1-5}-*.spec.ts` (new) | Per-phase verification |
