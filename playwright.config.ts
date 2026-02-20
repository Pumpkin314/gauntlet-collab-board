import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/perf',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'VITE_TEST_AUTH_BYPASS=true VITE_TEST_SKIP_SYNC=true npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
