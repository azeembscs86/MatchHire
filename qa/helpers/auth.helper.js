'use strict';

/**
 * Auth helper — shared login plumbing for authenticated Playwright
 * specs. The canonical pattern across the suite:
 *
 *   1. Hit POST /auth/login via Playwright's apiRequestContext to
 *      exchange the QA user's credentials for an access + refresh
 *      token pair (the same endpoint the SPA AuthModal hits).
 *   2. Use `context.addInitScript` to write those tokens into
 *      localStorage on the SPA origin. The init script runs BEFORE
 *      any page JS, so React + AuthContext mount with the
 *      authenticated session on first render — no reload dance, no
 *      cross-context storage-state handoff.
 *
 * Why this layout instead of `storageState`:
 *   The previous storage-state setup populated localStorage from a
 *   JSON file produced by globalSetup, but the SPA's hydration
 *   logic intermittently didn't pick those values up — /auth/me
 *   never fired and the page rendered as a guest. Injecting via
 *   `addInitScript` removes the cross-context handoff entirely
 *   and has been stable across CI + local runs.
 */

const { API_URL, qaUser } = require('./env');

// Keys must mirror Frontend/src/api/client.js#STORAGE. Drift here
// silently breaks every authenticated spec.
const STORAGE_KEYS = {
  access: 'matchhire:access_token',
  refresh: 'matchhire:refresh_token',
  user: 'matchhire:user',
  mode: 'matchhire:auth_mode',
};

/**
 * Log in via the real /auth/login endpoint and return the tokens
 * + user object. Throws with a descriptive message if the role is
 * unknown or the API rejects the credentials.
 *
 * @param {import('@playwright/test').APIRequestContext|import('@playwright/test').BrowserContext} ctx
 *   Either a Playwright BrowserContext or an APIRequestContext.
 *   We accept both because helpers may be called from `test.use`
 *   fixtures (BrowserContext) or directly from a beforeEach
 *   (where `context.request` is the APIRequestContext).
 * @param {'CANDIDATE'|'COMPANY'|'ADMIN'} role
 * @param {{ rememberMe?: boolean }} [opts]
 * @returns {Promise<{ access_token: string, refresh_token?: string, user: object }>}
 */
async function loginAsRole(ctx, role, opts = {}) {
  const user = qaUser(role);
  if (!user) throw new Error(`auth.helper: unknown role "${role}"`);
  const requestCtx = ctx.request || ctx; // BrowserContext.request OR APIRequestContext
  const res = await requestCtx.post(`${API_URL}/auth/login`, {
    data: {
      email: user.email,
      password: user.password,
      rememberMe: opts.rememberMe ?? true,
    },
  });
  const body = await res.json();
  if (!res.ok() || body?.Response?.responseCode !== 1) {
    throw new Error(
      `auth.helper: login failed for ${role} (HTTP ${res.status()}): ` +
      (body?.Response?.message || 'unknown error')
    );
  }
  return body.Data || {};
}

/**
 * Authenticate a Playwright `page` as the given QA role and leave
 * the page sitting on the SPA homepage with a hydrated session.
 *
 * Sets `auth_mode` to 'local' so the SPA treats this as a
 * remembered session and the API client picks up the access token
 * on its first request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'CANDIDATE'|'COMPANY'|'ADMIN'} role
 * @returns {Promise<{ user: object }>}
 */
async function authenticatePage(page, role) {
  const context = page.context();
  const data = await loginAsRole(context, role);
  await context.addInitScript(
    ({ keys, payload }) => {
      try {
        localStorage.setItem(keys.access, payload.access);
        if (payload.refresh) localStorage.setItem(keys.refresh, payload.refresh);
        if (payload.userJson) localStorage.setItem(keys.user, payload.userJson);
        localStorage.setItem(keys.mode, 'local');
      } catch (_e) { /* storage may be blocked in some browsers — fail loud later */ }
    },
    {
      keys: STORAGE_KEYS,
      payload: {
        access: data.access_token,
        refresh: data.refresh_token || '',
        userJson: data.user ? JSON.stringify(data.user) : '',
      },
    }
  );
  // Prime the origin so subsequent goto()s see the injected
  // storage. Without this first navigation, addInitScript hasn't
  // had a chance to run yet.
  await page.goto('/');
  return { user: data.user };
}

/**
 * Drive the AuthModal end-to-end — opens the modal from the
 * Header's "Sign in" button, fills the form, submits.
 *
 * Slower than `authenticatePage` because it exercises the real
 * UI, so it's reserved for tests that specifically need to verify
 * the modal itself (validation messages, "remember me", etc.).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 * @param {{ rememberMe?: boolean }} [opts]
 */
async function loginViaModal(page, email, password, opts = {}) {
  await page.goto('/');
  // The Sign-in button lives in the Header for guests only.
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  // AuthModal renders a form with email + password fields.
  await page.locator('form input[type="email"]').first().fill(email);
  await page.locator('form input[type="password"]').first().fill(password);
  if (opts.rememberMe !== undefined) {
    const remember = page.locator('label:has-text("Remember me") input[type="checkbox"]');
    if ((await remember.count()) > 0) {
      const checked = await remember.isChecked();
      if (checked !== opts.rememberMe) await remember.click();
    }
  }
  await page.getByRole('button', { name: /^Signing in|^Sign in →/i }).click();
}

module.exports = {
  STORAGE_KEYS,
  loginAsRole,
  authenticatePage,
  loginViaModal,
};
