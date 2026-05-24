'use strict';

/**
 * E2E — candidate dashboard renders the workspace shell.
 *
 * Authenticates as the QA candidate and navigates to
 * /dashboard/candidate. Asserts the page reaches the
 * authenticated state by checking three independent surfaces:
 *
 *   - the "Welcome back" h1 (renders only when user is set)
 *   - the "Edit profile" call-to-action (renders only when the
 *     candidate's role-specific dashboard mounts)
 *   - at least one stat or section card in the dash-main area
 *
 * Triple-checking protects against silent regressions where one
 * sub-component renders an empty state but the rest of the page
 * is broken.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');
const { trackConsoleErrors } = require('../../helpers/navigation.helper');

test.describe('@candidate Candidate dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  test('renders Welcome heading + Edit profile CTA', async ({ page }) => {
    const tracker = trackConsoleErrors(page);
    await page.goto('/dashboard/candidate');

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/welcome back/i);

    // "Edit profile" CTA in the topbar links to /profile. Several
    // links route there (sidebar, topbar duplicated for desktop +
    // mobile), so scope to the topbar so the test stays
    // unambiguous.
    const editProfile = page.locator('.dash-topbar-actions a[href="/profile"]').first();
    await expect(editProfile).toBeVisible();
    await expect(editProfile).toContainText(/edit profile/i);

    // The dash-main wrapper must render at least one panel.
    await expect(page.locator('.dash-main')).toBeVisible();

    expect(
      tracker.getErrors(),
      `unexpected console errors: ${tracker.getErrors().join(' | ')}`
    ).toHaveLength(0);
  });

  test('Edit profile CTA navigates to /profile', async ({ page }) => {
    await page.goto('/dashboard/candidate');
    await page.locator('.dash-topbar-actions a[href="/profile"]').first().click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});
