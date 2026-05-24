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
const { API_URL, qaUser } = require('../helpers/env');

const STORAGE_KEYS = {
  access: 'matchhire:access_token',
  refresh: 'matchhire:refresh_token',
  user: 'matchhire:user',
  mode: 'matchhire:auth_mode',
};

async function loginCandidate(context) {
  const user = qaUser('CANDIDATE');
  const res = await context.request.post(`${API_URL}/auth/login`, {
    data: { email: user.email, password: user.password, rememberMe: true },
  });
  const body = await res.json();
  if (!res.ok() || body?.Response?.responseCode !== 1) {
    throw new Error(
      `QA candidate login failed (HTTP ${res.status()}): ${body?.Response?.message || 'unknown'}`
    );
  }
  return body.Data;
}

test.describe('@candidate Candidate-page flows', () => {
  test.beforeEach(async ({ page, context }) => {
    const { access_token, refresh_token, user } = await loginCandidate(context);

    // addInitScript runs at the start of EVERY navigation on this
    // context, BEFORE any page JS executes. By the time React
    // mounts and AuthContext reads localStorage, the tokens are
    // already there — so the SPA renders as the signed-in
    // candidate without needing a manual reload dance.
    await context.addInitScript(
      ({ keys, access, refresh, userJson }) => {
        try {
          localStorage.setItem(keys.access, access);
          if (refresh) localStorage.setItem(keys.refresh, refresh);
          if (userJson) localStorage.setItem(keys.user, userJson);
          localStorage.setItem(keys.mode, 'local');
        } catch (_e) { /* noop */ }
      },
      {
        keys: STORAGE_KEYS,
        access: access_token,
        refresh: refresh_token || '',
        userJson: user ? JSON.stringify(user) : '',
      }
    );

    // Sanity touch — visiting the SPA on this context primes the
    // origin so subsequent goto()s see the injected storage.
    await page.goto('/');
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
