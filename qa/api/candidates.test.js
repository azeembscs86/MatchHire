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

  test('POST /candidates/applications/:id/withdraw is auth-gated and ownership-checked', async () => {
    // Guests can't withdraw anything.
    const guest = await newClient().post('/candidates/applications/1/withdraw', {});
    expect([401, 403]).toContain(guest.status);

    // A candidate withdrawing a non-existent application gets a clean
    // 404 — proving the route + auth + lookup work without mutating
    // any real application row.
    const { token } = await login('CANDIDATE');
    const missing = await newClient(token).post('/candidates/applications/9999999/withdraw', {});
    expect(missing.status).toBe(404);
  });

  test('POST /candidates/applications/list honours statuses + exclude_statuses', async () => {
    const { token } = await login('CANDIDATE');
    const client = newClient(token);

    // Active list — `exclude_statuses: ['withdrawn']` must never
    // return a withdrawn row.
    const active = await client.post('/candidates/applications/list', {
      page: 1, limit: 100, exclude_statuses: ['withdrawn'],
    });
    expect(active.status).toBe(200);
    const activeRows = active.data?.Data?.records || [];
    for (const r of activeRows) {
      expect(String(r.status).toLowerCase()).not.toBe('withdrawn');
    }

    // Withdrawn tab — `statuses: ['withdrawn']` must return only
    // withdrawn rows (empty array is acceptable — seed-dependent).
    const withdrawn = await client.post('/candidates/applications/list', {
      page: 1, limit: 100, statuses: ['withdrawn'],
    });
    expect(withdrawn.status).toBe(200);
    const withdrawnRows = withdrawn.data?.Data?.records || [];
    for (const r of withdrawnRows) {
      expect(String(r.status).toLowerCase()).toBe('withdrawn');
    }

    // Reject obviously bad status values (the validator's enum guard).
    const bad = await client.post('/candidates/applications/list', {
      statuses: ['not-a-real-status'],
    });
    expect([400, 422]).toContain(bad.status);
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

describe('Employer reject-application contract', () => {
  test('Reason is mandatory and must come from the canonical list', async () => {
    const { token } = await login('COMPANY');
    const client = newClient(token);

    // Hit a guaranteed-not-found application id — the validator runs
    // BEFORE the not-found / ownership checks, so a 4xx here proves
    // the validator rejected the body. The ?id=9999999 means we
    // never mutate any real application row.
    const url = '/employers/applications/9999999/reject';

    // Empty body — must fail validation (reason is now required).
    const empty = await client.post(url, {});
    expect([400, 422]).toContain(empty.status);

    // Free-text "Spam" — not a canonical key — must fail validation.
    const bad = await client.post(url, { reason: 'Spam' });
    expect([400, 422]).toContain(bad.status);

    // `reason: 'other'` without `custom_reason` — must fail.
    const otherEmpty = await client.post(url, { reason: 'other' });
    expect([400, 422]).toContain(otherEmpty.status);

    // Valid canonical reason → validator passes; route falls through
    // to the not-found check and returns 404 (or 403 if the employer
    // doesn't own the job — but with id=9999999 we expect 404).
    const valid = await client.post(url, { reason: 'skills_mismatch' });
    expect([403, 404]).toContain(valid.status);

    // Valid "other" branch with custom_reason → also passes validation.
    const validOther = await client.post(url, { reason: 'other', custom_reason: 'Found a better fit internally.' });
    expect([403, 404]).toContain(validOther.status);
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
