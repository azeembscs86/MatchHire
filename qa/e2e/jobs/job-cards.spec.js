'use strict';

/**
 * E2E — JobCard behavioural contract on the Jobs page.
 *
 * Covers the rules from the brief:
 *   - Every card shows a work-mode badge (Remote / Hybrid / Onsite)
 *     — never empty.
 *   - Whole card is clickable → opens the job detail page.
 *   - Apply / Favourite / Save action buttons do NOT navigate
 *     the card (event.stopPropagation lives on them).
 */

const { test, expect } = require('@playwright/test');

test.describe('JobCard contract', () => {
  test('@smoke every card shows a work-mode badge', async ({ page }) => {
    await page.goto('/jobs');
    const firstCard = page.locator('.job-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Scan the first batch of visible cards. We don't need every
    // card on the page — a representative sample protects the
    // contract without slowing the suite down on data growth.
    const cards = page.locator('.job-card');
    const count = Math.min(await cards.count(), 12);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const modeChip = card.locator(
        '.trust-onsite, .trust-hybrid, .trust-remote'
      ).first();
      await expect(modeChip, `card #${i} is missing a work-mode chip`).toBeVisible();
    }
  });

  test('clicking the card body opens the job detail page', async ({ page }) => {
    await page.goto('/jobs');
    const firstCard = page.locator('.job-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    await expect(page).toHaveURL(/\/jobs\/\d+/, { timeout: 10_000 });
  });

  test('favourite / save buttons do not bubble click to the card', async ({ page }) => {
    // Guest can't actually favourite (the click opens the auth
    // modal), but the propagation rule must still hold: we should
    // STAY on /jobs, not navigate to /jobs/:id.
    await page.goto('/jobs');
    const firstCard = page.locator('.job-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const heart = firstCard.locator('.job-icon-btn').first();
    await heart.click();
    // Still on the jobs listing.
    await expect(page).toHaveURL(/\/jobs(\?|$)/);
  });
});
