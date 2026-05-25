'use strict';

/**
 * E2E — mobile navigation drawer contract.
 *
 * At ≤900px the inline header collapses behind a hamburger
 * toggle. The drawer it opens must:
 *   1. Surface every primary nav link.
 *   2. Close on link click (so navigation actually completes).
 *   3. Surface the role-aware actions (Sign in/Join free for
 *      guests; Sign out for an authenticated candidate).
 *   4. Not produce a horizontal scrollbar at 390px.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

const MOBILE = { width: 390, height: 844 };

test.describe('@ui Mobile navigation drawer', () => {
  test('hamburger toggle is visible at mobile width and inline nav is hidden', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await expect(page.getByTestId('mobile-nav-toggle')).toBeVisible({ timeout: 15_000 });
    // Inline desktop nav-menu hides past 900px.
    await expect(page.locator('.nav-desktop')).toBeHidden();
  });

  test('drawer opens and exposes every primary link', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.getByTestId('mobile-nav-toggle').click();
    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer).toBeVisible();

    // Primary nav must be present. We assert by exact text rather
    // than role+name because NavLink renders both a desktop and
    // a drawer version once the toggle is open — the drawer
    // locator scopes the search.
    for (const label of ['Home', 'Jobs', 'Companies', 'Candidates']) {
      await expect(drawer.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('clicking a drawer link navigates and dismisses the drawer', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.getByTestId('mobile-nav-toggle').click();
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByRole('link', { name: 'Jobs' }).click();
    await expect(page).toHaveURL(/\/jobs/);
    // After navigation the drawer state resets — the toggle
    // should be reachable again with no overlay covering the page.
    await expect(page.locator('.mobile-drawer-overlay.is-open')).toHaveCount(0);
  });

  test('guest drawer shows Sign in + Join free', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.getByTestId('mobile-nav-toggle').click();
    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /join free/i })).toBeVisible();
  });

  test('authenticated candidate drawer shows Sign out + dashboard shortcut', async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.getByTestId('mobile-nav-toggle').click();
    const drawer = page.getByTestId('mobile-drawer');
    await expect(drawer.getByRole('button', { name: /sign out/i })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /candidate hub/i })).toBeVisible();
  });
});
