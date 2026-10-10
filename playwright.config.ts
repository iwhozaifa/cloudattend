import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Tests share one in-memory local API, reset before each test, so they run serially.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } } : {}),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } } },
    { name: 'tablet-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }
  ],
  // The real API router + Cognito emulation (apps/api/src/local-server.ts) and the web app in e2e mode.
  webServer: [
    {
      command: 'npm run build -w @cloudattend/shared && tsx apps/api/src/local-server.ts',
      url: 'http://127.0.0.1:8787/health',
      env: { LOCAL_API_PORT: '8787' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'npm --workspace @cloudattend/web run dev -- --mode e2e --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/sign-in',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
