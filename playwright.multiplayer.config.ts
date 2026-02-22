import { defineConfig } from '@playwright/test';

/**
 * Playwright config for multiplayer perf tests.
 *
 * Key difference from playwright.config.ts: VITE_TEST_SKIP_SYNC is intentionally
 * absent so y-webrtc BroadcastChannel sync runs between browser contexts in the
 * same process. Auth is still bypassed via VITE_TEST_AUTH_BYPASS.
 *
 * Tests must run sequentially (workers: 1) because all contexts share the same
 * board via BroadcastChannel — parallel tests would corrupt each other's state.
 */
export default defineConfig({
  testDir: './tests/perf',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'VITE_TEST_AUTH_BYPASS=true npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
