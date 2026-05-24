'use strict';

/**
 * E2E — candidate-role flows on the Candidates discovery page.
 *
 * Verifies:
 *   - The candidate viewer sees "Similar Professionals", NOT the
 *     full candidate list (brief requirement).
 *   - The Message button on each card opens the MessageModal.
 *   - The modal rejects inappropriate content (client surfaces
 *     the server's 422 verbatim).
 *
 * Prereqs:
 *   - `npm run qa:seed` so the candidate user exists.
 *   - At least one other public candidate in the DB with skill
 *     overlap (the seeder + bulk seeds together generally satisfy
 *     this; if not, the "no similar professionals" empty state
 *     renders and the message test is skipped).
 */

const { test, expect } = require('@playwright/test');
const { loginViaAPI } = require('../helpers/auth-ui');

test.describe('@candidate Candidate-page flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page, 'CANDIDATE');
  });

  test('shows "Similar Professionals" header, not the public browse', async ({ page }) => {
    await page.goto('/candidates');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Similar|professionals/i);
    // The public-browse "Hand-picked talent" copy must NOT render
    // when the viewer is a candidate.
    await expect(page.locator('h1')).not.toContainText('Hand-picked');
  });

  test('Message button opens the modal and content filter blocks bad text', async ({ page }) => {
    await page.goto('/candidates');

    // If the seeder produced no similar professionals, the cards
    // won't render — skip cleanly rather than fail noisily.
    const firstCard = page.locator('.cand-card').first();
    const cardCount = await page.locator('.cand-card').count();
    test.skip(cardCount === 0, 'No similar professionals seeded for this candidate.');

    await firstCard.getByRole('button', { name: /message/i }).click();
    await expect(page.locator('.msg-modal')).toBeVisible();

    // Type an inappropriate message and submit — expect the
    // inline error pill to show the server's block copy.
    const bodyField = page.locator('.msg-modal textarea');
    await bodyField.fill('wanna date me xxxxxxxxxx');
    await page.getByRole('button', { name: /^send$/i }).click();
    await expect(page.locator('.msg-modal-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.msg-modal-error')).toContainText(/professional|career|skills/i);
  });
});
