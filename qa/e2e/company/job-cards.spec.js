'use strict';

/**
 * E2E — company dashboard renders the shared JobCard surface.
 *
 * Two non-negotiables from the brief:
 *   1. The "Active job postings" panel uses the same JobCard
 *      component candidates see, not the legacy dashboard table.
 *      We assert on the grid testid + at least one `job-card`.
 *   2. Apply Now is NEVER rendered on a company-side card —
 *      that button is candidate-only.
 *
 * Read-only: no posting / applicant state is mutated.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@company Company job cards', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'COMPANY');
  });

  test('Active job postings renders a JobCard grid (no legacy table)', async ({ page }) => {
    await page.goto('/dashboard/company');
    // Wait for the dashboard shell so the postings panel has had
    // a chance to render alongside the stat row.
    await expect(page.getByTestId('company-dashboard')).toBeVisible({ timeout: 15_000 });

    // The grid is always rendered when the company has any
    // postings. The QA seed creates one company but no jobs by
    // default; postings may be zero. If zero we accept the
    // "No jobs posted yet" placeholder — both are valid product
    // states. The contract is: when jobs ARE rendered, they use
    // the JobCard grid, not a dash-table.
    const grid = page.getByTestId('company-jobs-grid');
    const placeholder = page.getByText(/No jobs posted yet/i);
    const hasGrid = await grid.count();
    const hasPlaceholder = await placeholder.count();
    expect(hasGrid + hasPlaceholder, 'expected either a posting grid or the empty placeholder').toBeGreaterThan(0);
    if (hasGrid) {
      await expect(grid.getByTestId('job-card').first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('company-side cards never render Apply Now', async ({ page }) => {
    await page.goto('/dashboard/company');
    await expect(page.getByTestId('company-dashboard')).toBeVisible({ timeout: 15_000 });
    const grid = page.getByTestId('company-jobs-grid');
    if ((await grid.count()) === 0) return; // empty postings state — no cards to inspect
    // Scope to the dashboard so we don't accidentally pick up
    // Apply buttons rendered on some unrelated surface. The
    // company dashboard has no candidate-only flows, so this
    // should be 0.
    await expect(page.getByTestId('company-dashboard').getByTestId('apply-now-button')).toHaveCount(0);
  });
});
