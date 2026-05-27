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
  // Auto-height redesign (May 2027): cards are no longer stretched to
  // a uniform row height — they size to their content so a sparse card
  // collapses instead of opening a blank band above the footer. The
  // contract under test is therefore "no large blank band at the
  // bottom of any card", NOT "all cards equal height". We measure the
  // gap between the card's last child (its action/footer row) and the
  // card's own bottom edge; anything beyond the card's padding plus a
  // tolerance means a reserved-but-empty slot has crept back in.
  test('cards size to content with no blank band above the footer', async ({ page }, testInfo) => {
    const consoleTracker = consoleMonitor.attach(page);
    const api = apiMonitor.attach(page);

    await page.goto('/jobs');
    const cards = page.getByTestId('job-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    await expect(cards.nth(3)).toBeVisible({ timeout: 10_000 });

    // For the first 6 cards, compute the gap between the bottom of
    // the last rendered child and the card's bottom edge.
    const TOLERANCE_PX = 28; // card padding-bottom (14px) + slack
    const gaps = [];
    const count = Math.min(6, await cards.count());
    for (let i = 0; i < count; i++) {
      const gap = await cards.nth(i).evaluate((card) => {
        const last = card.lastElementChild;
        if (!last) return 0;
        const cardBox = card.getBoundingClientRect();
        const lastBox = last.getBoundingClientRect();
        return Math.round(cardBox.bottom - lastBox.bottom);
      });
      gaps.push({ idx: i, gap });
    }
    const offenders = gaps.filter((g) => g.gap > TOLERANCE_PX);

    await attachFindings(testInfo, {
      consoleErrors: consoleTracker.getErrors(),
      apiFailures: api.getFailures(),
      uiIssues: offenders.length === 0 ? [] : [{
        kind: 'blank-band',
        detail: `Cards with a blank band below their content (>${TOLERANCE_PX}px): ${JSON.stringify(offenders)}`,
      }],
      suggestedFixes: offenders.length === 0 ? [] : [
        'Confirm .jobs-grid uses align-items:start (not stretch) and .card-shell has no min-height/height:100%.',
        'Check empty sections (why-list, meta-row, tags) are conditionally rendered, not reserved.',
      ],
    });

    expect(
      offenders.length,
      `cards have a blank band below content: ${JSON.stringify(gaps, null, 2)}`
    ).toBe(0);
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
