import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 390, height: 844 } },
  webServer: [
    {
      command: 'pnpm --filter @dt/server dev',
      url: 'http://localhost:3000/readyz',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @dt/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
