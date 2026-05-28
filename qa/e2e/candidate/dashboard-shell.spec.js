'use strict';

/**
 * E2E — candidate dashboard sidebar stays anchored across the
 * dashboard tabs, and the standalone pages (Profile,
 * Preferences) render WITHOUT the dashboard sidebar.
 *
 * The product split (May 2027): Profile and Preferences are
 * standalone pages reached from the top header / inline CTAs.
 * They render under the global Layout only — no dashboard
 * sidebar. The dashboard sidebar covers the day-to-day workflow
 * (Overview, Job Applications, Saved Jobs, Favourites,
 * Messages, Notifications, Settings, Logout) and stays
 * anchored across every one of those tabs.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

/** Routes that MUST render inside the candidate dashboard shell. */
const SHELL_ROUTES = [
  '/dashboard/candidate',
  '/dashboard/candidate/applications',
  '/dashboard/candidate/messages',
  '/dashboard/candidate/notifications',
  '/dashboard/candidate/settings',
  '/favorites',
  '/saved-jobs',
];

/** Routes that MUST NOT render the dashboard sidebar. */
const STANDALONE_ROUTES = [
  '/preferences',
];

test.describe('@candidate Candidate dashboard shell', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  for (const route of SHELL_ROUTES) {
    test(`sidebar + shell remain mounted on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('candidate-dashboard-shell')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('candidate-dash-sidebar')).toBeVisible();
    });
  }

  for (const route of STANDALONE_ROUTES) {
    test(`${route} renders WITHOUT the dashboard sidebar`, async ({ page }) => {
      await page.goto(route);
      // The page must mount (h1 visible) but the dashboard
      // shell and sidebar testids must NOT appear — they belong
      // only to dashboard tabs now.
      await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('candidate-dash-sidebar')).toHaveCount(0);
      await expect(page.getByTestId('candidate-dashboard-shell')).toHaveCount(0);
    });
  }
});
