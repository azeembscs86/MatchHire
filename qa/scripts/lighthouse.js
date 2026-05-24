'use strict';

/**
 * Lighthouse runner for MatchHire's key public pages.
 *
 * Launches a headless Chrome (via chrome-launcher), runs Lighthouse
 * on each route, and writes:
 *   - per-route HTML + JSON to qa/reports/lighthouse/<slug>.{html,json}
 *   - a tiny summary (qa/reports/lighthouse-summary.json) the
 *     report consolidator (qa/scripts/report.js) can pull in.
 *
 * Lighthouse + chrome-launcher are heavy dependencies; this script
 * gracefully skips when they aren't installed yet (logs + exits 0)
 * so `qa:full` still works on a fresh clone before
 * `npm install` finishes.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const { BASE_URL } = require('../helpers/env');

const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/jobs', slug: 'jobs' },
  { path: '/companies', slug: 'companies' },
];

async function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

async function main() {
  const lighthouse = (await tryRequire('lighthouse'))?.default
    || await tryRequire('lighthouse');
  const chromeLauncher = await tryRequire('chrome-launcher');
  if (!lighthouse || !chromeLauncher) {
    // eslint-disable-next-line no-console
    console.log('[lighthouse] dependencies not installed — skipping. Run `npm install` at the repo root first.');
    return;
  }

  const outDir = path.resolve(__dirname, '../reports/lighthouse');
  await fs.mkdir(outDir, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox'],
  });
  const summary = [];

  try {
    for (const route of ROUTES) {
      const url = `${BASE_URL}${route.path}`;
      // eslint-disable-next-line no-console
      console.log(`[lighthouse] auditing ${url}`);
      const result = await lighthouse(url, {
        port: chrome.port,
        output: ['html', 'json'],
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });

      // Newer Lighthouse versions return result.report as an array
      // when `output` is an array; older return a single string.
      const reports = Array.isArray(result.report) ? result.report : [result.report];
      const [html, json] = reports;
      await fs.writeFile(path.join(outDir, `${route.slug}.html`), html);
      if (json) await fs.writeFile(path.join(outDir, `${route.slug}.json`), json);

      const cats = result.lhr.categories || {};
      summary.push({
        route: route.path,
        scores: {
          performance: Math.round((cats.performance?.score || 0) * 100),
          accessibility: Math.round((cats.accessibility?.score || 0) * 100),
          best_practices: Math.round((cats['best-practices']?.score || 0) * 100),
          seo: Math.round((cats.seo?.score || 0) * 100),
        },
      });
    }
  } finally {
    await chrome.kill();
  }

  await fs.writeFile(
    path.resolve(__dirname, '../reports/lighthouse-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  // eslint-disable-next-line no-console
  console.log('[lighthouse] done. Summary:', JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[lighthouse] failed:', err.message);
    // Non-zero exit so qa:full surfaces the failure but doesn't
    // abort other report sources.
    process.exit(1);
  });
}

module.exports = { main };
