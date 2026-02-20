import { test, expect } from '@playwright/test';
import { launchApp, clearBoard, createObjects } from './helpers/setup';

test.describe('Phase 3 — Canvas draw cost', () => {
  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  test('no shadows when shape count > 50', async ({ page }) => {
    await createObjects(page, 60);

    const hasShadows = await page.evaluate(() => {
      const stage = (window as any).Konva?.stages?.[0];
      if (!stage) return false;
      const layer = stage.getLayers()[0];
      if (!layer) return false;
      const children = layer.getChildren();
      return children.some((child: any) => {
        const blur = child.shadowBlur?.() ?? child.attrs?.shadowBlur ?? 0;
        return blur > 0;
      });
    });

    console.log(`Shadows present with 60 shapes: ${hasShadows}`);
    expect(hasShadows).toBe(false);
  });

  test('p95 frame draw time < 8ms', async ({ page }) => {
    await createObjects(page, 60);

    const p95 = await page.evaluate(() => new Promise<number>(resolve => {
      const stage = (window as any).Konva?.stages?.[0];
      if (!stage) { resolve(-1); return; }
      const layer = stage.getLayers()[0];
      if (!layer) { resolve(-1); return; }

      const times: number[] = [];
      let sampleCount = 0;

      const origDraw = layer.draw.bind(layer);
      layer.draw = () => {
        const t0 = performance.now();
        origDraw();
        times.push(performance.now() - t0);
        sampleCount++;
        if (sampleCount >= 60) {
          layer.draw = origDraw;
          times.sort((a, b) => a - b);
          resolve(times[Math.floor(times.length * 0.95)]);
        }
      };

      // Force redraws
      const tick = () => {
        if (sampleCount < 60) {
          layer.batchDraw();
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    }));

    console.log(`p95 draw time: ${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(8);
  });
});
