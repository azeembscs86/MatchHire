'use strict';

/**
 * Consolidated QA report.
 *
 * Reads every per-tool output the suite produces and emits a
 * single HTML file at qa/reports/qa-report.html plus a plain
 * stdout summary that drops cleanly into a Slack / CI log.
 *
 * Sources consumed:
 *   qa/reports/playwright.json       — e2e + a11y results
 *   qa/reports/lighthouse-summary.json — perf / a11y / seo scores
 *
 * Future hooks:
 *   - Add Jest's JSON output (set --json on qa:api) and merge it.
 *   - Render the per-route Lighthouse links instead of just
 *     scores once a CI artifact bucket exists.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORTS = path.resolve(__dirname, '../reports');

function loadJson(file) {
  const p = path.join(REPORTS, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { return null; }
}

function summarisePlaywright(pw) {
  if (!pw) return { passed: 0, failed: 0, skipped: 0, suites: [] };
  let passed = 0, failed = 0, skipped = 0;
  const failures = [];
  function walk(suites = []) {
    for (const s of suites) {
      for (const spec of s.specs || []) {
        for (const t of spec.tests || []) {
          for (const r of t.results || []) {
            if (r.status === 'passed') passed += 1;
            else if (r.status === 'skipped') skipped += 1;
            else { failed += 1; failures.push({ title: spec.title, status: r.status, error: r.error?.message?.split('\n')[0] || '' }); }
          }
        }
      }
      if (s.suites) walk(s.suites);
    }
  }
  walk(pw.suites || []);
  return { passed, failed, skipped, failures };
}

function summariseLighthouse(lh) {
  if (!Array.isArray(lh)) return [];
  return lh;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(report) {
  const { playwright, lighthouse, generatedAt } = report;

  const failRows = playwright.failures.map((f) => `
    <tr>
      <td>${escapeHtml(f.title)}</td>
      <td>${escapeHtml(f.status)}</td>
      <td><pre>${escapeHtml(f.error || '')}</pre></td>
    </tr>`).join('') || '<tr><td colspan="3">No failures</td></tr>';

  const lhRows = lighthouse.length === 0
    ? '<tr><td colspan="5">No Lighthouse runs found. Run `npm run qa:lighthouse` first.</td></tr>'
    : lighthouse.map((r) => `
      <tr>
        <td>${escapeHtml(r.route)}</td>
        <td>${r.scores.performance}</td>
        <td>${r.scores.accessibility}</td>
        <td>${r.scores.best_practices}</td>
        <td>${r.scores.seo}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MatchHire QA report</title>
  <style>
    body { font: 14px/1.5 -apple-system, system-ui, sans-serif; max-width: 980px; margin: 32px auto; padding: 0 16px; color: #0E1116; }
    h1, h2 { font-family: 'Fraunces', Georgia, serif; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    .meta { color: #6B6258; font-size: 12px; margin-bottom: 24px; }
    .summary-row { display: flex; gap: 12px; margin-bottom: 24px; }
    .summary-card { flex: 1; padding: 16px; border-radius: 12px; border: 1px solid #E2D9C7; background: #fff; }
    .summary-card strong { font-family: 'Fraunces', serif; font-size: 28px; display: block; }
    .pass { color: #3F6B4F; }
    .fail { color: #C73E1D; }
    .skip { color: #B8893A; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 24px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #EDE5D3; vertical-align: top; }
    th { font-weight: 600; color: #6B6258; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    pre { margin: 0; white-space: pre-wrap; font-size: 12px; color: #C73E1D; }
  </style>
</head>
<body>
  <h1>MatchHire QA report</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt)}</div>

  <div class="summary-row">
    <div class="summary-card pass">
      <strong>${playwright.passed}</strong>
      <span>Passed</span>
    </div>
    <div class="summary-card fail">
      <strong>${playwright.failed}</strong>
      <span>Failed</span>
    </div>
    <div class="summary-card skip">
      <strong>${playwright.skipped}</strong>
      <span>Skipped</span>
    </div>
  </div>

  <h2>Failures</h2>
  <table>
    <thead><tr><th>Test</th><th>Status</th><th>Error</th></tr></thead>
    <tbody>${failRows}</tbody>
  </table>

  <h2>Lighthouse</h2>
  <table>
    <thead><tr><th>Route</th><th>Perf</th><th>A11y</th><th>Best practices</th><th>SEO</th></tr></thead>
    <tbody>${lhRows}</tbody>
  </table>

  <p style="color: #6B6258; font-size: 12px;">
    Detailed Playwright HTML report: <a href="./html/index.html">qa/reports/html</a><br>
    Per-route Lighthouse reports: <a href="./lighthouse">qa/reports/lighthouse</a>
  </p>
</body>
</html>`;
}

function main() {
  const playwrightRaw = loadJson('playwright.json');
  const lighthouseRaw = loadJson('lighthouse-summary.json');

  const report = {
    generatedAt: new Date().toISOString(),
    playwright: summarisePlaywright(playwrightRaw),
    lighthouse: summariseLighthouse(lighthouseRaw),
  };

  fs.writeFileSync(path.join(REPORTS, 'qa-report.html'), render(report));
  fs.writeFileSync(path.join(REPORTS, 'qa-report.json'), JSON.stringify(report, null, 2));

  // eslint-disable-next-line no-console
  console.log(`\n=== MatchHire QA report ===`);
  // eslint-disable-next-line no-console
  console.log(`  Passed:  ${report.playwright.passed}`);
  // eslint-disable-next-line no-console
  console.log(`  Failed:  ${report.playwright.failed}`);
  // eslint-disable-next-line no-console
  console.log(`  Skipped: ${report.playwright.skipped}`);
  if (report.lighthouse.length) {
    // eslint-disable-next-line no-console
    console.log(`  Lighthouse:`);
    for (const r of report.lighthouse) {
      // eslint-disable-next-line no-console
      console.log(
        `    ${r.route.padEnd(18)} perf=${r.scores.performance} a11y=${r.scores.accessibility} bp=${r.scores.best_practices} seo=${r.scores.seo}`
      );
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n  HTML report: qa/reports/qa-report.html\n`);
}

if (require.main === module) main();

module.exports = { main };
