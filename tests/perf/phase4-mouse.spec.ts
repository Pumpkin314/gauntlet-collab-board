import { test, expect } from '@playwright/test';
import { getRenderCount, resetRenderCount } from './helpers/metrics';
import { launchApp, clearBoard, createObjects } from './helpers/setup';

test.describe('Phase 4 — Mouse event re-renders', () => {
  test.beforeEach(async ({ page }) => {
    await launchApp(page);
    await clearBoard(page);
  });

  test('500ms of mousemove causes 0 React renders (cursor tool)', async ({ page }) => {
    await createObjects(page, 100);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await resetRenderCount(page);

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // 200 mousemove events at ~60Hz over ~500ms
    for (let i = 0; i < 200; i++) {
      await page.mouse.move(
        cx + Math.cos(i * 0.03) * 100,
        cy + Math.sin(i * 0.03) * 100,
      );
    }

    await page.waitForTimeout(100);
    const renderCount = await getRenderCount(page);
    console.log(`Render count after 200 mousemoves (cursor tool): ${renderCount}`);
    expect(renderCount).toBe(0);
  });

  test('500ms of mousemove causes 0 React renders (line tool active)', async ({ page }) => {
    await createObjects(page, 100);

    // Activate line tool if there's a toolbar button for it
    const lineBtn = page.locator('[data-tool="line"], [title*="line" i], button:has-text("Line")').first();
    if (await lineBtn.isVisible()) {
      await lineBtn.click();
    }

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await resetRenderCount(page);

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    for (let i = 0; i < 200; i++) {
      await page.mouse.move(
        cx + Math.cos(i * 0.03) * 100,
        cy + Math.sin(i * 0.03) * 100,
      );
    }

    await page.waitForTimeout(100);
    const renderCount = await getRenderCount(page);
    console.log(`Render count after 200 mousemoves (line tool): ${renderCount}`);
    expect(renderCount).toBe(0);
  });
});
