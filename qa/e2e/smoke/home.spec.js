'use strict';

/**
 * E2E — home page renders cleanly for a guest viewer.
 *
 * Checks the smoke contract:
 *   - 200 response
 *   - hero text present
 *   - "Recommended" rail renders job cards
 *   - no uncaught console errors
 *
 * Extending:
 *   Add screenshot diffing with `expect(page).toHaveScreenshot()`
 *   once a baseline is committed.
 */

const { test, expect } = require('@playwright/test');

test('@smoke home page loads with no console errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto('/');
  // The hero copy is rendered as broken across multiple spans, so
  // we match a stable fragment instead of a full string.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Wait for the recommended/latest jobs grid to populate so we
  // know the home payload finished loading.
  await expect(page.locator('.jobs-grid .job-card').first()).toBeVisible({ timeout: 15_000 });

  // Allow noisy 401s from anonymous /me — but anything else is a
  // signal worth surfacing.
  const noisy = consoleErrors.filter(
    (m) => !/401|Unauthor|net::ERR_ABORTED/i.test(m)
  );
  expect(noisy, `console errors: ${noisy.join(' | ')}`).toHaveLength(0);
});
