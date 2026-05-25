'use strict';

/**
 * E2E — responsive layout sanity across the breakpoints the QA
 * brief explicitly calls out (320 / 375 / 414 / 768 / 1024 / 1440).
 *
 * For every viewport × route combination we assert:
 *   - The h1 renders within 15s (page actually mounted).
 *   - documentElement.scrollWidth never exceeds clientWidth by
 *     more than 16px (16px tolerance covers native scrollbar
 *     gutters on macOS / iOS).
 *
 * Pages chosen to exercise the parts of the SPA most prone to
 * mobile regressions: hero (Home), card grid (Jobs), card grid
 * with filters (Companies, Candidates), and forms (Forgot
 * password).
 */

const { test, expect } = require('@playwright/test');
const { expectHeadingVisible } = require('../../helpers/navigation.helper');

const VIEWPORTS = [
  { label: '320',  width: 320,  height: 700 },
  { label: '375',  width: 375,  height: 812 },
  { label: '414',  width: 414,  height: 896 },
  { label: '768',  width: 768,  height: 1024 },
  { label: '1024', width: 1024, height: 768 },
  { label: '1440', width: 1440, height: 900 },
];

const ROUTES = ['/', '/jobs', '/companies', '/candidates', '/forgot-password'];

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`@smoke @ui ${vp.label}px renders ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await expectHeadingVisible(page, 15_000);

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `horizontal overflow at ${vp.label}px on ${route}: ${overflow}px`).toBeLessThanOrEqual(16);
    });
  }
}
