import { test, expect } from '@playwright/test';
import { measurePanFps, getRenderCount, resetRenderCount } from './helpers/metrics';
import { launchApp, clearBoard, createObjects } from './helpers/setup';

test.describe('Phase 1 — Render cascade eliminated', () => {
  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  test('dragging 1 shape out of 100 triggers <= 2 React re-renders', async ({ page }) => {
    await createObjects(page, 100);
    await resetRenderCount(page);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + 110;
    const cy = box!.y + 110;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx + i * 5, cy + i * 2);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    const renderCount = await getRenderCount(page);
    console.log(`Render count after drag (100 objects): ${renderCount}`);
    expect(renderCount).toBeLessThanOrEqual(2);
  });

  test('pan FPS >= 55 with 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);
    const fps = await measurePanFps(page);
    console.log(`Pan FPS (1000 objects): ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThanOrEqual(55);
  });
});
