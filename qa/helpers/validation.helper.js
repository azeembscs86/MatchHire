'use strict';

/**
 * Validation helper — common assertions about the DOM that get
 * re-implemented in every UI test if they aren't centralised
 * here. Each helper takes a Playwright `Page` or `Locator` and
 * either returns a structured result or throws a clear
 * `expect`-style error.
 */

const { expect } = require('@playwright/test');

/**
 * Assert that every locator in the set is visible. Fails with a
 * specific index so the trace shows which item missed.
 */
async function expectAllVisible(locator, label = 'item') {
  const count = await locator.count();
  expect(count, `expected at least one ${label}, found 0`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(locator.nth(i), `${label} #${i} not visible`).toBeVisible();
  }
}

/**
 * Walk a set of cards and verify each has the same outer height
 * within a small tolerance — protects against the "first card is
 * 320px tall, the rest are 280px" layout drift bug.
 */
async function expectConsistentCardHeights(locator, tolerancePx = 8) {
  const count = await locator.count();
  if (count < 2) return; // nothing to compare
  const heights = [];
  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox();
    if (box) heights.push(box.height);
  }
  if (!heights.length) return;
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  expect(
    max - min,
    `card heights vary by ${max - min}px (min=${min}, max=${max}); tolerance=${tolerancePx}`
  ).toBeLessThanOrEqual(tolerancePx);
}

/**
 * Assert that no two locators in a set overlap horizontally
 * within the same row. Catches the "Apply Now overlaps Featured
 * badge" class of layout bug.
 */
async function expectNoHorizontalOverlap(locators) {
  const boxes = [];
  for (const l of locators) {
    const box = await l.boundingBox();
    if (box) boxes.push(box);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // Same-row test: vertical centres within 8px of each other.
      const sameRow = Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 8;
      if (!sameRow) continue;
      const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x);
      expect(overlap, `elements #${i} and #${j} overlap horizontally`).toBe(false);
    }
  }
}

/**
 * Returns true if the page rendered any text matching the given
 * pattern. Cheap alternative to `expect(page.getByText(...))`
 * when the caller wants a boolean rather than a hard assertion.
 */
async function pageHasText(page, pattern) {
  const text = await page.locator('body').innerText().catch(() => '');
  return new RegExp(pattern, 'i').test(text);
}

module.exports = {
  expectAllVisible,
  expectConsistentCardHeights,
  expectNoHorizontalOverlap,
  pageHasText,
};
