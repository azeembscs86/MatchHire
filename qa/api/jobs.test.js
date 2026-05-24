'use strict';

/**
 * API test — public jobs feed + smart-jobs endpoint.
 *
 * Asserts:
 *   - GET /jobs returns 200 + record shape we render on cards.
 *   - Every returned job has a work_mode in the canonical set
 *     (verifies migration 039 + the "Onsite default" rule).
 *   - Expired jobs are filtered out server-side
 *     (`application_deadline > NOW()` or NULL).
 */

const { newClient } = require('../helpers/api-client');

describe('Jobs API', () => {
  let res;
  beforeAll(async () => {
    res = await newClient().get('/jobs', { params: { limit: 25 } });
  });

  test('GET /jobs returns 200', () => {
    expect(res.status).toBe(200);
    expect(res.data?.Response?.responseCode).toBe(1);
    expect(Array.isArray(res.data?.Data?.records)).toBe(true);
  });

  test('Every job carries a valid work_mode (Onsite default rule)', () => {
    const records = res.data?.Data?.records || [];
    expect(records.length).toBeGreaterThan(0);
    for (const job of records) {
      const wm = String(job.work_mode || '').toLowerCase();
      expect(['onsite', 'hybrid', 'remote']).toContain(wm);
    }
  });

  test('Every job exposes the fields the JobCard reads', () => {
    const records = res.data?.Data?.records || [];
    for (const job of records) {
      expect(typeof job.id).toBe('number');
      expect(typeof job.title).toBe('string');
      expect(typeof job.company_name).toBe('string');
      expect(['full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance'])
        .toContain(String(job.job_type));
    }
  });

  test('Expired jobs are filtered out (deadline > now or null)', () => {
    const records = res.data?.Data?.records || [];
    const now = Date.now();
    for (const job of records) {
      if (job.application_deadline) {
        const ts = new Date(job.application_deadline).getTime();
        expect(ts).toBeGreaterThan(now);
      }
    }
  });

  test('GET /jobs?work_mode=remote narrows to remote jobs only', async () => {
    const r = await newClient().get('/jobs', { params: { work_mode: 'remote', limit: 20 } });
    expect(r.status).toBe(200);
    const recs = r.data?.Data?.records || [];
    for (const j of recs) expect(j.work_mode).toBe('remote');
  });
});
