import { test, expect } from '@playwright/test';
import { measureFps, getKonvaNodeCount } from './helpers/metrics';
import { launchApp, clearBoard, createObjects } from './helpers/setup';

test.describe('Phase 2 — Viewport culling', () => {
  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  test('Konva node count <= visible objects + margin after zoom', async ({ page }) => {
    await createObjects(page, 1000);

    // Zoom in to show roughly 50 objects by scrolling the wheel
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Zoom in significantly (negative deltaY = zoom in for most implementations)
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);

    const nodeCount = await getKonvaNodeCount(page);
    console.log(`Konva node count after zoom: ${nodeCount}`);
    // With culling, we expect far fewer than 1000 nodes
    expect(nodeCount).toBeLessThanOrEqual(65);
  });

  test('pan FPS stays >= 55 while panning across 1000 objects', async ({ page }) => {
    await createObjects(page, 1000);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Pan in 4 segments, measure FPS each time
    const readings: number[] = [];
    for (let seg = 0; seg < 4; seg++) {
      const fpsPromise = page.evaluate((dur) => new Promise<number>(resolve => {
        const start = performance.now();
        let frames = 0;
        const tick = (now: number) => {
          frames++;
          if (now - start < dur) requestAnimationFrame(tick);
          else resolve(frames / ((now - start) / 1000));
        };
        requestAnimationFrame(tick);
      }), 500);

      for (let i = 0; i < 30; i++) {
        await page.mouse.move(cx + seg * 200 + i * 5, cy);
        await page.waitForTimeout(16);
      }

      const fps = await fpsPromise;
      readings.push(fps);
      console.log(`Segment ${seg} FPS: ${fps.toFixed(1)}`);
    }

    for (const fps of readings) {
      expect(fps).toBeGreaterThanOrEqual(55);
    }
  });
});
