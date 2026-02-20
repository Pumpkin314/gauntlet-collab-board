import { test, expect } from '@playwright/test';
import { measureFps, measureCreateLatency, measurePanFps, measureDragFps, getRenderCount, resetRenderCount } from './helpers/metrics';
import { launchApp, clearBoard, createObjects, formatReport } from './helpers/setup';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Phase 0 — Baseline', () => {
  const results: Record<string, unknown> = {};

  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  test('idle FPS with 0 objects', async ({ page }) => {
    const fps = await measureFps(page);
    results['idleFps_0'] = fps;
    console.log(`Idle FPS (0 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('idle FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const fps = await measureFps(page);
    results['idleFps_100'] = fps;
    console.log(`Idle FPS (100 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('idle FPS with 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);
    const fps = await measureFps(page);
    results['idleFps_1000'] = fps;
    console.log(`Idle FPS (1000 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('pan FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const fps = await measurePanFps(page);
    results['panFps_100'] = fps;
    console.log(`Pan FPS (100 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('pan FPS with 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);
    const fps = await measurePanFps(page);
    results['panFps_1000'] = fps;
    console.log(`Pan FPS (1000 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('drag FPS with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    const fps = await measureDragFps(page);
    results['dragFps_100'] = fps;
    console.log(`Drag FPS (100 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('drag FPS with 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);
    const fps = await measureDragFps(page);
    results['dragFps_1000'] = fps;
    console.log(`Drag FPS (1000 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(0);
  });

  test('create latency (1, 10, 50, 100 objects)', async ({ page }) => {
    for (const count of [1, 10, 50, 100]) {
      await clearBoard(page);
      const latency = await measureCreateLatency(page, count);
      results[`createLatency_${count}`] = latency;
      console.log(`Create latency (${count} objects): ${latency.toFixed(1)}ms`);
      expect(latency).toBeGreaterThan(0);
    }
  });

  test('render count during 500ms pan with 100 objects', async ({ page }) => {
    await createObjects(page, 100);
    await resetRenderCount(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    for (let i = 0; i < 30; i++) {
      await page.mouse.move(box!.x + box!.width / 2 + i * 3, box!.y + box!.height / 2);
      await page.waitForTimeout(16);
    }

    const renderCount = await getRenderCount(page);
    results['renderCount_pan_100'] = renderCount;
    console.log(`Render count during pan (100 objects): ${renderCount}`);
  });

  test.afterAll(() => {
    const reportPath = path.join(__dirname, 'reports', 'baseline.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, formatReport('baseline', results));
    console.log(`Baseline report saved to ${reportPath}`);
  });
});
