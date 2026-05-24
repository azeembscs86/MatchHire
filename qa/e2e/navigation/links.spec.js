'use strict';

/**
 * E2E — internal link integrity walker.
 *
 * From the homepage, discover every internal anchor in the DOM,
 * de-dupe, and visit each one as a guest. Asserts on each visit:
 *   - HTTP response is 2xx (no broken page)
 *   - An h1 renders inside 10s (no blank screen)
 *   - No JS console errors after the noise filter
 *
 * Walks ONE level deep — the goal is to catch broken router
 * entries, not exhaustively crawl the SPA. Slow link sets
 * (gated dashboards, dynamic IDs) are filtered out so the test
 * stays fast and stable.
 */

const { test, expect } = require('@playwright/test');
const {
  discoverInternalLinks,
  trackConsoleErrors,
  expectHeadingVisible,
} = require('../../helpers/navigation.helper');

// Skip routes that legitimately can't be visited as a guest or
// that produce dynamic IDs that we don't want to follow blindly.
const SKIP_PATTERNS = [
  /^\/dashboard\//i,      // ProtectedRoute redirect — noise as a guest
  /^\/profile($|\/)/i,    // candidate-only
  /^\/favorites$/i,       // candidate-only
  /^\/saved-jobs$/i,      // candidate-only
  /^\/onboarding$/i,      // candidate-only
  /^\/preferences$/i,     // candidate-only
  /^\/reset-password\//i, // requires a live token
  /^\/verify-email\//i,   // requires a live token
];

test.describe('@smoke Internal link integrity', () => {
  test('every link from / loads without errors', async ({ page }) => {
    await page.goto('/');
    const discovered = await discoverInternalLinks(page);

    const targets = discovered
      .filter((href) => !SKIP_PATTERNS.some((rx) => rx.test(href)));

    expect(targets.length, 'expected to discover at least one internal link from /').toBeGreaterThan(0);

    for (const route of targets) {
      const tracker = trackConsoleErrors(page);
      const res = await page.goto(route);
      expect(res?.ok(), `non-2xx for ${route}: ${res?.status()}`).toBe(true);
      await expectHeadingVisible(page, 10_000);
      const errs = tracker.getErrors();
      expect(errs, `console errors on ${route}: ${errs.join(' | ')}`).toHaveLength(0);
    }
  });
});
