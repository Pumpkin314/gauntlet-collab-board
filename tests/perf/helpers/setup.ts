import type { Page } from '@playwright/test';

/** Navigates to the app and waits for the perf bridge to be available. */
export async function launchApp(page: Page) {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof window.__perfBridge !== 'undefined',
    { timeout: 15_000 },
  );
}

/** Clears all objects on the board via the perf bridge. */
export async function clearBoard(page: Page) {
  await page.evaluate(() => window.__perfBridge!.deleteAllObjects());
  await page.waitForTimeout(100);
}

/** Creates `count` sticky notes in a grid layout and waits for render. */
export async function createObjects(
  page: Page, count: number, type: 'sticky' | 'rect' | 'circle' = 'sticky'
) {
  await page.evaluate(({ count, type }) => {
    const items = Array.from({ length: count }, (_, i) => ({
      type: type as any,
      x: (i % 50) * 220,
      y: Math.floor(i / 50) * 220,
    }));
    window.__perfBridge!.batchCreate(items);
  }, { count, type });
  // Wait for React to commit
  await page.waitForTimeout(200);
}

/** Writes a JSON report to the reports directory. */
export function formatReport(name: string, data: Record<string, unknown>): string {
  return JSON.stringify({ name, timestamp: new Date().toISOString(), ...data }, null, 2);
}
