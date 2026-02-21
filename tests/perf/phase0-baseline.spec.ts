import { test, expect } from '@playwright/test';
import {
  measureIdleFpsDiag, measurePanFpsDiag, measureDragFpsDiag,
  measureZoomFpsDiag, measureCreateLatency, getRenderCount, resetRenderCount,
} from './helpers/metrics';
import { launchApp, clearBoard, createObjects, formatReport } from './helpers/setup';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One-line summary for a diag result — keeps console output scannable. */
function idleTag(d: { rawFrames: number; rawElapsedMs: number; konvaNodeCount: number; objectCount: number; reactRendersDuringIdle: number }) {
  return `[frames=${d.rawFrames} elapsed=${d.rawElapsedMs.toFixed(0)}ms konvaNodes=${d.konvaNodeCount} objects=${d.objectCount} reactRenders=${d.reactRendersDuringIdle}]`;
}
function panTag(d: { rawFrames: number; rawElapsedMs: number; konvaNodeCount: number; objectCount: number; stageBefore: {x:number}; stageAfter: {x:number}; reactRendersDuringPan: number }) {
  return `[frames=${d.rawFrames} elapsed=${d.rawElapsedMs.toFixed(0)}ms konvaNodes=${d.konvaNodeCount} objects=${d.objectCount} stageΔx=${(d.stageAfter.x - d.stageBefore.x).toFixed(1)} reactRenders=${d.reactRendersDuringPan}]`;
}
function dragTag(d: { rawFrames: number; rawElapsedMs: number; konvaNodeCount: number; objectCount: number; reactRendersDuringDrag: number; dragStartPx: {x:number;y:number} }) {
  return `[frames=${d.rawFrames} elapsed=${d.rawElapsedMs.toFixed(0)}ms konvaNodes=${d.konvaNodeCount} objects=${d.objectCount} dragStart=(${d.dragStartPx.x.toFixed(0)},${d.dragStartPx.y.toFixed(0)}) reactRenders=${d.reactRendersDuringDrag}]`;
}
function zoomTag(d: { rawFrames: number; rawElapsedMs: number; konvaNodeCount: number; objectCount: number; reactRendersDuringZoom: number; scaleBefore: number; scaleAfter: number }) {
  return `[frames=${d.rawFrames} elapsed=${d.rawElapsedMs.toFixed(0)}ms konvaNodes=${d.konvaNodeCount} objects=${d.objectCount} scale=${d.scaleBefore.toFixed(2)}→${d.scaleAfter.toFixed(2)} reactRenders=${d.reactRendersDuringZoom}]`;
}

test.describe('Phase 0 — Baseline', () => {
  const results: Record<string, unknown> = {};

  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  // ── Idle FPS ──────────────────────────────────────────────────────────────

  test('idle FPS with 0 objects', async ({ page }) => {
    const d = await measureIdleFpsDiag(page);
    results['idleFps_0'] = d.fps;
    console.log(`Idle FPS (0 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('idle FPS with 5 objects', async ({ page }) => {
    await createObjects(page, 5);
    const d = await measureIdleFpsDiag(page);
    results['idleFps_5'] = d.fps;
    console.log(`Idle FPS (5 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('idle FPS with 10 objects', async ({ page }) => {
    await createObjects(page, 10);
    const d = await measureIdleFpsDiag(page);
    results['idleFps_10'] = d.fps;
    console.log(`Idle FPS (10 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('idle FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const d = await measureIdleFpsDiag(page);
    results['idleFps_100'] = d.fps;
    console.log(`Idle FPS (100 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('idle FPS with 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);
    const d = await measureIdleFpsDiag(page);
    results['idleFps_1000'] = d.fps;
    console.log(`Idle FPS (1000 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThanOrEqual(0);
  });

  // ── Pan FPS ───────────────────────────────────────────────────────────────

  test('pan FPS with 5 objects', async ({ page }) => {
    await createObjects(page, 5);
    const d = await measurePanFpsDiag(page);
    results['panFps_5'] = d.fps;
    console.log(`Pan FPS (5 objects): ${d.fps.toFixed(1)} ${panTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('pan FPS with 10 objects', async ({ page }) => {
    await createObjects(page, 10);
    const d = await measurePanFpsDiag(page);
    results['panFps_10'] = d.fps;
    console.log(`Pan FPS (10 objects): ${d.fps.toFixed(1)} ${panTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('pan FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const d = await measurePanFpsDiag(page);
    results['panFps_100'] = d.fps;
    console.log(`Pan FPS (100 objects): ${d.fps.toFixed(1)} ${panTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('pan FPS with 1000 objects', { timeout: 600_000 }, async ({ page }) => {
    await createObjects(page, 1000);
    // 1000-object page is near-frozen: use 3 mouse steps (not 60) to avoid
    // blocking Playwright for minutes waiting for CDP acknowledgements.
    const d = await measurePanFpsDiag(page, 3, 2000);
    results['panFps_1000'] = d.fps;
    console.log(`Pan FPS (1000 objects): ${d.fps.toFixed(1)} ${panTag(d)}`);
    expect(d.fps).toBeGreaterThanOrEqual(0);
  });

  // ── Drag FPS ──────────────────────────────────────────────────────────────

  test('drag FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const d = await measureDragFpsDiag(page);
    results['dragFps_100'] = d.fps;
    console.log(`Drag FPS (100 objects): ${d.fps.toFixed(1)} ${dragTag(d)}`);
    expect(d.fps).toBeGreaterThan(0);
  });

  test('drag FPS with 1000 objects', { timeout: 600_000 }, async ({ page }) => {
    await createObjects(page, 1000);
    // Use 3 steps — page is near-frozen so each mouse.move blocks for seconds.
    const d = await measureDragFpsDiag(page, 2000, 3);
    results['dragFps_1000'] = d.fps;
    console.log(`Drag FPS (1000 objects): ${d.fps.toFixed(1)} ${dragTag(d)}`);
    expect(d.fps).toBeGreaterThanOrEqual(0);
  });

  // ── 500-object suite ─────────────────────────────────────────────────────

  test('idle FPS with 500 objects', async ({ page }) => {
    await createObjects(page, 500);
    const d = await measureIdleFpsDiag(page);
    results['idleFps_500'] = d.fps;
    console.log(`Idle FPS (500 objects): ${d.fps.toFixed(1)} ${idleTag(d)}`);
    expect(d.fps).toBeGreaterThan(50);
  });

  test('pan FPS with 500 objects', async ({ page }) => {
    await createObjects(page, 500);
    const d = await measurePanFpsDiag(page);
    results['panFps_500'] = d.fps;
    console.log(`Pan FPS (500 objects): ${d.fps.toFixed(1)} ${panTag(d)}`);
    expect(d.fps).toBeGreaterThan(40);
  });

  test('zoom FPS with 500 objects', async ({ page }) => {
    await createObjects(page, 500);
    const d = await measureZoomFpsDiag(page);
    results['zoomFps_500'] = d.fps;
    console.log(`Zoom FPS (500 objects): ${d.fps.toFixed(1)} ${zoomTag(d)}`);
    expect(d.fps).toBeGreaterThan(40);
  });

  test('drag FPS with 500 objects', async ({ page }) => {
    await createObjects(page, 500);
    const d = await measureDragFpsDiag(page);
    results['dragFps_500'] = d.fps;
    console.log(`Drag FPS (500 objects): ${d.fps.toFixed(1)} ${dragTag(d)}`);
    expect(d.fps).toBeGreaterThan(40);
  });

  // ── Create latency ────────────────────────────────────────────────────────

  test('create latency (1, 10, 50, 100 objects)', async ({ page }) => {
    for (const count of [1, 10, 50, 100]) {
      await clearBoard(page);
      const latency = await measureCreateLatency(page, count);
      results[`createLatency_${count}`] = latency;
      console.log(`Create latency (${count} objects): ${latency.toFixed(1)}ms`);
      expect(latency).toBeGreaterThan(0);
    }
  });

  // ── React render count ────────────────────────────────────────────────────

  test('render count during 500ms pan with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    await resetRenderCount(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // mousemove only (no mousedown) — tests the hot path without triggering drag
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(box!.x + box!.width / 2 + i * 3, box!.y + box!.height / 2);
      await page.waitForTimeout(16);
    }

    const renderCount = await getRenderCount(page);
    results['renderCount_mousemove_100'] = renderCount;
    console.log(`Render count during mousemove (100 objects, no drag): ${renderCount}`);
  });

  test.afterAll(() => {
    const reportPath = path.join(__dirname, 'reports', 'baseline.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, formatReport('baseline', results));
    console.log(`Baseline report saved to ${reportPath}`);
  });
});
