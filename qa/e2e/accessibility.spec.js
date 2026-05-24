'use strict';

/**
 * E2E — accessibility smoke (axe-core via @axe-core/playwright).
 *
 * Tagged `@a11y` so `npm run qa:accessibility` runs only this
 * file. Each route audited; violations of WCAG 2A + 2AA serious /
 * critical impact are treated as failures. Less-severe violations
 * (minor / moderate) are logged but don't fail the test — they're
 * meant as a backlog signal, not a release gate.
 *
 * Extending:
 *   - Add component-level tests by scoping `analyze()` to a
 *     selector (e.g. `.jobs-grid`).
 *   - Bump the impact threshold once the backlog of serious
 *     violations is cleared.
 */

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AUDIT_ROUTES = ['/', '/jobs', '/companies', '/candidates'];

for (const route of AUDIT_ROUTES) {
  test(`@a11y axe scan ${route}`, async ({ page }) => {
    await page.goto(route);
    // Wait for the page to settle so dynamic content (job cards,
    // hero imagery) is in the DOM before scanning.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    const advisory = results.violations.filter(
      (v) => v.impact !== 'serious' && v.impact !== 'critical'
    );

    if (advisory.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[a11y] ${route} — ${advisory.length} minor/moderate findings (not blocking):\n` +
        advisory.slice(0, 5).map((v) => `  • ${v.id}: ${v.help}`).join('\n')
      );
    }

    expect(
      blocking,
      `serious/critical a11y violations on ${route}:\n` +
        blocking.map((v) => `  • ${v.id}: ${v.help} → ${v.helpUrl}`).join('\n')
    ).toEqual([]);
  });
}
