/**
 * Phase 5 — P2P sync latency
 *
 * Runs with VITE_TEST_SKIP_SYNC=false to test real WebRTC/BroadcastChannel sync
 * between two tabs in the same browser context.
 */

import { test, expect } from '@playwright/test';
import { measureSyncLatency } from './helpers/metrics';

test.describe('Phase 5 — P2P sync latency', () => {
  test('one-way CRDT sync latency < 100ms (median of 5 samples)', async ({ browser }) => {
    const context = await browser.newContext();

    const tabA = await context.newPage();
    const tabB = await context.newPage();

    // Both tabs navigate to the app
    await tabA.goto('/');
    await tabA.waitForFunction(
      () => typeof window.__perfBridge !== 'undefined',
      { timeout: 15_000 },
    );

    await tabB.goto('/');
    await tabB.waitForFunction(
      () => typeof window.__perfBridge !== 'undefined',
      { timeout: 15_000 },
    );

    // Allow sync providers to connect
    await tabA.waitForTimeout(2000);

    const latencies: number[] = [];

    for (let i = 0; i < 5; i++) {
      const latency = await measureSyncLatency(tabA, tabB);
      if (latency !== null) {
        latencies.push(latency);
        console.log(`Sync sample ${i + 1}: ${latency.toFixed(1)}ms`);
      } else {
        console.log(`Sync sample ${i + 1}: TIMEOUT`);
      }
      await tabA.waitForTimeout(200);
    }

    expect(latencies.length).toBeGreaterThan(0);

    latencies.sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    console.log(`Median sync latency: ${median.toFixed(1)}ms`);

    expect(median).toBeLessThan(100);
    expect(Math.max(...latencies)).toBeLessThan(500);

    await context.close();
  });
});
