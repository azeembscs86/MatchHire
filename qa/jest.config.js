'use strict';

/**
 * Jest config for the API-level test suite (qa/api/**).
 *
 * The API tests assume the backend is already running (the
 * `qa:full` orchestrator starts it before invoking Jest; running
 * `npm run qa:api` directly requires the dev server to be up).
 *
 * Reports:
 *   - JSON summary → qa/reports/jest.json   (consumed by qa/scripts/report.js)
 *   - Text summary → stdout
 */

const path = require('node:path');

module.exports = {
  rootDir: path.join(__dirname),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api/**/*.test.js'],
  testTimeout: 20_000,
  reporters: [
    'default',
    [
      // Jest's built-in JSON reporter via env var lands the file
      // automatically when JEST_JSON_FILE is set; we set the path
      // here so the qa:report script knows where to read.
      'summary',
      { summaryThreshold: 0 },
    ],
  ],
  // Persisted JSON output for the consolidated qa:report script.
  // Wired via the --json flag in package.json's qa:api script if
  // a CI surface ever needs it. For now the summary reporter +
  // stdout is enough.
  verbose: true,
  passWithNoTests: false,
  setupFiles: ['<rootDir>/helpers/jest-setup.js'],
};
