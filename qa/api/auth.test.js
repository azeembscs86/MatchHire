'use strict';

/**
 * API test — /auth/login + /auth/me for the seeded QA users.
 *
 * Prereqs:
 *   1. Backend running on QA_API_URL (default localhost:3500).
 *   2. `npm run qa:seed` has been run.
 *
 * Extending:
 *   Add a `describe.each` block to also cover failure modes
 *   (wrong password, suspended user, missing fields).
 */

const { newClient, login } = require('../helpers/api-client');
const { CANDIDATE, COMPANY, ADMIN } = require('../helpers/env');

describe('Auth API', () => {
  test.each([
    ['candidate', CANDIDATE],
    ['company',   COMPANY],
    ['admin',     ADMIN],
  ])('POST /auth/login returns a bearer for the seeded %s user', async (label, user) => {
    const client = newClient();
    const res = await client.post('/auth/login', {
      email: user.email, password: user.password, rememberMe: false,
    });
    expect(res.status).toBe(200);
    expect(res.data?.Response?.responseCode).toBe(1);
    expect(typeof res.data?.Data?.access_token).toBe('string');
    expect(res.data?.Data?.access_token.length).toBeGreaterThan(20);
    expect(res.data?.Data?.user?.email).toBe(user.email);
  });

  test('POST /auth/login rejects bad credentials with 4xx', async () => {
    const client = newClient();
    const res = await client.post('/auth/login', {
      email: CANDIDATE.email, password: 'not-the-real-one', rememberMe: false,
    });
    expect([400, 401, 403]).toContain(res.status);
    expect(res.data?.Response?.responseCode).not.toBe(1);
  });

  test('Authenticated /auth/me returns the same user record', async () => {
    const { token, user } = await login('CANDIDATE');
    const client = newClient(token);
    const res = await client.post('/auth/me');
    expect(res.status).toBe(200);
    expect(res.data?.Data?.user?.id).toBe(user.id);
  });
});
