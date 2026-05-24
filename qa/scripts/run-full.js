'use strict';

/**
 * `npm run qa:full` orchestrator.
 *
 * Sequence:
 *   1. Start backend dev server (`npm run dev` in Backend/) if it
 *      isn't already listening on PORT.
 *   2. Start frontend dev server (`npm run dev` in Frontend/) if
 *      it isn't already listening on the Vite port.
 *   3. Wait for both health checks.
 *   4. Run, in order:
 *        - qa:seed         (idempotent QA-user upsert)
 *        - qa:api          (Jest + Supertest)
 *        - qa:e2e          (Playwright e2e — incl. a11y)
 *        - qa:lighthouse   (best-effort; skipped if deps missing)
 *        - qa:report       (consolidated HTML + JSON)
 *   5. Shut down any servers we started ourselves (we never
 *      kill servers that were already running when we started).
 *
 * Exit code is the worst of the test runs — a single failing
 * test fails the whole orchestrator so CI surfaces it.
 */

const path = require('node:path');
const { spawn } = require('node:child_process');
const { waitForReady } = require('../helpers/wait-for-ready');
const { API_URL, BASE_URL } = require('../helpers/env');

const ROOT = path.resolve(__dirname, '../..');

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || ROOT,
      stdio: 'inherit',
      shell: false,
      ...opts,
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function spawnDetached(cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false, detached: false });
  return child;
}

async function isUp(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok || res.status === 401 || res.status === 404;
  } catch { return false; }
}

async function main() {
  const startedByUs = [];
  let exit = 0;
  try {
    // ----- 1. Backend -----
    const backendHealth = `${API_URL}/public/categories`;
    if (await isUp(backendHealth)) {
      console.log(`[qa:full] backend already running at ${API_URL}`);
    } else {
      console.log(`[qa:full] starting backend…`);
      const child = spawnDetached('npm', ['run', 'dev'], path.join(ROOT, 'Backend'));
      startedByUs.push(child);
      await waitForReady(backendHealth, { timeoutMs: 90_000, label: 'backend' });
    }

    // ----- 2. Frontend -----
    if (await isUp(BASE_URL)) {
      console.log(`[qa:full] frontend already running at ${BASE_URL}`);
    } else {
      console.log(`[qa:full] starting frontend…`);
      const child = spawnDetached('npm', ['run', 'dev'], path.join(ROOT, 'Frontend'));
      startedByUs.push(child);
      await waitForReady(BASE_URL, { timeoutMs: 60_000, label: 'frontend' });
    }

    // ----- 3. Seed test users -----
    console.log(`[qa:full] seeding QA users…`);
    exit = Math.max(exit, await run('npm', ['run', 'qa:seed']));

    // ----- 4. API tests -----
    console.log(`[qa:full] running API tests…`);
    exit = Math.max(exit, await run('npm', ['run', 'qa:api']));

    // ----- 5. E2E + accessibility -----
    console.log(`[qa:full] running e2e + accessibility…`);
    exit = Math.max(exit, await run('npm', ['run', 'qa:e2e']));

    // ----- 6. Lighthouse (best-effort) -----
    console.log(`[qa:full] running lighthouse…`);
    // We don't bubble the lighthouse exit code into the suite
    // total — its install is heavier than the rest, and we want
    // the suite to be runnable on machines that don't have a
    // Chrome binary handy. The report still notes its absence.
    await run('npm', ['run', 'qa:lighthouse']);

    // ----- 7. Consolidated report -----
    await run('npm', ['run', 'qa:report']);
  } finally {
    for (const child of startedByUs) {
      try { child.kill('SIGTERM'); } catch (_e) { /* ignore */ }
    }
  }
  process.exit(exit);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[qa:full] orchestrator failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
