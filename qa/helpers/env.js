'use strict';

/**
 * Shared environment access for the QA suite. Loads Backend's
 * `.env.local` first (DB creds, JWT secret), then Backend's
 * `.env` (defaults). Test-suite overrides live in process.env
 * and take precedence.
 *
 * Usage from any test file:
 *   const { API_URL, BASE_URL, qaUser } = require('../helpers/env');
 */

const path = require('node:path');
const dotenv = require('dotenv');

// Load order matters — first non-empty value wins (dotenv won't
// overwrite already-set keys). Order: QA defaults → Backend local
// overrides → Backend defaults. Shell exports always beat all three.
dotenv.config({ path: path.resolve(__dirname, '../.env.qa') });
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env') });

const users = require('../test-data/users');

// Use 127.0.0.1 (IPv4) rather than `localhost`. On macOS,
// `localhost` resolves to `::1` (IPv6) first; the Backend's
// Express server binds to IPv4 (0.0.0.0) only, so Playwright's
// apiRequestContext rejects the IPv6 connection. Jest's axios
// happens to retry across families and worked anyway, masking
// the issue. Pinning IPv4 makes both happy and predictable.
const API_URL = process.env.QA_API_URL
  || `http://127.0.0.1:${process.env.PORT || 3500}${process.env.API_PREFIX || '/api/v1'}`;
// Vite binds to `localhost` only; chromium resolves it fine
// regardless of IPv4/v6, so we leave the browser-facing URL as
// `localhost`. Only `API_URL` above forces IPv4 because
// Playwright's apiRequestContext (a node-side helper) doesn't
// fall back across address families the way axios does.
const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5173';

module.exports = {
  API_URL,
  BASE_URL,
  CANDIDATE: users.CANDIDATE,
  COMPANY: users.COMPANY,
  ADMIN: users.ADMIN,
  qaUser: (role) => users[String(role).toUpperCase()] || null,
};
