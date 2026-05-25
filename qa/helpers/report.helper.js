'use strict';

/**
 * Report helper — attach structured findings to Playwright's
 * TestInfo so the HTML report carries the human-readable details
 * the QA brief asks for (failed URLs, console errors, API
 * errors, UI/UX issues, suggested fixes).
 *
 * Usage:
 *   const { attachFindings, priorityFor } = require('../../helpers/report.helper');
 *   await attachFindings(testInfo, {
 *     consoleErrors: tracker.getErrors(),
 *     apiFailures: api.getFailures(),
 *     uiIssues: [{ kind: 'overlap', detail: '...' }],
 *     suggestedFixes: ['Cap title to 2 lines via CSS line-clamp.'],
 *   });
 *
 * The findings are attached as a JSON blob (machine-readable) and
 * a markdown summary (human-readable). `qa/scripts/report.js`
 * picks them up and folds them into the consolidated dashboard.
 */

/**
 * Assign a priority bucket to a finding based on its shape.
 *   critical — pageerror, 5xx, hydration error
 *   high     — 4xx (except 404 of static), uncaught console error
 *   medium   — UI overlap / unequal heights / horizontal overflow
 *   low      — accessibility advisory, image alt missing
 */
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

function summarise(findings) {
  const lines = [];
  const { consoleErrors = [], apiFailures = [], uiIssues = [], suggestedFixes = [] } = findings || {};
  if (consoleErrors.length) {
    lines.push(`### Console errors (${consoleErrors.length})`);
    for (const e of consoleErrors.slice(0, 10)) {
      lines.push(`- [${priorityFor(e)}] ${e.text || JSON.stringify(e)}`);
    }
    if (consoleErrors.length > 10) lines.push(`- …and ${consoleErrors.length - 10} more`);
  }
  if (apiFailures.length) {
    lines.push(`\n### API failures (${apiFailures.length})`);
    for (const f of apiFailures.slice(0, 10)) {
      lines.push(`- [${priorityFor(f)}] ${f.method} ${f.url} → ${f.status}`);
    }
    if (apiFailures.length > 10) lines.push(`- …and ${apiFailures.length - 10} more`);
  }
  if (uiIssues.length) {
    lines.push(`\n### UI / UX issues (${uiIssues.length})`);
    for (const u of uiIssues) {
      lines.push(`- [${priorityFor(u)}] ${u.kind}: ${u.detail || ''}`);
    }
  }
  if (suggestedFixes.length) {
    lines.push(`\n### Suggested fixes`);
    for (const s of suggestedFixes) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

/**
 * Attach `findings` to a TestInfo as both JSON + markdown. Safe
 * to call even when `findings` has no content — we no-op rather
 * than attaching empty blobs.
 */
async function attachFindings(testInfo, findings) {
  if (!testInfo || !findings) return;
  const hasAny =
    (findings.consoleErrors?.length || 0) +
    (findings.apiFailures?.length || 0) +
    (findings.uiIssues?.length || 0) +
    (findings.suggestedFixes?.length || 0) > 0;
  if (!hasAny) return;
  try {
    await testInfo.attach('qa-findings.json', {
      body: Buffer.from(JSON.stringify(findings, null, 2)),
      contentType: 'application/json',
    });
    await testInfo.attach('qa-findings.md', {
      body: Buffer.from(summarise(findings)),
      contentType: 'text/markdown',
    });
  } catch (_e) { /* noop — attach failure shouldn't fail the test */ }
}

module.exports = {
  priorityFor,
  summarise,
  attachFindings,
};
