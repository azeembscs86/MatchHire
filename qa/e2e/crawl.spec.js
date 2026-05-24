'use strict';

/**
 * E2E — shallow crawler.
 *
 * Visits a hand-picked set of top-level routes as a guest and
 * asserts:
 *   - HTTP 2xx (no broken pages)
 *   - A <h1> renders within 10s (no blank screens)
 *   - No JS console errors (filtered for the noisy 401-from-/me
 *     auto-hydrate that fires on every guest visit)
 *
 * Extending the crawl:
 *   Add to ROUTES, OR drive a real link-walker via
 *   `page.$$eval('a[href^="/"]', ...)` to discover routes
 *   dynamically. Dynamic discovery is more thorough but flakier
 *   (link order, modal anchors) — keep the curated list as the
 *   green-path safety net.
 */

const { test, expect } = require('@playwright/test');

// Curated set covers Home + the four discovery surfaces +
// onboarding / dashboard auth gates. Each is checked as a guest;
// gated pages are expected to redirect, which still satisfies
// the "no broken page" contract.
const ROUTES = [
  '/',
  '/jobs',
  '/companies',
  '/candidates',
  '/employer-onboarding',
  '/forgot-password',
];

for (const route of ROUTES) {
  test(`@smoke crawl ${route}`, async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      // Suppress noisy 401-from-/me and asset 404s in dev.
      if (/401|Unauthor|Failed to load resource|net::ERR_ABORTED/i.test(t)) return;
      consoleErrors.push(t);
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    const res = await page.goto(route);
    expect(res?.ok(), `non-2xx status for ${route}: ${res?.status()}`).toBe(true);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 10_000 });
    expect(consoleErrors, `${route} console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
}
