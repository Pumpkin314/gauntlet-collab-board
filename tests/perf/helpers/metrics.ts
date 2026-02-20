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

export interface PanDiagnostics {
  fps: number;
  /** rAF frame count and elapsed ms (raw, for verification) */
  rawFrames: number;
  rawElapsedMs: number;
  /** Konva stage x/y before and after pan — confirms the stage actually moved */
  stageBefore: { x: number; y: number };
  stageAfter: { x: number; y: number };
  /** React re-renders during the pan — should be 0 if Konva handles pan natively */
  reactRendersDuringPan: number;
  /** Konva node count — confirms objects are actually in the scene graph */
  konvaNodeCount: number;
  /** Number of objects in board state */
  objectCount: number;
}

/** Simulates mousemove events on the canvas and measures FPS during the movement.
 *  Returns rich diagnostics to help verify the test is exercising the right code paths. */
export async function measurePanFps(
  page: Page, moveCount = 200, durationMs = 2000
): Promise<number> {
  return (await measurePanFpsDiag(page, moveCount, durationMs)).fps;
}

export async function measurePanFpsDiag(
  page: Page, moveCount = 60, durationMs = 2000
): Promise<PanDiagnostics> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  // Start in the lower-right quadrant to avoid hitting objects
  // (objects are seeded from top-left at (0,0) in board space).
  const startX = box.x + box.width * 0.75;
  const startY = box.y + box.height * 0.75;
  const panDistance = 200; // pixels to pan across

  const before = await page.evaluate(() => {
    const stage = (window as any).Konva?.stages?.[0];
    return {
      stageX: stage?.x() ?? 0,
      stageY: stage?.y() ?? 0,
      renderCount: window.__perfBridge?.renderCount ?? 0,
      konvaNodeCount: window.__perfBridge?.getKonvaNodeCount() ?? 0,
      objectCount: window.__perfBridge?.getObjects().length ?? 0,
    };
  });

  // Real drag-pan: mousedown → move across canvas → mouseup.
  // Matches exactly what test_pan.py confirms works against this app.
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Kick off the FPS counter in the page while the drag is in-flight.
  // page.evaluate with a Promise runs concurrently with Playwright mouse ops.
  const fpsPromise = page.evaluate((duration) => new Promise<{ frames: number; elapsedMs: number }>(resolve => {
    const t0 = performance.now();
    let frames = 0;
    const tick = (now: number) => {
      frames++;
      if (now - t0 < duration) requestAnimationFrame(tick);
      else resolve({ frames, elapsedMs: now - t0 });
    };
    requestAnimationFrame(tick);
  }), durationMs);

  // Sweep left across the canvas over durationMs
  const stepPx = panDistance / moveCount;
  const stepMs = durationMs / moveCount;
  for (let i = 1; i <= moveCount; i++) {
    await page.mouse.move(startX - i * stepPx, startY);
    await page.waitForTimeout(stepMs);
  }

  await page.mouse.up();
  const raw = await fpsPromise;

  const after = await page.evaluate(() => {
    const stage = (window as any).Konva?.stages?.[0];
    return {
      stageX: stage?.x() ?? 0,
      stageY: stage?.y() ?? 0,
      renderCount: window.__perfBridge?.renderCount ?? 0,
    };
  });

  return {
    fps: raw.frames / (raw.elapsedMs / 1000),
    rawFrames: raw.frames,
    rawElapsedMs: raw.elapsedMs,
    stageBefore: { x: before.stageX, y: before.stageY },
    stageAfter: { x: after.stageX, y: after.stageY },
    reactRendersDuringPan: after.renderCount - before.renderCount,
    konvaNodeCount: before.konvaNodeCount,
    objectCount: before.objectCount,
  };
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
