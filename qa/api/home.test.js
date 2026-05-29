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

  test('GET /home as guest exposes new Step-1 blocks', async () => {
    const res = await newClient().get('/home');
    expect(res.status).toBe(200);
    const data = res.data?.Data || {};
    // Live stats — 4 marketplace-momentum metrics. Numbers may be
    // zero in seeded environments, but the keys + numeric type
    // must exist so the frontend can render the cards.
    expect(data.liveStats).toMatchObject({
      jobsToday: expect.any(Number),
      openJobs: expect.any(Number),
      activeCompanies: expect.any(Number),
      activeCandidates: expect.any(Number),
      successfulApplications: expect.any(Number),
    });
    // Trending skills — array of `{ name, slug, count }` entries.
    expect(Array.isArray(data.trendingSkills)).toBe(true);
    if (data.trendingSkills.length > 0) {
      expect(data.trendingSkills[0]).toEqual(
        expect.objectContaining({ name: expect.any(String), slug: expect.any(String), count: expect.any(Number) })
      );
    }
    // Salary explorer — three named slices, each an array.
    expect(data.salaryExplorer).toEqual(
      expect.objectContaining({
        byRole: expect.any(Array),
        byCountry: expect.any(Array),
        byExperience: expect.any(Array),
      })
    );
    // Career resources — three curated lists.
    expect(data.careerResources).toEqual(
      expect.objectContaining({
        resumeTips: expect.any(Array),
        interviewPrep: expect.any(Array),
        skillGrowth: expect.any(Array),
      })
    );
    // Recommended companies — for guests this falls back to topCompanies.
    expect(Array.isArray(data.recommendedCompanies)).toBe(true);
    // Employer block is null for guests.
    expect(data.employer).toBeNull();
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
    // Step-1 additions still surface for candidates.
    expect(data.liveStats).toHaveProperty('jobsToday');
    expect(Array.isArray(data.trendingSkills)).toBe(true);
    // Career resources should be present for a candidate too.
    expect(data.careerResources).toHaveProperty('resumeTips');
    // Employer block is still null for a candidate viewer.
    expect(data.employer).toBeNull();
  });

  test('GET /home as employer surfaces the hiring snapshot, not candidate-only blocks', async () => {
    const { token } = await login('COMPANY');
    const res = await newClient(token).get('/home');
    expect(res.status).toBe(200);
    const data = res.data?.Data || {};
    // Employer-specific block must be present and well-shaped.
    expect(data.employer).toEqual(
      expect.objectContaining({
        hasCompany: expect.any(Boolean),
        openJobs: expect.any(Number),
        applicationsThisWeek: expect.any(Number),
        shortlisted: expect.any(Number),
        interviews: expect.any(Number),
        hires: expect.any(Number),
      })
    );
    // Candidate-only blocks should NOT carry candidate content.
    expect(data.recommendedJobs).toEqual([]);
    expect(data.latestMatchedJobs).toEqual([]);
    expect(data.aiSuggestions).toBeNull();
    // Career resources are candidate-focused — null for employers.
    expect(data.careerResources).toBeNull();
  });
});
