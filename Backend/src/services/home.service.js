'use strict';

/**
 * Home aggregator service
 * -----------------------
 * Composes the payload for `GET /api/v1/home`. One request returns everything
 * the homepage needs:
 *
 *   - hero stats           (total open jobs, active companies, registered candidates)
 *   - featured categories  (top job categories with open-job counts)
 *   - top companies        (featured + most open roles)
 *   - latest jobs          (guests OR logged-in users — see "matched" below)
 *   - recommendedJobs      (only when authenticated as a candidate, > threshold)
 *   - latestMatchedJobs    (latest 6 ranked by match% for authed candidates)
 *   - aiSuggestions        (career + profile hints from `ai.service`)
 *   - cta                  (the two homepage call-to-action blocks)
 *
 * Caches the guest payload in Redis (15 min) keyed on `viewerKey = "guest"`.
 * Authenticated payloads are NOT cached because they're per-user.
 */

const jobRepo = require('../repositories/job.repository');
const companyRepo = require('../repositories/company.repository');
const candidateRepo = require('../repositories/candidate.repository');
const metaRepo = require('../repositories/meta.repository');
const userRepo = require('../repositories/user.repository');
const cache = require('../cache/cache.helper');
const jobMatch = require('./jobMatch.service');
const aiService = require('./ai.service');
const db = require('../config/database');

const TTL_GUEST_HOME = 15 * 60;
const CTA_BLOCKS = Object.freeze({
  forEmployers: {
    eyebrow: 'For employers',
    title: 'Find senior talent that actually fits.',
    body: 'Post a role in minutes. Every applicant arrives pre-scored against the requirements so you spend zero time on mismatches.',
    actionLabel: 'Post a job',
    actionHref: '/employer-onboarding',
  },
  forCandidates: {
    eyebrow: 'For candidates',
    title: 'Complete your profile, unlock real matches.',
    body: 'Add your skills, experience, and preferences. We surface only the roles that align — never a fire-hose of irrelevant listings.',
    actionLabel: 'Complete profile',
    actionHref: '/profile',
  },
});

/* ============================================================================
 * Helpers
 * ========================================================================== */

async function heroStats() {
  // One round-trip per metric, in parallel. Each query is bounded and indexed.
  const [jobsTotal, companiesTotal, candidatesTotal] = await Promise.all([
    db.queryOne(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'open' AND admin_status = 'approved' AND deleted_at IS NULL`),
    db.queryOne(`SELECT COUNT(*) AS n FROM companies WHERE status = 'active' AND deleted_at IS NULL`),
    db.queryOne(`SELECT COUNT(*) AS n FROM users WHERE role = 'candidate' AND deleted_at IS NULL`),
  ]);
  return {
    openJobs: Number(jobsTotal?.n || 0),
    companies: Number(companiesTotal?.n || 0),
    candidates: Number(candidatesTotal?.n || 0),
  };
}

async function featuredCategories(limit = 12) {
  const rows = await metaRepo.listCategories();
  return rows
    .sort((a, b) => Number(b.open_jobs || 0) - Number(a.open_jobs || 0))
    .slice(0, limit);
}

async function topCompanies(limit = 8) {
  // Featured first, then fall back to whichever has the most open roles.
  const featured = await companyRepo.listPublic({ is_featured: true, page: 1, limit });
  if (featured.rows.length >= limit) return featured.rows;
  const fill = await companyRepo.listPublic({ page: 1, limit: limit * 2 });
  const seen = new Set(featured.rows.map((c) => c.id));
  const merged = [...featured.rows];
  for (const c of fill.rows) {
    if (merged.length >= limit) break;
    if (!seen.has(c.id)) merged.push(c);
  }
  return merged;
}

async function latestJobs(limit = 8) {
  const { rows } = await jobRepo.listPublic({ page: 1, limit, sort: 'latest' });
  return rows;
}

/* ============================================================================
 * Public API
 * ========================================================================== */

/**
 * Build the homepage payload. When `viewerUserId` is null the response is
 * the cacheable guest payload; otherwise we add the personalised blocks.
 */
async function buildHome(viewerUserId = null, viewerRole = null) {
  if (!viewerUserId) {
    const cacheKey = 'home:payload:guest';
    return cache.rememberCache(cacheKey, TTL_GUEST_HOME, async () => {
      const [hero, categories, companies, jobs] = await Promise.all([
        heroStats(),
        featuredCategories(),
        topCompanies(),
        latestJobs(8),
      ]);
      return {
        viewer: { authenticated: false, role: null },
        hero,
        categories,
        topCompanies: companies,
        latestJobs: jobs,
        recommendedJobs: [],
        latestMatchedJobs: [],
        aiSuggestions: null,
        cta: CTA_BLOCKS,
      };
    });
  }

  // Authenticated path. Pull everything in parallel — none of it is
  // dependent on the candidate context fetch except the match decoration.
  const [hero, categories, companies, latestRaw] = await Promise.all([
    heroStats(),
    featuredCategories(),
    topCompanies(),
    latestJobs(12),
  ]);

  let recommendedJobs = [];
  let latestMatchedJobs = [];
  let aiSuggestions = null;
  let profileCompletion = null;

  if (viewerRole === 'candidate') {
    const { records, candidate, candidateMissing } = await jobMatch.recommendedFor(viewerUserId, { limit: 8 });
    recommendedJobs = records || [];

    // Latest matched: take the same latest-jobs list, score it for the
    // candidate, sort by match%, and keep the top 6 regardless of
    // threshold so the rail is never empty.
    if (candidate) {
      const scored = jobMatch.rankJobs(latestRaw, candidate, { filter: false, limit: 6 });
      latestMatchedJobs = scored;

      const skills = await candidateRepo.listSkills(viewerUserId);
      const profile = await candidateRepo.findProfileByUserId(viewerUserId);
      const profileTips = aiService.profileImprovement(profile || {}, skills || []);
      const careerTip = aiService.careerImprovement(candidate, recommendedJobs[0]?.missingSkills || []);
      const recommendedTitles = aiService.recommendedJobTitles(skills, profile?.current_title);
      profileCompletion = Number(profile?.profile_strength || 0);
      aiSuggestions = {
        careerImprovement: careerTip,
        profileImprovement: profileTips,
        recommendedJobTitles: recommendedTitles,
        topMatchLabel: recommendedJobs[0]?.aiRecommendationLabel || null,
        topMatchSummary: recommendedJobs[0]?.aiSummary || null,
      };
    } else if (candidateMissing) {
      aiSuggestions = {
        profileImprovement: [
          'Complete your profile and add your skills to get personalised job recommendations',
        ],
        careerImprovement: null,
        recommendedJobTitles: [],
        topMatchLabel: null,
        topMatchSummary: null,
      };
    }
  }

  const user = await userRepo.findById(viewerUserId);
  return {
    viewer: {
      authenticated: true,
      role: viewerRole,
      id: viewerUserId,
      name: user?.full_name || null,
      profileCompletion,
    },
    hero,
    categories,
    topCompanies: companies,
    latestJobs: latestRaw.slice(0, 8),
    recommendedJobs,
    latestMatchedJobs,
    aiSuggestions,
    cta: CTA_BLOCKS,
  };
}

module.exports = {
  buildHome,
  CTA_BLOCKS,
};
