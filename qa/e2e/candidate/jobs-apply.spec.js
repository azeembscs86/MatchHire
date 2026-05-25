'use strict';

/**
 * E2E — candidate sees the Apply Now button on the Jobs page.
 *
 * Read-only contract test. The QA brief asks us to verify a
 * signed-in candidate sees Apply Now on matching jobs without
 * actually submitting an application (we never want a QA run to
 * mutate live application state on every iteration).
 *
 * Assertions:
 *   - Authenticated candidate visiting /jobs sees the Apply
 *     button (or one of its disabled siblings: Already Applied,
 *     Job Expired) on at least one card.
 *   - The Apply Now button is centred within its row — the
 *     button's centre lies within ±4px of the row container
 *     centre, so the layout doesn't drift right on long cards.
 *   - Clicking the Apply Now button does NOT navigate the card
 *     (the row stops propagation; we stay on /jobs).
 *
 * The application network request is intercepted and stubbed so
 * the test never inserts a real row in the candidate's history.
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@candidate Candidate apply flow on Jobs page', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  test('signed-in candidate sees an Apply control on at least one card', async ({ page }) => {
    await page.goto('/jobs');
    const cards = page.getByTestId('job-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    // Any of the three Apply states satisfies the contract.
    const applyButtons = page.getByTestId('apply-now-button');
    const appliedButtons = page.locator('.apply-btn-applied');
    const expiredButtons = page.locator('.apply-btn-expired');

    const total =
      (await applyButtons.count()) +
      (await appliedButtons.count()) +
      (await expiredButtons.count());
    expect(total, 'expected at least one Apply / Applied / Expired button across the visible feed').toBeGreaterThan(0);
  });

  test('Apply Now button is centred within its row', async ({ page }) => {
    await page.goto('/jobs');
    const apply = page.getByTestId('apply-now-button').first();
    await expect(apply, 'expected at least one Apply Now button on /jobs for the QA candidate').toBeVisible({ timeout: 15_000 });

    const button = await apply.boundingBox();
    const row = await apply.locator('xpath=..').boundingBox();
    expect(button && row, 'expected button + row to have layout boxes').toBeTruthy();
    if (!button || !row) return;

    const buttonCentre = button.x + button.width / 2;
    const rowCentre = row.x + row.width / 2;
    const offset = Math.abs(buttonCentre - rowCentre);
    // A 4px allowance covers sub-pixel rounding without letting a
    // genuine alignment regression slip through.
    expect(offset, `Apply Now button is off-centre by ${offset}px`).toBeLessThanOrEqual(4);
  });

  test('clicking Apply Now keeps the user on /jobs (stubbed)', async ({ page }) => {
    // Intercept the application endpoint so the click can't
    // mutate any candidate state. We respond with the same
    // envelope the SPA expects on success.
    await page.route('**/api/v1/candidates/applications/apply', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          Response: { responseCode: 1, status: 'Success', message: 'Application created' },
          Data: { application_id: 1, status: 'applied' },
        }),
      });
    });

    await page.goto('/jobs');
    const apply = page.getByTestId('apply-now-button').first();
    await expect(apply).toBeVisible({ timeout: 15_000 });

    await apply.click();
    // The handler's optimistic UX flow drops the row from the
    // feed; the URL stays on /jobs either way. We assert the
    // URL didn't navigate to a detail page.
    await expect(page).toHaveURL(/\/jobs(\?|$)/);
  });
});
