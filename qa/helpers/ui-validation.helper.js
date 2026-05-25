'use strict';

/**
 * UI / UX automated validation helpers.
 *
 * Functions return either a boolean / structured result OR throw
 * an `expect`-style assertion when called via the `assert*`
 * wrappers. Tests pick the form they prefer.
 *
 * Catches the regressions the user-facing brief flagged:
 *   - uneven card heights inside a row
 *   - horizontally-overlapping elements inside the same row
 *   - horizontal scroll past a small tolerance
 *   - cards rendering 0px tall (blank-page proxy)
 *   - missing alt text on imagery
 */

const { expect } = require('@playwright/test');

/**
 * Read the bounding box of every locator in the set. Skips items
 * with no box (off-screen / display:none) so downstream callers
 * don't trip on nulls.
 */
async function boundingBoxes(locator) {
  const count = await locator.count();
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox();
    if (box) boxes.push({ idx: i, ...box });
  }
  return boxes;
}

/**
 * Group bounding boxes by row using their vertical centre.
 * Boxes whose centres are within `tolerancePx` of each other are
 * treated as siblings of the same visual row.
 */
function groupByRow(boxes, tolerancePx = 16) {
  const rows = [];
  for (const b of boxes) {
    const centerY = b.y + b.height / 2;
    let placed = false;
    for (const row of rows) {
      if (Math.abs(row.centerY - centerY) <= tolerancePx) {
        row.items.push(b);
        // Drift the row's centre toward the mean to stay stable.
        row.centerY = (row.centerY * (row.items.length - 1) + centerY) / row.items.length;
        placed = true;
        break;
      }
    }
    if (!placed) rows.push({ centerY, items: [b] });
  }
  return rows;
}

/**
 * Check that every card in the SAME row has the same outer
 * height within `tolerancePx`. Cards in different rows are
 * compared independently — a wider viewport may pack 3 per row,
 * a narrower one 2.
 */
async function checkEqualRowHeights(locator, tolerancePx = 4) {
  const boxes = await boundingBoxes(locator);
  if (boxes.length < 2) return { ok: true, rows: [] };
  const rows = groupByRow(boxes);
  const violations = [];
  for (const row of rows) {
    if (row.items.length < 2) continue;
    const heights = row.items.map((i) => i.height);
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    if (max - min > tolerancePx) {
      violations.push({
        rowCenterY: row.centerY,
        minHeight: min,
        maxHeight: max,
        delta: max - min,
        sampleIndices: row.items.map((i) => i.idx),
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Assert every card in every row has consistent height (within tolerance).
 */
async function assertEqualRowHeights(locator, tolerancePx = 4) {
  const result = await checkEqualRowHeights(locator, tolerancePx);
  expect(
    result.ok,
    `card heights uneven within rows (tolerance ${tolerancePx}px): ` +
      JSON.stringify(result.violations, null, 2)
  ).toBe(true);
}

/**
 * Detect horizontal page overflow. The browser's viewport defines
 * `documentElement.clientWidth`; any difference vs `scrollWidth`
 * past `tolerancePx` indicates content that pushed the layout
 * beyond the viewport edge (the classic mobile-layout regression).
 */
async function hasHorizontalOverflow(page, tolerancePx = 16) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  return { overflow, exceeded: overflow > tolerancePx };
}

async function assertNoHorizontalOverflow(page, tolerancePx = 16) {
  const { overflow, exceeded } = await hasHorizontalOverflow(page, tolerancePx);
  expect(exceeded, `horizontal overflow: ${overflow}px (tolerance ${tolerancePx}px)`).toBe(false);
}

/**
 * Detect overlapping elements inside the same visual row. Two
 * elements overlap when their rectangles share an x range AND
 * their vertical centres lie within `rowTolerancePx`.
 */
async function checkNoOverlap(locator, rowTolerancePx = 8) {
  const boxes = await boundingBoxes(locator);
  const violations = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const sameRow = Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < rowTolerancePx;
      if (!sameRow) continue;
      const overlaps = !(a.x + a.width <= b.x || b.x + b.width <= a.x);
      if (overlaps) violations.push({ a: a.idx, b: b.idx });
    }
  }
  return { ok: violations.length === 0, violations };
}

async function assertNoOverlap(locator, rowTolerancePx = 8) {
  const result = await checkNoOverlap(locator, rowTolerancePx);
  expect(result.ok, `overlapping elements: ${JSON.stringify(result.violations)}`).toBe(true);
}

/**
 * Detect a blank page. A page is "blank" when:
 *   - it rendered no <h1>, OR
 *   - the body inner text is empty / under 30 chars
 *
 * Used as a safety-net alongside no-broken-route checks during
 * link crawls.
 */
async function detectBlankPage(page) {
  const h1Count = await page.locator('h1').count();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const blank = h1Count === 0 || bodyText.trim().length < 30;
  return { blank, h1Count, bodyTextLength: bodyText.trim().length };
}

async function assertNotBlank(page) {
  const result = await detectBlankPage(page);
  expect(result.blank, `page looks blank: ${JSON.stringify(result)}`).toBe(false);
}

/**
 * Check that every img has an alt attribute. Returns the list of
 * src values that violate. Decorative imagery (alt="") is
 * accepted; missing-altogether is the only failure.
 */
async function checkImagesHaveAlt(page) {
  const offenders = await page.$$eval('img', (imgs) =>
    imgs
      .filter((img) => img.getAttribute('alt') === null)
      .map((img) => img.getAttribute('src') || '<no src>')
  );
  return { ok: offenders.length === 0, offenders };
}

module.exports = {
  boundingBoxes,
  groupByRow,
  checkEqualRowHeights,
  assertEqualRowHeights,
  hasHorizontalOverflow,
  assertNoHorizontalOverflow,
  checkNoOverlap,
  assertNoOverlap,
  detectBlankPage,
  assertNotBlank,
  checkImagesHaveAlt,
};
