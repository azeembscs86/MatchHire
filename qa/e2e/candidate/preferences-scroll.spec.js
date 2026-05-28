'use strict';

/**
 * E2E — Preferences page scroll-tracking.
 *
 * The Preferences sidebar is supposed to highlight whichever
 * section the user is currently reading. A prior implementation
 * picked the wrong intersection winner and left stale tabs
 * highlighted after scrolling; this spec proves the new
 * anchor-line tracker actually flips the active tab in BOTH
 * directions (scroll down + scroll up), and that clicking a tab
 * still smooth-scrolls to the right section without flickering.
 *
 * We don't depend on real CSS smooth-scroll timing — we drive
 * scroll via `el.scrollIntoView({ block: 'start' })` then poll
 * the active-class assertion via Playwright's web-first waits.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@candidate Preferences scroll-tracking', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
    await page.goto('/preferences');
    // Wait for the form to mount — the tab list is rendered
    // inside the post-loading branch.
    await expect(page.getByTestId('pref-tab-priorities')).toBeVisible({ timeout: 15_000 });
  });

  test('first tab is active on initial load', async ({ page }) => {
    await expect(page.getByTestId('pref-tab-priorities')).toHaveClass(/active/);
  });

  /**
   * Scroll a section to the top of the viewport. We use
   * `block: 'start'` (not Playwright's `scrollIntoViewIfNeeded`,
   * which uses `block: 'nearest'`) so the section's top lands
   * ABOVE the page's 20%-from-top active anchor line — that's
   * the position a real user reading the section would be in.
   */
  async function scrollSectionToTop(page, sectionId) {
    await page.evaluate((id) => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, sectionId);
  }

  test('scrolling down highlights the section the user reaches', async ({ page }) => {
    await scrollSectionToTop(page, 'pref-comp');
    // Web-first wait — gives the rAF-throttled listener time to
    // recompute the active section.
    await expect(page.getByTestId('pref-tab-comp')).toHaveClass(/active/, { timeout: 4_000 });
    await expect(page.getByTestId('pref-tab-priorities')).not.toHaveClass(/active/);
  });

  test('scrolling back up highlights the earlier section', async ({ page }) => {
    // First go down to alerts (last section), then back up to
    // role (second). The active tab should follow both moves.
    await scrollSectionToTop(page, 'pref-alerts');
    await expect(page.getByTestId('pref-tab-alerts')).toHaveClass(/active/, { timeout: 4_000 });

    await scrollSectionToTop(page, 'pref-role');
    await expect(page.getByTestId('pref-tab-role')).toHaveClass(/active/, { timeout: 4_000 });
    await expect(page.getByTestId('pref-tab-alerts')).not.toHaveClass(/active/);
  });

  test('clicking a tab activates it and scrolls to the section', async ({ page }) => {
    await page.getByTestId('pref-tab-weights').click();
    // The click handler sets active immediately and locks the
    // scroll listener for ~700ms, so the active class must hold
    // even while the smooth-scroll animation is in flight.
    await expect(page.getByTestId('pref-tab-weights')).toHaveClass(/active/);
    // After the scroll settles, the section should be in the
    // viewport.
    await expect(page.locator('#pref-weights')).toBeInViewport({ timeout: 4_000 });
  });
});
