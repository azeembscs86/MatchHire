'use strict';

/**
 * Navigation helper — clicks, link discovery, and page-health
 * checks shared across navigation/UI specs.
 *
 * Three primary use cases:
 *   - Recording uncaught console errors + page errors on a page
 *     so a test can fail with a clean diagnostic instead of a
 *     silent regression.
 *   - Discovering internal links rendered on the current page so
 *     a single spec can crawl them without a hand-curated list.
 *   - Asserting that a page rendered a sensible top-of-page
 *     anchor (an <h1>) within a generous timeout.
 *
 * Filters out noise that's load-bearing for the dev server but
 * not signal for QA (401 from anonymous /auth/me, dev HMR
 * spam, Vite's noisy ResizeObserver warnings, ...).
 */

const NOISE_PATTERNS = [
  /401|Unauthor/i,
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /ResizeObserver loop limit exceeded/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
];

/**
 * Attach console + pageerror listeners and return a collector
 * that filters out known dev-server noise. Call `getErrors()` at
 * the end of the test to read the accumulated list.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {{ getErrors: () => string[] }}
 */
function trackConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (NOISE_PATTERNS.some((rx) => rx.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return { getErrors: () => errors.slice() };
}

/**
 * Track failed network responses (status >= 400) on a page. Some
 * routes legitimately respond 401/403 for guest viewers (e.g.
 * /auth/me), so we expose a filter callback the caller can use
 * to ignore expected failures.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(res: import('@playwright/test').Response) => boolean} [ignore]
 *   Return true to drop a response from the error list.
 * @returns {{ getFailures: () => Array<{url: string, status: number}> }}
 */
function trackFailedRequests(page, ignore = () => false) {
  const failures = [];
  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    if (ignore(res)) return;
    failures.push({ url: res.url(), status });
  });
  return { getFailures: () => failures.slice() };
}

/**
 * Discover the unique set of internal href targets rendered on
 * the current page. Excludes hash anchors, external links, and
 * mailto:/tel: schemes. Results are normalised to pathname-only
 * strings (e.g. `/jobs`, `/companies/12`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function discoverInternalLinks(page) {
  return page.$$eval('a[href]', (anchors) => {
    const out = new Set();
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href) continue;
      if (href.startsWith('#')) continue;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
      // Same-origin only: either a relative path starting with `/`
      // or an absolute URL whose origin matches the current
      // location.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) continue;
        if (!url.pathname.startsWith('/')) continue;
        out.add(url.pathname);
      } catch { /* malformed href — skip */ }
    }
    return [...out];
  });
}

/**
 * Assert that the page rendered a top-of-page heading within the
 * given timeout. Used by every crawl/navigation test as a "page
 * actually loaded" check — protects against blank-screen
 * regressions when a route accidentally renders null.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=10000]
 */
async function expectHeadingVisible(page, timeout = 10000) {
  const heading = page.getByRole('heading', { level: 1 }).first();
  await heading.waitFor({ state: 'visible', timeout });
}

module.exports = {
  trackConsoleErrors,
  trackFailedRequests,
  discoverInternalLinks,
  expectHeadingVisible,
};
