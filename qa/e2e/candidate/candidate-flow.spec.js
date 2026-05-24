'use strict';

/**
 * E2E — candidate-role flows on the Candidates discovery page.
 *
 * Two contracts under test:
 *   1. The page renders "Similar Professionals" (not the public
 *      "Hand-picked talent" heading) when the viewer is signed in
 *      as a candidate.
 *   2. The MessageModal opens from a candidate card and the
 *      backend content filter rejects an unprofessional message
 *      with copy that mentions "professional", "career", or
 *      "skills".
 *
 * Auth approach:
 *   We log in via `apiRequestContext.post('/auth/login')` once
 *   per test, then inject the resulting tokens into localStorage
 *   on the SPA origin via `addInitScript`. That script runs in
 *   the page context BEFORE any application JavaScript, which
 *   means AuthContext's `useState(() => tokens.getUser())`
 *   initialiser sees the tokens on its very first render.
 *
 *   We deliberately avoid Playwright's `storageState` mechanism
 *   here — earlier attempts where storage was copied between
 *   contexts produced an inconsistent hydration where /auth/me
 *   never fired. Injecting through addInitScript is simpler and
 *   has no cross-context handoff to break.
 *
 * Prereq: `npm run qa:seed` so QA candidate + peer exist with
 * overlapping skills (the peer ensures the similarity feed is
 * non-empty without depending on the bulk demo seed).
 */

const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.describe('@candidate Candidate-page flows', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page, 'CANDIDATE');
  });

  test('shows "Similar Professionals" heading, not the public browse', async ({ page }) => {
    await page.goto('/candidates');

    // Use the stable data-testid attached only in the candidate
    // branch of Candidates.jsx — its presence alone proves the SPA
    // hydrated as a candidate.
    const heading = page.getByTestId('similar-professionals-heading');
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toContainText(/Similar/i);
    await expect(heading).not.toContainText(/Hand-picked/i);
  });

  test('Message button opens modal and content filter blocks unprofessional text', async ({ page }) => {
    await page.goto('/candidates');

    // Wait for the feed to render. With the QA peer seeded, this
    // should never be empty in a fresh QA DB.
    const firstCard = page.getByTestId('candidate-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Open the message modal from the first candidate card.
    await firstCard.getByTestId('candidate-message-button').click();
    const modal = page.getByTestId('candidate-message-modal');
    await expect(modal).toBeVisible();

    // Fill an unprofessional message that should trip the
    // server-side content filter (matches the "date me" pattern
    // in match.service.js#validateProfessionalMessage).
    await page.getByTestId('candidate-message-textarea')
      .fill('Hi there, wanna date me sometime? Reply soon please.');
    await page.getByTestId('candidate-message-send').click();

    const error = page.getByTestId('professional-message-error');
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText(/professional|career|skills/i);
  });
});
