'use strict';

/**
 * Console + page-error monitor.
 *
 * Returns a tracker handle whose `.getErrors()` exposes the
 * cumulative list of uncaught console errors and pageerror events
 * recorded since `attach()` was called. Tests typically assert the
 * list is empty at the end of the spec — a non-empty list is a
 * regression worth surfacing (React hydration warning, unhandled
 * promise, missing key, etc.).
 *
 * What we filter out:
 *   - 401 / Unauthorized — the SPA's /auth/me probe legitimately
 *     returns 401 for guest visitors.
 *   - Failed-to-load-resource / net::ERR_ABORTED — fired on stale
 *     in-flight requests when React Router navigates away.
 *   - ResizeObserver loop limit exceeded — a benign warning
 *     emitted by some chromium versions on layout-heavy pages.
 *   - React DevTools download hint — dev-mode only.
 *   - Vite HMR chatter — dev-only.
 *
 * Anything else surfaces.
 */

const NOISE_PATTERNS = [
  /401|Unauthor/i,
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /ResizeObserver loop limit exceeded/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
];

function attach(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (NOISE_PATTERNS.some((rx) => rx.test(text))) return;
    errors.push({ source: 'console', text, location: msg.location() });
  });
  page.on('pageerror', (err) => {
    errors.push({ source: 'pageerror', text: err.message, stack: err.stack });
  });
  return {
    getErrors: () => errors.slice(),
    getTexts: () => errors.map((e) => e.text),
    isEmpty: () => errors.length === 0,
  };
}

module.exports = {
  attach,
  NOISE_PATTERNS,
};
