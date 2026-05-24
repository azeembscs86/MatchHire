'use strict';

/**
 * API test — the auth-aware home payload that drives the
 * landing page rails (latest jobs, recommended, AI suggestions).
 *
 * Run guest + candidate variants so the test catches regressions
 * in the role-branching logic on /home.
 */

const { newClient, login } = require('../helpers/api-client');

describe('Home API', () => {
  test('GET /home as guest returns the base payload', async () => {
    const res = await newClient().get('/home');
    expect(res.status).toBe(200);
    expect(res.data?.Response?.responseCode).toBe(1);
    const data = res.data?.Data || {};
    // The guest payload has these blocks — even if some are empty
    // arrays, the keys should exist so the SPA can render the
    // skeleton without optional chaining everywhere.
    expect(data).toHaveProperty('hero');
    expect(data).toHaveProperty('latestJobs');
    expect(data).toHaveProperty('categories');
    expect(data).toHaveProperty('topCompanies');
  });

  test('GET /home as candidate adds recommendation payload', async () => {
    const { token } = await login('CANDIDATE');
    const res = await newClient(token).get('/home');
    expect(res.status).toBe(200);
    const data = res.data?.Data || {};
    // Candidate-only enrichments. `recommendedJobs` may be empty
    // when the seeded candidate has no skill overlap with active
    // jobs, but the key should be present.
    expect(data).toHaveProperty('recommendedJobs');
    expect(data).toHaveProperty('viewer');
  });
});
