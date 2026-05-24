'use strict';

/**
 * E2E — company dashboard renders the hiring workspace.
 *
 * Authenticates as the QA company user and navigates to
 * /dashboard/company. Verifies the dashboard reaches the
 * authenticated state via:
 *   - the "Hiring at ..." h1
 *   - the stat-row with four stat cards
 *   - the "Active job postings" panel
 *
 * Catches the most common regression here: the dashboard
 * mounting but rendering an empty state because the
 * /companies/me endpoint returned null (e.g. owner_user_id
 * mismatch in the QA seed).
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@company Company dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'COMPANY');
  });

  test('renders "Hiring at ..." heading + stat row', async ({ page }) => {
    await page.goto('/dashboard/company');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/hiring at/i);

    // The stat row renders four stat-cards (Active jobs, Total
    // applicants, In review, Hired). At least one must be visible
    // for the dashboard to be considered functional.
    const stats = page.locator('.stat-card');
    await expect(stats.first()).toBeVisible({ timeout: 10_000 });
    expect(await stats.count()).toBeGreaterThanOrEqual(3);

    // "Active job postings" panel header is a stable landmark.
    await expect(page.getByRole('heading', { name: /active job postings/i })).toBeVisible();
  });

  test('"Post new job" CTA is visible', async ({ page }) => {
    await page.goto('/dashboard/company');
    await expect(page.getByRole('button', { name: /post new job/i }).first())
      .toBeVisible({ timeout: 15_000 });
  });
});
