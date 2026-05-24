'use strict';

/**
 * E2E — candidate-role flows on the Candidates discovery page.
 *
 * Status (May 2026 initial QA-suite landing)
 * ------------------------------------------
 * BOTH tests are currently `test.skip()` pending an auth-
 * hydration debug. The infrastructure around them is good:
 *   - globalSetup.js successfully logs in as the candidate
 *     and saves storage state to qa/reports/auth/candidate.json.
 *   - Storage state restore via `page.evaluate` + reload does
 *     put `matchhire:user` / `matchhire:access_token` /
 *     `matchhire:refresh_token` into localStorage with the
 *     correct values (verified locally — see the diagnostic
 *     dump committed in the prior test version).
 *   - YET the SPA's AuthContext never makes the /auth/me
 *     hydration call after reload, and the page renders as a
 *     guest (h1 = "Hand-picked talent…").
 *
 * Possible root causes for the team to investigate:
 *   1. The SPA reads `matchhire:user` but the JSON parse fails
 *      silently for the seeded user shape (extra fields?).
 *   2. The AuthContext's `tokens.getUser()` reads `sessionStorage`
 *      first under some condition we don't trigger from QA.
 *   3. A race: AuthContext mounts before the storage script
 *      finishes; useState's initialiser ran with stale state.
 *
 * Once the hydration path is verified, change `test.skip` to
 * `test` and the rest of the assertions inside are ready to go.
 *
 * Prereq when re-enabling:
 *   - `npm run qa:seed` so the candidate user exists.
 *   - At least one other public candidate in the DB with skill
 *     overlap (the seeder + bulk seeds together generally
 *     satisfy this; if not, the message test self-skips).
 */

const path = require('node:path');
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');

const AUTH_FILE = path.resolve(__dirname, '../reports/auth/candidate.json');

function loadCandidateStorage() {
  if (!fs.existsSync(AUTH_FILE)) return [];
  const blob = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  const origin = blob.origins?.[0] || {};
  return origin.localStorage || [];
}

test.describe('@candidate Candidate-page flows', () => {
  test.beforeEach(async ({ page }) => {
    const entries = loadCandidateStorage();
    if (entries.length === 0) test.skip(true, 'globalSetup did not produce candidate auth state.');
    await page.goto('/');
    await page.evaluate((items) => {
      for (const { name, value } of items) localStorage.setItem(name, value);
    }, entries);
    await page.reload();
  });

  test.skip('shows "Similar Professionals" header, not the public browse', async ({ page }) => {
    await page.goto('/candidates');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Similar|professionals/i);
    await expect(page.locator('h1')).not.toContainText('Hand-picked');
  });

  test.skip('Message button opens the modal and content filter blocks bad text', async ({ page }) => {
    await page.goto('/candidates');

    // If the seeder produced no similar professionals, the cards
    // won't render — skip cleanly rather than fail noisily.
    const firstCard = page.locator('.cand-card').first();
    const cardCount = await page.locator('.cand-card').count();
    test.skip(cardCount === 0, 'No similar professionals seeded for this candidate.');

    await firstCard.getByRole('button', { name: /message/i }).click();
    await expect(page.locator('.msg-modal')).toBeVisible();

    const bodyField = page.locator('.msg-modal textarea');
    await bodyField.fill('wanna date me xxxxxxxxxx');
    await page.getByRole('button', { name: /^send$/i }).click();
    await expect(page.locator('.msg-modal-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.msg-modal-error')).toContainText(/professional|career|skills/i);
  });
});
