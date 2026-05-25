'use strict';

/**
 * Network / API response monitor.
 *
 * Tracks every HTTP response on a Playwright `Page` and exposes
 * helpers to query the failure subset (status ≥ 400). Tests can
 * assert that:
 *
 *   - no requests to a given path family failed
 *   - no 5xx errors fired at all
 *   - all the routes under test returned the expected envelope
 *
 * Default ignore: paths that legitimately fail for guest viewers
 * (auth/me, auth/refresh-token). Callers can pass an additional
 * predicate via `attach(page, { ignore })`.
 */

const DEFAULT_IGNORE = [
  /\/auth\/me\b/,
  /\/auth\/refresh-token\b/,
  // Vite HMR + dev-asset 404s when navigating between pages
  /\/@react-refresh/,
  /\/@vite\//,
  /\.hot-update\./,
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ ignore?: (res: import('@playwright/test').Response) => boolean }} [opts]
 */
function attach(page, opts = {}) {
  const failures = [];
  const all = [];
  const userIgnore = opts.ignore;

  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    const method = res.request().method();
    const entry = { url, status, method };
    all.push(entry);

    if (status < 400) return;
    if (DEFAULT_IGNORE.some((rx) => rx.test(url))) return;
    if (typeof userIgnore === 'function' && userIgnore(res)) return;
    failures.push(entry);
  });

  return {
    /** Every captured response. */
    getAll: () => all.slice(),
    /** Filtered failure subset (status >= 400, default+user ignores applied). */
    getFailures: () => failures.slice(),
    /** Only 5xx failures — server errors that are never expected. */
    getServerErrors: () => failures.filter((f) => f.status >= 500),
    /** Only 4xx failures. */
    getClientErrors: () => failures.filter((f) => f.status >= 400 && f.status < 500),
    /** True if no failures recorded. */
    isClean: () => failures.length === 0,
  };
}

module.exports = {
  attach,
  DEFAULT_IGNORE,
};
