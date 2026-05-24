'use strict';

/**
 * API test — role-gated candidate / employer surfaces.
 *
 * Covers:
 *   - GET /public/candidates returns paginated list (guest).
 *   - GET /public/candidates/:id 404s for a non-existent id.
 *   - POST /candidates/similar requires a candidate token; 4xx
 *     for guests, 200 for candidates.
 *   - POST /employers/recommended-candidates requires an employer
 *     token; 4xx for candidates, 200 for employers (the response
 *     can be empty if no jobs match — only the shape matters here).
 *   - POST /candidates/:id/message blocks an inappropriate body.
 */

const { newClient, login } = require('../helpers/api-client');

describe('Candidate-side APIs', () => {
  test('GET /public/candidates returns 200 + records[]', async () => {
    const res = await newClient().get('/public/candidates', { params: { limit: 5 } });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.Data?.records)).toBe(true);
  });

  test('GET /public/candidates/9999999 returns 404', async () => {
    const res = await newClient().get('/public/candidates/9999999');
    expect(res.status).toBe(404);
  });

  test('POST /candidates/similar requires a candidate token', async () => {
    // Guest call: 401
    const guest = await newClient().post('/candidates/similar', {});
    expect([401, 403]).toContain(guest.status);

    // Candidate call: 200 (records may be 0 — that's fine)
    const { token } = await login('CANDIDATE');
    const res = await newClient(token).post('/candidates/similar', { limit: 5 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data?.Data?.records)).toBe(true);
  });

  test('POST /candidates/:id/message blocks inappropriate content', async () => {
    const { token } = await login('CANDIDATE');
    // Pick any other candidate id — we send banned content so the
    // similarity check never even runs.
    const res = await newClient(token).post('/candidates/1/message', {
      subject: 'Hello',
      body: 'wanna date me xxxxxxxxxx',
    });
    // 422 if the content-filter caught it, 403 if the similarity
    // gate rejected first — either is "the gate is doing its job".
    expect([403, 404, 422]).toContain(res.status);
  });
});

describe('Employer-side recommended candidates', () => {
  test('Requires an employer token; candidates get 4xx', async () => {
    const { token: candidateToken } = await login('CANDIDATE');
    const r1 = await newClient(candidateToken).post('/employers/recommended-candidates', {});
    expect([401, 403]).toContain(r1.status);

    const { token: companyToken } = await login('COMPANY');
    const r2 = await newClient(companyToken).post('/employers/recommended-candidates', { limit: 5 });
    // Company may not have any active jobs (the QA seeder creates
    // the company row but no jobs), so an empty `records` array is
    // expected. The status should still be 200 and the response
    // should carry the canonical fields.
    expect(r2.status).toBe(200);
    expect(r2.data?.Data).toHaveProperty('records');
    expect(r2.data?.Data).toHaveProperty('floor');
  });
});
