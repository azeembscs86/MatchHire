'use strict';

/**
 * Playwright login helpers. Two approaches:
 *
 *   1. `loginViaAPI` — hits POST /auth/login, drops the token into
 *      localStorage / sessionStorage the same way the SPA does,
 *      then refreshes. Fast, deterministic, no UI driving.
 *
 *   2. `loginViaUI` — drives the AuthModal end-to-end (click
 *      Sign-in, fill, submit). Slower but exercises the real
 *      auth UI; use sparingly (one auth.spec.js test is enough).
 *
 * The SPA persists tokens via the project's `tokens` helper. The
 * key names below mirror what `Frontend/src/api/client.js` reads,
 * so future code paths that check tokens see a logged-in session.
 */

const { API_URL, qaUser } = require('./env');

// Keys must match `Frontend/src/api/client.js`'s `STORAGE` constant
// (matchhire:* namespace). Changing them here without changing them
// there silently breaks every authenticated UI test.
const STORAGE_KEYS = {
  access: 'matchhire:access_token',
  refresh: 'matchhire:refresh_token',
  user: 'matchhire:user',
};

async function loginViaAPI(page, role) {
  const user = qaUser(role);
  if (!user) throw new Error(`Unknown role for QA login: ${role}`);

  // 1. Fetch token via the same endpoint the SPA hits.
  const res = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: user.email, password: user.password, rememberMe: false },
  });
  const body = await res.json();
  if (!res.ok() || body?.Response?.responseCode !== 1) {
    throw new Error(`Login API failed for ${role}: ${body?.Response?.message || res.status()}`);
  }
  const { access_token, refresh_token, user: u } = body.Data || {};

  // 2. Stash into localStorage so the SPA reads it on next nav.
  //    We DO need to be on the SPA origin first for storage to apply.
  await page.goto('/');
  await page.evaluate(({ keys, access, refresh, user }) => {
    localStorage.setItem(keys.access, access);
    if (refresh) localStorage.setItem(keys.refresh, refresh);
    if (user) localStorage.setItem(keys.user, JSON.stringify(user));
  }, { keys: STORAGE_KEYS, access: access_token, refresh: refresh_token, user: u });
  await page.reload();
}

module.exports = {
  loginViaAPI,
  STORAGE_KEYS,
};
