'use strict';

/**
 * Playwright config for MatchHire QA automation.
 *
 * What this config sets up:
 *   - Auto-starts the backend + frontend dev servers via the
 *     `webServer` block when `PW_AUTO_START=1` (default in
 *     qa/.env.qa). When 0, the suite assumes both are already
 *     running — useful for fast local iteration where you don't
 *     want Playwright to manage the lifecycle.
 *   - Projects: one functional `chromium` project + opt-in
 *     `firefox`, `webkit`, `tablet`, `mobile` projects. The full
 *     cross-browser matrix runs only when `PW_FULL_MATRIX=1` so
 *     the default `npm run qa:e2e` stays under a minute on a
 *     laptop.
 *   - Artefacts (screenshots, videos, traces) land under
 *     qa/screenshots, qa/videos, qa/traces respectively.
 *   - HTML report at qa/reports/html (open via `npm run qa:report`).
 *
 * Run subsets with grep tags:
 *   @smoke        — fast happy-path checks
 *   @a11y         — accessibility-focused specs
 *   @candidate    — flows that need the candidate test user
 *   @company      — flows that need the company test user
 *
 * Toggle env:
 *   PW_AUTO_START=1 (default)  start backend+frontend automatically
 *   PW_FULL_MATRIX=1            enable firefox/webkit/mobile/tablet
 *   QA_BASE_URL / FRONTEND_URL  override the SPA URL
 *   QA_API_URL / BACKEND_URL    override the API URL
 */

const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { defineConfig, devices } = require('@playwright/test');

// Load .env.qa first so the values below see it. (Backend dotenvs
// are loaded inside helpers/env.js; this only needs the QA defaults.)
dotenv.config({ path: path.resolve(__dirname, '.env.qa') });

const BASE_URL  = process.env.FRONTEND_URL || process.env.QA_BASE_URL || 'http://localhost:5173';
const API_URL   = process.env.BACKEND_URL  || process.env.QA_API_URL  || 'http://127.0.0.1:3500/api/v1';
const AUTO_START = process.env.PW_AUTO_START === '1';
const FULL_MATRIX = process.env.PW_FULL_MATRIX === '1';
const ROOT = path.resolve(__dirname, '..');

// The artefact buckets the QA brief asks for live alongside the
// reports/ dir. Playwright writes per-test artefacts into
// outputDir; we keep that as `reports/test-artifacts` so reports
// stay self-contained, then mirror the screenshots/videos/traces
// folders for ad-hoc helpers (screenshot.helper.js).
const ARTIFACTS_DIR = path.join(__dirname, 'reports/test-artifacts');
for (const sub of ['screenshots', 'videos', 'traces', 'reports']) {
  fs.mkdirSync(path.join(__dirname, sub), { recursive: true });
}

// Functional projects: every spec runs in these by default. The
// `desktop-chrome` baseline must always be present (it's the one
// the existing specs were authored against). The matrix expands
// to firefox / webkit / tablet / mobile only when explicitly
// asked for via PW_FULL_MATRIX — otherwise local runs stay fast.
const projects = [
  {
    name: 'desktop-chrome',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
];
if (FULL_MATRIX) {
  projects.push(
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-webkit',  use: { ...devices['Desktop Safari'],  viewport: { width: 1440, height: 900 } } },
    { name: 'tablet',          use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile',          use: { ...devices['iPhone 13'] } },
  );
}

const webServer = AUTO_START
  ? [
      {
        // Backend: Express + MySQL + Redis. The `/public/jobs`
        // endpoint is the cheapest GET in the API — it responds
        // 200 with the first page of results — which makes it a
        // reliable signal of "backend is up + DB is reachable".
        // We deliberately avoid hitting POST-only auth endpoints
        // (Playwright probes with GET so they'd return 404 here).
        command: 'npm run dev --prefix Backend',
        url: `${API_URL.replace(/\/api\/v1$/, '')}/api/v1/public/jobs?limit=1`,
        cwd: ROOT,
        reuseExistingServer: true,
        timeout: 90_000,
        ignoreHTTPSErrors: true,
      },
      {
        command: 'npm run dev --prefix Frontend',
        url: BASE_URL,
        cwd: ROOT,
        reuseExistingServer: true,
        timeout: 90_000,
      },
    ]
  : undefined;

module.exports = defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  // Auth specs log in on-the-fly via the API context and inject
  // tokens with `addInitScript` (see qa/helpers/auth.helper.js +
  // qa/e2e/candidate/candidate-flow.spec.js). That avoids the
  // cross-context handoff issues storage-state has historically
  // run into.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,           // serial — easier to debug + shared backend state
  // One retry locally too — Vite's dev server occasionally
  // re-bundles a route on first hit during a long suite, and a
  // single retry absorbs that without masking real flakes (a
  // genuine failure still fails both attempts).
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'reports/html'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'reports/playwright.json') }],
  ],
  outputDir: ARTIFACTS_DIR,
  use: {
    baseURL: BASE_URL,
    headless: true,
    actionTimeout: 10_000,
    // Vite's dev server re-bundles on the first hit to a new
    // route; the SSR-less app then has to do a JSON hydrate.
    // 60s comfortably absorbs that even under a long suite while
    // still flagging genuine deadlocks (page never resolves).
    navigationTimeout: 60_000,
    // Trace + screenshot ONLY on failure — keep the green path
    // fast. Override with `--trace on` from the CLI when
    // diagnosing flakes.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
  webServer,
});
