'use strict';

/**
 * E2E — blank-page detector across the curated route list.
 *
 * Visits every public route a guest can reach and asserts:
 *   - the page is not "blank" (has an h1 and >30 chars of body text)
 *   - the page did not emit any unfiltered console errors
 *   - no 5xx fired during the page load
 *
 * Functions as a fast safety net against routing regressions
 * where a refactor accidentally renders `null` for a route.
 */

const { test, expect } = require('@playwright/test');
const ui = require('../../helpers/ui-validation.helper');
const consoleMonitor = require('../../helpers/console-monitor.helper');
const apiMonitor = require('../../helpers/api-monitor.helper');

const ROUTES = ['/', '/jobs', '/companies', '/candidates', '/employer-onboarding', '/forgot-password'];

for (const route of ROUTES) {
  test(`@smoke @ui blank-page guard ${route}`, async ({ page }) => {
    const consoleTracker = consoleMonitor.attach(page);
    const api = apiMonitor.attach(page);

    const res = await page.goto(route);
    expect(res?.ok(), `non-2xx for ${route}: ${res?.status()}`).toBe(true);

    await ui.assertNotBlank(page);

    const consoleErrors = consoleTracker.getErrors();
    expect(consoleErrors, `console errors on ${route}: ${consoleErrors.map((e) => e.text).join(' | ')}`).toHaveLength(0);

    const serverErrors = api.getServerErrors();
    expect(serverErrors, `5xx during ${route}: ${JSON.stringify(serverErrors)}`).toHaveLength(0);
  });
}
