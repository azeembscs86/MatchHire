'use strict';

/**
 * Thin axios wrapper used by every API test. Mirrors the
 * frontend's `client.js` envelope handling: success bodies
 * carry `{ Response, Data }`; the helper unwraps so tests
 * can assert against the payload directly.
 *
 * Tokens are passed explicitly per call — keeps the helper
 * stateless so tests can run in parallel without leaking
 * auth between them.
 */

const axios = require('axios');
const { API_URL, CANDIDATE, COMPANY, ADMIN } = require('./env');

function newClient(token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({
    baseURL: API_URL,
    headers,
    validateStatus: () => true,    // we want to inspect errors in tests
    timeout: 15_000,
  });
}

function unwrap(res) {
  const body = res?.data || {};
  if (body?.Response?.responseCode === 1) return body.Data ?? {};
  const msg = body?.Response?.message || `HTTP ${res?.status}`;
  const err = new Error(msg);
  err.httpStatus = res?.status;
  err.body = body;
  throw err;
}

/**
 * POST /auth/login → returns access_token. `which` is 'CANDIDATE'
 * | 'COMPANY' | 'ADMIN' (test-user keys). The matching seeded
 * row must exist; run `npm run qa:seed` first.
 *
 * Tokens are cached per-process per-role: a test suite that calls
 * `login('CANDIDATE')` 20 times hits /auth/login exactly once.
 * That keeps the API tests under the auth rate limiter and also
 * makes the suite an order of magnitude faster on busy roles.
 *
 * Pass `{ fresh: true }` to bypass the cache when a test
 * specifically wants to exercise the login flow itself.
 */
const _tokenCache = new Map();

async function login(which, { fresh = false } = {}) {
  const key = String(which).toUpperCase();
  if (!fresh && _tokenCache.has(key)) return _tokenCache.get(key);

  const user = ({ CANDIDATE, COMPANY, ADMIN })[key];
  if (!user) throw new Error(`Unknown QA user: ${which}`);
  const client = newClient();
  const res = await client.post('/auth/login', {
    email: user.email,
    password: user.password,
    rememberMe: false,
  });
  const data = unwrap(res);
  if (!data?.access_token) throw new Error('Login succeeded but no token');
  const entry = { token: data.access_token, user: data.user };
  _tokenCache.set(key, entry);
  return entry;
}

module.exports = {
  newClient,
  unwrap,
  login,
};
