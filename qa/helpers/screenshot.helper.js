'use strict';

/**
 * Screenshot helper — disciplined ad-hoc screenshot capture for
 * specs that want to record state at a specific moment (not on
 * failure — Playwright handles failure shots itself).
 *
 * Files go to `qa/screenshots/<spec-name>/<label>.png`, where the
 * spec name is derived from the current test's title (kebab-
 * cased). Existing files are overwritten so re-running a spec
 * doesn't leave stale artefacts.
 */

const path = require('node:path');
const fs = require('node:fs');

const SCREENSHOT_ROOT = path.resolve(__dirname, '../screenshots');

function slugify(s) {
  return String(s || 'unnamed')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Take a labelled screenshot of the current page state.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} label  Short human label (will be slugified).
 * @param {{ fullPage?: boolean }} [opts]
 * @returns {Promise<string>} The absolute path written.
 */
async function captureLabelled(page, testInfo, label, opts = {}) {
  const dir = path.join(SCREENSHOT_ROOT, slugify(testInfo?.title || 'spec'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(label)}.png`);
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  // Attach to the HTML report so reviewers don't have to dig
  // through the artefact tree.
  try { await testInfo?.attach?.(label, { path: file, contentType: 'image/png' }); } catch { /* noop */ }
  return file;
}

/**
 * Snapshot the page at each of the standard responsive viewports
 * (desktop / tablet / mobile). Useful for visual review tests
 * that want to record what the same page looks like across the
 * three primary breakpoints.
 */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 820,  height: 1180 },
  mobile:  { width: 390,  height: 844 },
};

async function captureAcrossViewports(page, testInfo, label) {
  const previous = page.viewportSize();
  const out = {};
  for (const [name, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    out[name] = await captureLabelled(page, testInfo, `${label}-${name}`, { fullPage: true });
  }
  if (previous) await page.setViewportSize(previous);
  return out;
}

module.exports = {
  VIEWPORTS,
  captureLabelled,
  captureAcrossViewports,
  SCREENSHOT_ROOT,
};
