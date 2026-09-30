import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  // 所有用例共用一个开发服务器和同一个 IP（localhost），并行跑会触发按 IP 的限流
  workers: 1,
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
