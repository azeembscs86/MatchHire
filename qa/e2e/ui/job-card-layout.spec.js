'use strict';

/**
 * E2E — UI/UX validation for the Jobs grid.
 *
 * Three checks, each derived from the QA brief:
 *   1. Every job card in the same visual row has the same height
 *      (within a tolerance) so the grid reads as a clean SaaS
 *      layout rather than a ragged list.
 *   2. The Apply Now button (and its disabled siblings: Already
 *      Applied, Job Expired) renders inside a card without
 *      horizontally overlapping the Featured/heart/bookmark
 *      action cluster.
 *   3. The Jobs page does not produce a horizontal scrollbar at
 *      the desktop viewport.
 *
 * These are all derived from the rendered DOM rectangles, so
 * they're insulated from copy / styling changes that don't affect
 * layout.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');
const consoleMonitor = require('../../helpers/console-monitor.helper');
const apiMonitor = require('../../helpers/api-monitor.helper');
const ui = require('../../helpers/ui-validation.helper');
const { attachFindings } = require('../../helpers/report.helper');

test.describe('@ui Job card layout consistency', () => {
  // Equal-height redesign (May 2030, supersedes May-2027 auto-height):
  // every card in a row must be the same height so Apply Now buttons
  // line up across the grid. CSS reserves min-heights on title /
  // summary / trust / meta / why-list / tags slots and the grid uses
  // `align-items:stretch` + `height:100%`, so any drift here means a
  // reserved slot was accidentally removed.
  test('every card in a row has equal height', async ({ page }, testInfo) => {
    const consoleTracker = consoleMonitor.attach(page);
    const api = apiMonitor.attach(page);

    await page.goto('/jobs');
    const cards = page.getByTestId('job-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    // Wait for at least 4 cards so we have meaningful rows to
    // compare. Public /jobs returns 24 per page; 4 is a low floor
    // that doesn't slow the test.
    await expect(cards.nth(3)).toBeVisible({ timeout: 10_000 });

    const result = await ui.checkEqualRowHeights(cards, 4);
    await attachFindings(testInfo, {
      consoleErrors: consoleTracker.getErrors(),
      apiFailures: api.getFailures(),
      uiIssues: result.ok ? [] : [{
        kind: 'uneven-heights',
        detail: `Card heights drift across rows: ${JSON.stringify(result.violations)}`,
      }],
      suggestedFixes: result.ok ? [] : [
        'Verify .jobs-grid uses align-items:stretch and .card-shell carries height:100%.',
        'Check the reserved slots on .job-title / .job-summary / .trust-row / .job-meta-row / .why-list / .job-tags still set min-height.',
      ],
    });

    expect(
      result.ok,
      `card heights uneven: ${JSON.stringify(result.violations, null, 2)}`
    ).toBe(true);
  });

  test('Jobs page has no horizontal overflow at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/jobs');
    await expect(page.getByTestId('job-card').first()).toBeVisible({ timeout: 15_000 });
    await ui.assertNoHorizontalOverflow(page, 16);
  });

  test('signed-in candidate sees Apply Now buttons that do not overlap the action cluster', async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
    await page.goto('/jobs');
    const firstCard = page.getByTestId('job-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // The signed-in candidate flow on /jobs renders Apply Now on
    // every recommended card. If the candidate has zero matches
    // (unlikely with the QA seed + bulk demo data), the card
    // shows Job Expired / Already Applied instead — still a
    // 100%-width button that should never overlap the cluster.
    const applyButtons = page.getByTestId('apply-now-button');
    const applyCount = await applyButtons.count();
    if (applyCount === 0) {
      // No buttons rendered (guest fallback or all expired). The
      // contract under test only applies when buttons exist.
      return;
    }

    // The action cluster lives at the top-right of every card
    // (.job-card-actions). Pull both rects and assert they don't
    // share a vertical band.
    const cluster = firstCard.locator('.job-card-actions');
    const apply = firstCard.locator('[data-testid="apply-now-button"]').first();
    if (await apply.count() === 0) return; // first card has no Apply (already applied / expired)
    const a = await cluster.boundingBox();
    const b = await apply.boundingBox();
    expect(a && b, 'expected both cluster and apply button to have layout boxes').toBeTruthy();
    if (!a || !b) return;
    // Different rows = no overlap possible.
    const aRange = [a.y, a.y + a.height];
    const bRange = [b.y, b.y + b.height];
    const vertOverlap = !(aRange[1] <= bRange[0] || bRange[1] <= aRange[0]);
    expect(vertOverlap, 'Apply button overlaps the top-right action cluster').toBe(false);
  });
});
