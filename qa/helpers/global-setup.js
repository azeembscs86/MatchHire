'use strict';

/**
 * Playwright global setup — runs once before the entire e2e
 * suite. Logs in as each canonical QA role and snapshots the
 * authenticated browser storage to disk so individual specs can
 * `storageState`-load instead of re-hitting /auth/login.
 *
 * Why bother:
 *   - The /auth/login endpoint is rate-limited (authLimiter). A
 *     suite that logs in N times per test trips the limiter
 *     within a few minutes, producing noisy "Too many auth
 *     attempts" failures that have nothing to do with the code
 *     under test.
 *   - Storage-state reuse is also the canonical Playwright
 *     pattern, ~10× faster than fresh logins.
 *
 * The snapshots live in qa/reports/auth/<role>.json (gitignored
 * via the reports/* rule). They expire whenever the API issues
 * a new refresh token, so we re-run the setup every time the
 * orchestrator does.
 */

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const { loginViaAPI } = require('./auth-ui');
const { BASE_URL } = require('./env');

const STORAGE_DIR = path.resolve(__dirname, '../reports/auth');

async function snapshot(role) {
  const browser = await chromium.launch();
  // Pass baseURL explicitly — the Playwright config's baseURL
  // only applies to test-fixture contexts, NOT to a context we
  // create manually via chromium.launch(). Without this,
  // `page.goto('/')` inside loginViaAPI throws "Cannot navigate
  // to invalid URL".
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await loginViaAPI(page, role);
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const out = path.join(STORAGE_DIR, `${role.toLowerCase()}.json`);
  await context.storageState({ path: out });
  await browser.close();
  return out;
}

module.exports = async () => {
  // Each role gets its own state file. Failures here would
  // crash the whole suite, which is what we want — without a
  // working login flow, the authenticated tests can't run.
  await snapshot('CANDIDATE');
  await snapshot('COMPANY');
};

module.exports.STORAGE_DIR = STORAGE_DIR;
