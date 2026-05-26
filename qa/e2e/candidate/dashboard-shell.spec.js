'use strict';

/**
 * E2E — candidate dashboard sidebar stays anchored across tabs.
 *
 * The brief: clicking dashboard tabs like Favourites or
 * Preferences must NOT replace the layout with a standalone
 * page; the sidebar must remain visible on every dashboard tab.
 *
 * We test three URLs that are now wrapped in
 * CandidateDashboardLayout (/favorites, /saved-jobs,
 * /preferences) plus the overview (/dashboard/candidate). Each
 * must expose the same `candidate-dashboard-shell` testid +
 * the same `candidate-dash-sidebar` testid so a future
 * regression that drops the wrapper is caught immediately.
 *
 * The Profile page deliberately renders inside the shell too,
 * but the QA candidate's profile route has heavier data
 * dependencies (avatar pipeline, completion fetch) than we
 * want to take on inside a layout smoke — Favourites / Saved /
 * Preferences are lighter and exercise the contract just as
 * well.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

const TAB_ROUTES = [
  '/dashboard/candidate',
  '/favorites',
  '/saved-jobs',
  '/preferences',
];

test.describe('@candidate Candidate dashboard shell', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  for (const route of TAB_ROUTES) {
    test(`sidebar + shell remain mounted on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('candidate-dashboard-shell')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('candidate-dash-sidebar')).toBeVisible();
    });
  }
});
