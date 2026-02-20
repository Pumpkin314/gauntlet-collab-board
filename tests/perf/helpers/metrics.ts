import type { Page } from '@playwright/test';

/** Measures FPS over `durationMs` by counting discrete rAF frames. */
export async function measureFps(page: Page, durationMs = 2000): Promise<number> {
  return page.evaluate((duration) => new Promise<number>(resolve => {
    const startTime = performance.now();
    let frames = 0;
    const tick = (now: number) => {
      frames++;
      if (now - startTime < duration) {
        requestAnimationFrame(tick);
      } else {
        resolve(frames / ((now - startTime) / 1000));
      }
    };
    requestAnimationFrame(tick);
  }), durationMs);
}

/** Measures time from batchCreate call to second rAF (React commit + Konva redraw). */
export async function measureCreateLatency(
  page: Page, count: number
): Promise<number> {
  return page.evaluate(async (n) => {
    const items = Array.from({ length: n }, (_, i) => ({
      type: 'sticky' as const,
      x: (i % 50) * 220,
      y: Math.floor(i / 50) * 220,
    }));
    performance.mark('create-start');
    window.__perfBridge!.batchCreate(items);
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    performance.mark('create-end');
    return performance.measure('create-op', 'create-start', 'create-end').duration;
  }, count);
}

/** Simulates mousemove events on the canvas and measures FPS during the movement. */
export async function measurePanFps(
  page: Page, moveCount = 200, durationMs = 2000
): Promise<number> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  const fpsPromise = measureFps(page, durationMs);

  const stepDelay = durationMs / moveCount;
  for (let i = 0; i < moveCount; i++) {
    await page.mouse.move(
      startX + (i * 2) - moveCount,
      startY + Math.sin(i * 0.1) * 50,
    );
    await page.waitForTimeout(stepDelay);
  }

  return fpsPromise;
}

/** Simulates a drag of one object and measures FPS. */
export async function measureDragFps(
  page: Page, durationMs = 2000
): Promise<number> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();

  // Fire mouse events without a per-step delay; the FPS counter in the page
  // runs on rAF and captures real throughput regardless of event rate.
  const fpsPromise = measureFps(page, durationMs);

  const steps = 50;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx + i * 2, cy + i);
  }

  await page.mouse.up();
  return fpsPromise;
}

/** Returns the current render count from the perf bridge. */
export async function getRenderCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__perfBridge?.renderCount ?? 0);
}

/** Resets the render count to 0. */
export async function resetRenderCount(page: Page): Promise<void> {
  await page.evaluate(() => window.__perfBridge?.resetRenderCount());
}

/** Returns the Konva node count on layer 0. */
export async function getKonvaNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__perfBridge?.getKonvaNodeCount() ?? 0);
}

/** Measures P2P sync latency between two pages using absolute timestamps. */
export async function measureSyncLatency(
  senderPage: Page, receiverPage: Page
): Promise<number | null> {
  const testId = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const objId = await senderPage.evaluate((id) => {
    const sentAt = performance.timeOrigin + performance.now();
    const [objId] = window.__perfBridge!.batchCreate([{ type: 'sticky', x: 0, y: 0 }]);
    (window as any).__syncTest = { id, objId, sentAt };
    return objId;
  }, testId);

  const sentAt = await senderPage.evaluate(() => (window as any).__syncTest.sentAt as number);

  return receiverPage.evaluate(async ({ objId, sentAt }) => {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const objects = window.__perfBridge!.getObjects();
      if (objects.some((o) => o.id === objId)) {
        const receivedAt = performance.timeOrigin + performance.now();
        return receivedAt - sentAt;
      }
      await new Promise(r => setTimeout(r, 5));
    }
    return null;
  }, { objId, sentAt });
}
