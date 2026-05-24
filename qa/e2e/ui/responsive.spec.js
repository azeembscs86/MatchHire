'use strict';

/**
 * E2E — responsive layout sanity at three viewport sizes.
 *
 * Renders / and /jobs at desktop / tablet / mobile widths and
 * asserts each viewport produces a sensible top-of-page state:
 *   - the h1 is visible
 *   - the document has no horizontal scroll past 16px (mild
 *     tolerance for native scrollbars on macOS / iOS)
 *
 * The horizontal-scroll check catches the most common
 * regression: a fixed-width element that overflows the mobile
 * viewport, breaking the "fits on one screen" contract.
 */

const { test, expect } = require('@playwright/test');
const { expectHeadingVisible } = require('../../helpers/navigation.helper');

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet',  width: 820,  height: 1180 },
  { label: 'mobile',  width: 390,  height: 844 },
];

const ROUTES = ['/', '/jobs'];

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`@smoke @ui ${vp.label} (${vp.width}×${vp.height}) renders ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await expectHeadingVisible(page, 15_000);

      // Horizontal-scroll check. Compare scrollWidth against the
      // viewport's clientWidth — anything >16px means content is
      // pushing the body past the viewport edge.
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `horizontal overflow at ${vp.label} on ${route}: ${overflow}px`).toBeLessThanOrEqual(16);
    });
  }
}
