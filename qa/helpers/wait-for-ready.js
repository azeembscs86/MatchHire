'use strict';

/**
 * Poll a URL until it returns 2xx (or until `timeoutMs` elapses).
 * Used by the qa:full orchestrator to know when the backend and
 * frontend dev servers are warm before launching tests.
 *
 * Uses node-fetch via the built-in global fetch (Node 18+).
 */

async function waitForReady(url, { timeoutMs = 60_000, intervalMs = 500, label } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 401 || res.status === 404) {
        // Any healthy HTTP response means the server is up — even
        // 401/404 indicate the app is serving requests.
        return true;
      }
    } catch (_e) {
      // Connection refused / DNS / hang-up — keep polling.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label || url}`);
}

module.exports = { waitForReady };
