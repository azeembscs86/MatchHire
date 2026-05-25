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

/**
 * Walk the Playwright JSON report and collapse it into a single
 * tally + a list of failure objects + a list of "finding"
 * attachments produced by qa/helpers/report.helper.js#attachFindings.
 * Findings carry console errors, API failures, and UI issues; the
 * report renders them per-test with a priority badge so reviewers
 * can scan the most important issues first.
 */
function summarisePlaywright(pw) {
  if (!pw) return { passed: 0, failed: 0, skipped: 0, failures: [], findings: [] };
  let passed = 0, failed = 0, skipped = 0;
  const failures = [];
  const findings = [];

  function priorityFor(finding) {
    if (!finding || typeof finding !== 'object') return 'low';
    if (finding.source === 'pageerror') return 'critical';
    if (typeof finding.status === 'number' && finding.status >= 500) return 'critical';
    if (/hydration|invariant violation/i.test(finding.text || '')) return 'critical';
    if (finding.source === 'console') return 'high';
    if (typeof finding.status === 'number' && finding.status >= 400) return 'high';
    if (finding.kind === 'overlap' || finding.kind === 'overflow' || finding.kind === 'uneven-heights') return 'medium';
    return 'low';
  }

  function readFindings(attachments, specTitle) {
    if (!Array.isArray(attachments)) return;
    for (const att of attachments) {
      if (att?.name !== 'qa-findings.json') continue;
      try {
        const body = att.body
          ? JSON.parse(Buffer.from(att.body, 'base64').toString('utf-8'))
          : att.path
            ? JSON.parse(fs.readFileSync(att.path, 'utf-8'))
            : null;
        if (!body) continue;
        const consoleErrors = (body.consoleErrors || []).map((e) => ({ ...e, priority: priorityFor(e) }));
        const apiFailures = (body.apiFailures || []).map((f) => ({ ...f, priority: priorityFor(f) }));
        const uiIssues = (body.uiIssues || []).map((u) => ({ ...u, priority: priorityFor(u) }));
        findings.push({
          test: specTitle,
          consoleErrors,
          apiFailures,
          uiIssues,
          suggestedFixes: body.suggestedFixes || [],
        });
      } catch { /* skip malformed attachments */ }
    }
  }

  function walk(suites = []) {
    for (const s of suites) {
      for (const spec of s.specs || []) {
        for (const t of spec.tests || []) {
          for (const r of t.results || []) {
            if (r.status === 'passed') passed += 1;
            else if (r.status === 'skipped') skipped += 1;
            else { failed += 1; failures.push({ title: spec.title, status: r.status, error: r.error?.message?.split('\n')[0] || '' }); }
            readFindings(r.attachments, spec.title);
          }
        }
      }
      if (s.suites) walk(s.suites);
    }
  }
  walk(pw.suites || []);
  return { passed, failed, skipped, failures, findings };
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

  // Findings — flatten per-test attachments into a single
  // priority-ordered list so reviewers see critical issues first.
  // Priority order: critical → high → medium → low.
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const allFindings = [];
  for (const f of (playwright.findings || [])) {
    for (const e of f.consoleErrors) allFindings.push({ test: f.test, kind: 'console', detail: e.text, priority: e.priority });
    for (const a of f.apiFailures) allFindings.push({ test: f.test, kind: 'api', detail: `${a.method} ${a.url} → ${a.status}`, priority: a.priority });
    for (const u of f.uiIssues) allFindings.push({ test: f.test, kind: u.kind, detail: u.detail || '', priority: u.priority });
  }
  allFindings.sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));
  const findingsRows = allFindings.length === 0
    ? '<tr><td colspan="4">No findings recorded. Every test ran cleanly.</td></tr>'
    : allFindings.map((f) => `
      <tr>
        <td><span class="prio prio-${f.priority}">${f.priority}</span></td>
        <td>${escapeHtml(f.kind)}</td>
        <td>${escapeHtml(f.test)}</td>
        <td><code>${escapeHtml(f.detail || '')}</code></td>
      </tr>`).join('');

  const suggestionRows = (playwright.findings || [])
    .flatMap((f) => f.suggestedFixes.map((s) => ({ test: f.test, fix: s })));
  const suggestionsHtml = suggestionRows.length === 0
    ? '<p style="color:#6B6258;font-size:13px;">No suggestions emitted. Add `suggestedFixes` to a finding via report.helper.js to populate this list.</p>'
    : `<ul>${suggestionRows.map((s) => `<li><strong>${escapeHtml(s.test)}:</strong> ${escapeHtml(s.fix)}</li>`).join('')}</ul>`;

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
    code { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; }
    .prio { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
    .prio-critical { background: #fde9e3; color: #C73E1D; }
    .prio-high     { background: #fff1d6; color: #8a5b00; }
    .prio-medium   { background: #e7f0ff; color: #1f4793; }
    .prio-low      { background: #eef0eb; color: #3F6B4F; }
    ul { margin: 0 0 24px; padding-left: 20px; font-size: 13px; }
    ul li { margin-bottom: 6px; }
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

  <h2>Findings (priority-ordered)</h2>
  <table>
    <thead><tr><th>Priority</th><th>Kind</th><th>Test</th><th>Detail</th></tr></thead>
    <tbody>${findingsRows}</tbody>
  </table>

  <h2>Suggested fixes</h2>
  ${suggestionsHtml}

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
