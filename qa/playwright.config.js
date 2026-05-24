'use strict';

/**
 * Playwright config for MatchHire QA automation.
 *
 * Assumptions:
 *   - Backend on http://localhost:3500 (override with QA_API_URL)
 *   - Frontend on http://localhost:5173 (override with QA_BASE_URL)
 *   - Both servers already running (the `qa:full` orchestrator
 *     in `qa/scripts/run-full.js` handles starting them before
 *     spawning playwright; running `npm run qa:e2e` directly
 *     assumes the dev servers are up).
 *
 * Reports:
 *   - HTML report at `qa/reports/html/`
 *   - JSON summary at `qa/reports/playwright.json`
 *   - Failed-test screenshots, videos, traces at `qa/screenshots/`
 *     and `qa/reports/traces/` respectively.
 *
 * Run subsets with grep tags:
 *   @a11y         — accessibility-focused specs
 *   @smoke        — fast happy-path checks
 *   @candidate    — flows that need the candidate test user
 *   @company      — flows that need the company test user
 */

const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5173';

module.exports = defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  // Authenticated specs log in on-the-fly via the API context and
  // inject tokens with `addInitScript` (see candidate-flow.spec.js).
  // That avoids the cross-context handoff issues the old
  // storage-state global setup ran into without making any extra
  // login calls than the per-test approach already requires.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,           // serial — easier to debug + shared backend state
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'reports/html'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'reports/playwright.json') }],
  ],
  outputDir: path.join(__dirname, 'reports/test-artifacts'),
  use: {
    baseURL: BASE_URL,
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    // Trace + screenshot ONLY on failure — keep the green path
    // fast. Override with `--trace on` from the CLI when
    // diagnosing flakes.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add 'firefox' / 'webkit' projects here when cross-browser
    // matters. Each adds ~30s install + ~2x run time.
  ],
});
