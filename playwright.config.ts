import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3030', trace: 'retain-on-failure', actionTimeout: 10_000 },
  webServer: { command: `${process.execPath} scripts/start-e2e-server.mjs`, url: 'http://127.0.0.1:3030', reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
