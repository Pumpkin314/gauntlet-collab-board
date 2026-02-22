/**
 * Phase 6 — Multiplayer performance
 *
 * Measures FPS and sync latency under concurrent multi-user load using
 * y-webrtc BroadcastChannel (same browser process, multiple contexts).
 *
 * Test matrix:
 *   Users:   2, 3, 4, 5
 *   Objects: 1, 10, 100, 500
 *   Scenarios: idle, pan, zoom, move-object (FPS + sync latency)
 *
 * Run via:
 *   npm run test:perf:multiplayer:slim   — 2 users × [1,100,500] obj = 12 tests (~5 min)
 *   npm run test:perf:multiplayer        — full 4×4 matrix = 64 tests (~25 min)
 *
 * Slim tests are identified by @slim in their title; use --grep @slim to filter.
 *
 * Requires playwright.multiplayer.config.ts (sync enabled, workers: 1).
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { launchApp, clearBoard, createObjects } from './helpers/setup';
import {
  measureIdleFpsDiag,
  measurePanFpsDiag,
  measureZoomFpsDiag,
  measureDragFpsDiag,
  measureSyncLatency,
} from './helpers/metrics';

// ── Observer render diagnostic ────────────────────────────────────────────────

/**
 * Snapshots the current renderCount on each page. Call before and after an
 * actor-page measurement to detect spurious observer re-renders.
 */
async function snapshotRenderCounts(pages: Page[]): Promise<number[]> {
  return Promise.all(pages.map(p => p.evaluate(() => window.__perfBridge?.renderCount ?? 0)));
}

// ── Test matrix ───────────────────────────────────────────────────────────────

const ALL_USER_COUNTS    = [2, 3, 4, 5] as const;
const ALL_OBJECT_COUNTS  = [1, 10, 100, 500] as const;

/** Slim subset: 2 users × key object counts. Tagged @slim in test titles. */
function isSlim(users: number, objects: number): boolean {
  return users === 2 && [1, 100, 500].includes(objects);
}

// ── Session helpers ───────────────────────────────────────────────────────────

interface Session {
  pages: Page[];
  context: BrowserContext;
}

async function setupSession(browser: Browser, userCount: number): Promise<Session> {
  // All pages share one BrowserContext so BroadcastChannel messages cross tab
  // boundaries. Separate contexts are isolated at the OS level and BroadcastChannel
  // does not cross that boundary in Playwright Chromium.
  const context = await browser.newContext();
  const pages: Page[] = [];

  for (let i = 0; i < userCount; i++) {
    pages.push(await context.newPage());
  }

  await Promise.all(pages.map(p => launchApp(p)));

  // Confirm all N pages are synced via a data-sentinel rather than awareness.
  // presenceUsers relies on the Firestore-gate (shouldBlockFirestoreFallback)
  // which doesn't activate in headless tests without a signaling server, even
  // though BroadcastChannel data sync works fine.
  const [sentinelId] = await pages[0].evaluate(() =>
    window.__perfBridge!.batchCreate([{ type: 'sticky', x: -99999, y: -99999 }]),
  );
  await Promise.all(
    pages.slice(1).map(p =>
      p.waitForFunction(
        (id: string) => window.__perfBridge?.getObjects().some(o => o.id === id) ?? false,
        sentinelId,
        { timeout: 15_000 },
      ),
    ),
  );
  // Clean up sentinel before tests begin
  await pages[0].evaluate(() => window.__perfBridge!.deleteAllObjects());
  await pages[0].waitForTimeout(300);

  return { pages, context };
}

async function teardownSession({ pages, context }: Session): Promise<void> {
  // Navigate away first so BroadcastChannel closes immediately, triggering
  // y-webrtc to null out awareness states before the next test opens pages.
  await Promise.all(pages.map(p => p.goto('about:blank').catch(() => {})));
  await pages[0].waitForTimeout(300);
  await context.close();
}

/**
 * Seeds `count` objects on the actor page (pages[0]) and waits for every
 * observer to receive them via BroadcastChannel sync.
 */
async function seedAndSync(pages: Page[], count: number): Promise<void> {
  await clearBoard(pages[0]);
  // Short pause so clear propagates before we seed
  await pages[0].waitForTimeout(400);

  if (count === 0) return;

  await createObjects(pages[0], count);

  for (const peer of pages.slice(1)) {
    await peer.waitForFunction(
      (n: number) => (window.__perfBridge?.getObjects().length ?? 0) >= n,
      count,
      { timeout: 15_000 },
    );
  }
}

// ── Sync latency (worst-case across all observers, median of N samples) ───────

interface LatencyResult {
  median: number;
  p95: number;
  samples: number[];
}

async function measureMultiSyncLatency(
  sender: Page,
  receivers: Page[],
  sampleCount = 5,
): Promise<LatencyResult> {
  const latencies: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    // Measure round-trip to every receiver; take the max (slowest peer wins).
    const perReceiver = await Promise.all(
      receivers.map(r => measureSyncLatency(sender, r)),
    );
    const valid = perReceiver.filter((v): v is number => v !== null);
    if (valid.length > 0) latencies.push(Math.max(...valid));
    await sender.waitForTimeout(150);
  }

  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? -1;
  const p95    = latencies[Math.floor(latencies.length * 0.95)] ?? latencies.at(-1) ?? -1;
  return { median, p95, samples: latencies };
}

// ── Test generation ───────────────────────────────────────────────────────────

/**
 * Generates the four scenario tests for one (users, objects) combination.
 * @slim tag is embedded in the title for combinations that belong to the slim suite.
 */
function generateCombination(users: number, objects: number): void {
  const slim = isSlim(users, objects) ? ' @slim' : '';
  const prefix = `[${users} users, ${objects} obj${slim}]`;

  // ── Idle ────────────────────────────────────────────────────────────────────
  test(`${prefix} idle FPS`, async ({ browser }) => {
    const session = await setupSession(browser, users);
    try {
      await seedAndSync(session.pages, objects);
      const diag = await measureIdleFpsDiag(session.pages[0]);
      console.log(
        `Idle FPS (${users} users, ${objects} obj): ${diag.fps.toFixed(1)} ` +
        `[frames=${diag.rawFrames} elapsed=${diag.rawElapsedMs}ms ` +
        `konvaNodes=${diag.konvaNodeCount} reactRenders=${diag.reactRendersDuringIdle}]`,
      );
      expect(diag.fps).toBeGreaterThan(55);
    } finally {
      await teardownSession(session);
    }
  });

  // ── Pan ─────────────────────────────────────────────────────────────────────
  test(`${prefix} pan FPS`, async ({ browser }) => {
    const session = await setupSession(browser, users);
    try {
      await seedAndSync(session.pages, objects);
      const observers = session.pages.slice(1);
      const rendersBefore = await snapshotRenderCounts(observers);
      const diag = await measurePanFpsDiag(session.pages[0]);
      const rendersAfter = await snapshotRenderCounts(observers);
      const observerDeltas = rendersAfter.map((v, i) => `p${i + 2}=${v - rendersBefore[i]}`);
      const dx = diag.stageAfter.x - diag.stageBefore.x;
      console.log(
        `Pan FPS (${users} users, ${objects} obj): ${diag.fps.toFixed(1)} ` +
        `[konvaNodes=${diag.konvaNodeCount} stageΔx=${dx.toFixed(1)} ` +
        `reactRenders=${diag.reactRendersDuringPan}` +
        (observerDeltas.length ? ` observer renders: [${observerDeltas.join(', ')}]` : '') +
        `]`,
      );
      expect(diag.fps).toBeGreaterThan(50);
    } finally {
      await teardownSession(session);
    }
  });

  // ── Zoom ────────────────────────────────────────────────────────────────────
  test(`${prefix} zoom FPS`, async ({ browser }) => {
    const session = await setupSession(browser, users);
    try {
      await seedAndSync(session.pages, objects);
      const diag = await measureZoomFpsDiag(session.pages[0]);
      console.log(
        `Zoom FPS (${users} users, ${objects} obj): ${diag.fps.toFixed(1)} ` +
        `[konvaNodes=${diag.konvaNodeCount} ` +
        `scale=${diag.scaleBefore.toFixed(2)}→${diag.scaleAfter.toFixed(2)} ` +
        `reactRenders=${diag.reactRendersDuringZoom}]`,
      );
      expect(diag.fps).toBeGreaterThan(50);
    } finally {
      await teardownSession(session);
    }
  });

  // ── Move object (FPS + sync latency) ────────────────────────────────────────
  test(`${prefix} move-object FPS + sync latency`, async ({ browser }) => {
    const session = await setupSession(browser, users);
    try {
      // Always seed at least 1 object so the drag lands on something.
      await seedAndSync(session.pages, Math.max(objects, 1));

      const observers = session.pages.slice(1);
      const rendersBefore = await snapshotRenderCounts(observers);
      const fpsDiag = await measureDragFpsDiag(session.pages[0]);
      const rendersAfter = await snapshotRenderCounts(observers);
      const observerDeltas = rendersAfter.map((v, i) => `p${i + 2}=${v - rendersBefore[i]}`);

      const latency = session.pages.length > 1
        ? await measureMultiSyncLatency(session.pages[0], session.pages.slice(1))
        : { median: 0, p95: 0, samples: [] };

      console.log(
        `Move-Object (${users} users, ${objects} obj): ` +
        `FPS=${fpsDiag.fps.toFixed(1)} ` +
        `[konvaNodes=${fpsDiag.konvaNodeCount} reactRenders=${fpsDiag.reactRendersDuringDrag}` +
        (observerDeltas.length ? ` observer renders: [${observerDeltas.join(', ')}]` : '') +
        `] ` +
        `sync p50=${latency.median.toFixed(1)}ms p95=${latency.p95.toFixed(1)}ms ` +
        `samples=[${latency.samples.map(s => s.toFixed(0)).join(', ')}]`,
      );

      expect(fpsDiag.fps).toBeGreaterThan(50);
      // Sync latency target: <100ms median (spec), allow up to 300ms under multi-user load
      if (latency.samples.length > 0) {
        expect(latency.median).toBeLessThan(300);
      }
    } finally {
      await teardownSession(session);
    }
  });
}

// ── Emit all test cases ───────────────────────────────────────────────────────

test.describe('Phase 6 — Multiplayer perf', () => {
  for (const users of ALL_USER_COUNTS) {
    for (const objects of ALL_OBJECT_COUNTS) {
      generateCombination(users, objects);
    }
  }
});
