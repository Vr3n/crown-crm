import { defineConfig } from '@playwright/test'
import { join } from 'path'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts/
    }
  ],
  // Absolute path to the built main entry so specs can launch the real app.
  // (Playwright reads this via process.env, not as a config key — kept here
  // as documentation; specs resolve it themselves.)
  metadata: {
    mainEntry: join(__dirname, 'out', 'main', 'index.js')
  }
})
