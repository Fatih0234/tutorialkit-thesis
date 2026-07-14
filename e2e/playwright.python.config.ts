import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: 'python.test.ts',
  use: {
    baseURL: 'http://localhost:4329',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: 'corepack pnpm preview',
    url: 'http://localhost:4329',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  expect: { timeout: 30_000 },
});
