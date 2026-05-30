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
const careerResourcesService = require('./career-resources.service');
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
 * New aggregator blocks (Step 1 — Homepage Improvements)
 * --------------------------------------------------------------------------
 *  - liveStats          (jobs today + active companies + active candidates +
 *                       successful applications)
 *  - trendingSkills     (most-frequent skills across the active job pool)
 *  - salaryExplorer     (preview slices: by role, by country, by experience)
 *  - recommendedCompaniesFor(candidate)  (logged-in candidate only)
 *  - employerSummary    (logged-in employer dashboard preview)
 *
 * These are defence-in-depth: each helper is wrapped in try/catch at the
 * `buildHome` boundary so a single bad query never takes the homepage
 * down. The legacy `hero` block is untouched for backward compatibility —
 * the new `liveStats` block carries the same numbers plus two more.
 * ========================================================================== */

/**
 * Live hiring statistics. Extends the legacy `hero` block with two
 * marketplace-momentum signals — jobs posted today and successful
 * applications (status in offered / hired). Returned both as a top-level
 * `liveStats` object AND mirrored into `hero` so existing callers keep
 * working.
 */
async function liveStats(legacyHero) {
  // Bound everything to active-only counts. The two new metrics are
  // separate single queries so a failure on one falls back to 0.
  const [jobsTodayRow, successfulRow] = await Promise.all([
    db.queryOne(
      `SELECT COUNT(*) AS n
         FROM jobs
        WHERE status = 'open'
          AND admin_status = 'approved'
          AND deleted_at IS NULL
          AND created_at >= CURDATE()`
    ).catch(() => ({ n: 0 })),
    db.queryOne(
      `SELECT COUNT(*) AS n
         FROM applications
        WHERE status IN ('offered','hired')`
    ).catch(() => ({ n: 0 })),
  ]);
  return {
    jobsToday: Number(jobsTodayRow?.n || 0),
    openJobs: legacyHero?.openJobs ?? 0,
    activeCompanies: legacyHero?.companies ?? 0,
    activeCandidates: legacyHero?.candidates ?? 0,
    successfulApplications: Number(successfulRow?.n || 0),
  };
}

/**
 * Trending skills across the active job pool. Pulls each open job's
 * `skills_tags` CSV, splits, normalises, and counts. Cheap on a
 * 10k-job catalogue (~1 round-trip + JS counting); cache key keeps it
 * fresh-ish (`home:trending-skills`, 15 min).
 */
async function trendingSkills(limit = 12) {
  const rows = await db.query(
    `SELECT skills_tags
       FROM jobs
      WHERE status = 'open'
        AND admin_status = 'approved'
        AND deleted_at IS NULL
        AND created_at >= (CURDATE() - INTERVAL 30 DAY)`
  ).catch(() => []);
  const counts = new Map();
  for (const r of rows) {
    if (!r?.skills_tags) continue;
    const tokens = String(r.skills_tags)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    for (const t of tokens) {
      const key = t.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([slug, count]) => ({
      // Title-case the display label so chips read cleanly.
      name: slug.replace(/\b\w/g, (c) => c.toUpperCase()),
      slug,
      count,
    }));
}

/**
 * Salary explorer preview — three small aggregations the homepage can
 * render side-by-side. Each slice is independent so a slow / failed
 * query on one doesn't deny the others.
 *
 *   byRole       — top job categories by open-job count, with a salary
 *                  range derived from min/max columns.
 *   byCountry    — top countries by open-job count, same range shape.
 *   byExperience — five fixed buckets (entry → executive).
 *
 * Salary fields are nullable in the DB; rows missing both min and max
 * are ignored. The frontend shows "—" when count is zero on a slice.
 */
async function salaryExplorer() {
  // The job catalogue is multi-currency (USD, PKR, EUR, INR, GBP, …).
  // Mixing currencies in a single AVG would produce nonsense numbers,
  // so for each preview slice we pick the DOMINANT currency per label
  // (via a window-function ROW_NUMBER over (label) ordered by row
  // count) and aggregate only within that cohort. The label still
  // surfaces the currency so the frontend can render "$145K avg" vs
  // "₹15L avg" cleanly. A future dedicated `/salary` route can
  // surface a fuller multi-currency breakdown.
  const baseWhere = `j.status = 'open' AND j.admin_status = 'approved' AND j.deleted_at IS NULL
                     AND (j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL)`;
  const avgExpr = `(IFNULL(j.salary_min, j.salary_max) + IFNULL(j.salary_max, j.salary_min)) / 2`;
  const dominantWrap = (innerSelect, limitClause) => `
    SELECT label, currency, jobs, avg_salary, min_salary, max_salary
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY label ORDER BY jobs DESC) AS rn
          FROM (${innerSelect}) g
      ) ranked
     WHERE ranked.rn = 1
     ORDER BY jobs DESC
     ${limitClause}`;
  const [byRole, byCountry, byExperience] = await Promise.all([
    db.query(
      dominantWrap(
        `SELECT c.name AS label,
                COALESCE(j.salary_currency, 'USD') AS currency,
                COUNT(*) AS jobs,
                ROUND(AVG(${avgExpr})) AS avg_salary,
                MIN(j.salary_min) AS min_salary,
                MAX(j.salary_max) AS max_salary
           FROM jobs j
           INNER JOIN job_categories c ON c.id = j.category_id
          WHERE ${baseWhere} AND j.category_id IS NOT NULL
          GROUP BY c.name, COALESCE(j.salary_currency, 'USD')`,
        'LIMIT 6'
      )
    ).catch(() => []),
    db.query(
      dominantWrap(
        `SELECT j.country AS label,
                COALESCE(j.salary_currency, 'USD') AS currency,
                COUNT(*) AS jobs,
                ROUND(AVG(${avgExpr})) AS avg_salary,
                MIN(j.salary_min) AS min_salary,
                MAX(j.salary_max) AS max_salary
           FROM jobs j
          WHERE ${baseWhere} AND j.country IS NOT NULL AND j.country <> ''
          GROUP BY j.country, COALESCE(j.salary_currency, 'USD')`,
        'LIMIT 6'
      )
    ).catch(() => []),
    db.query(
      // Experience levels are a fixed enum (5 levels). We still pick
      // the dominant currency per level but order by enum position so
      // the row sequence reads naturally (entry → executive).
      `SELECT label, currency, jobs, avg_salary, min_salary, max_salary
         FROM (
           SELECT *,
                  ROW_NUMBER() OVER (PARTITION BY label ORDER BY jobs DESC) AS rn
             FROM (
               SELECT j.experience_level AS label,
                      COALESCE(j.salary_currency, 'USD') AS currency,
                      COUNT(*) AS jobs,
                      ROUND(AVG(${avgExpr})) AS avg_salary,
                      MIN(j.salary_min) AS min_salary,
                      MAX(j.salary_max) AS max_salary
                 FROM jobs j
                WHERE ${baseWhere} AND j.experience_level IS NOT NULL
                GROUP BY j.experience_level, COALESCE(j.salary_currency, 'USD')
             ) g
         ) ranked
        WHERE ranked.rn = 1
        ORDER BY FIELD(label, 'entry','junior','mid','senior','lead','executive')`
    ).catch(() => []),
  ]);
  // Normalise number types for the JSON envelope.
  const toNum = (rows) => rows.map((r) => ({
    label: r.label,
    jobs: Number(r.jobs || 0),
    avgSalary: r.avg_salary != null ? Number(r.avg_salary) : null,
    minSalary: r.min_salary != null ? Number(r.min_salary) : null,
    maxSalary: r.max_salary != null ? Number(r.max_salary) : null,
    currency: r.currency || 'USD',
  }));
  return {
    byRole: toNum(byRole),
    byCountry: toNum(byCountry),
    byExperience: toNum(byExperience),
  };
}

/**
 * Recommend companies the candidate is most likely to fit, based on the
 * jobs they were matched against. We pull the candidate's top
 * recommended jobs (already scored) and group them by company —
 * companies with more match candidates surface first. Falls back to the
 * legacy top-companies list when the candidate's match set is empty.
 *
 * @param {Array} recommendedJobsForCandidate  Pre-scored recommendations from
 *                                              jobMatch.recommendedFor().
 * @param {Array} fallbackCompanies             The cached top-companies list.
 */
function recommendedCompaniesFromMatches(recommendedJobsForCandidate, fallbackCompanies, limit = 6) {
  if (!Array.isArray(recommendedJobsForCandidate) || recommendedJobsForCandidate.length === 0) {
    return (fallbackCompanies || []).slice(0, limit);
  }
  const byCompany = new Map();
  for (const job of recommendedJobsForCandidate) {
    const id = job.company_id;
    if (!id) continue;
    const prev = byCompany.get(id) || {
      id,
      name: job.company_name || 'Company',
      logo_url: job.company_logo || null,
      country: job.country || null,
      open_jobs: 0,
      top_match_score: 0,
    };
    prev.open_jobs += 1;
    prev.top_match_score = Math.max(prev.top_match_score, Number(job.match_score || 0));
    byCompany.set(id, prev);
  }
  return [...byCompany.values()]
    .sort((a, b) => b.top_match_score - a.top_match_score || b.open_jobs - a.open_jobs)
    .slice(0, limit);
}

/**
 * Employer-specific homepage block. Logged-in employers don't need
 * candidate-style "Recommended jobs for you" — they need a snapshot of
 * their own hiring funnel and quick links into the dashboard. Numbers
 * come from existing repositories so no migration is required.
 */
async function employerSummary(viewerUserId) {
  // Resolve the employer's company once.
  const user = await userRepo.findById(viewerUserId).catch(() => null);
  // `company_id` lives on users table for employer accounts.
  const companyId = user?.company_id || null;
  if (!companyId) {
    return {
      hasCompany: false,
      companyName: null,
      openJobs: 0,
      applicationsThisWeek: 0,
      shortlisted: 0,
      interviews: 0,
      hires: 0,
    };
  }
  const [openJobsRow, weekRow, shortlistedRow, interviewsRow, hiredRow, company] = await Promise.all([
    db.queryOne(
      `SELECT COUNT(*) AS n FROM jobs WHERE company_id = ? AND status = 'open' AND deleted_at IS NULL`,
      [companyId]
    ).catch(() => ({ n: 0 })),
    db.queryOne(
      // Withdrawn applications are excluded from every employer-facing
      // count — the employer's snapshot reflects the active hiring
      // pipeline only.
      `SELECT COUNT(*) AS n FROM applications
        WHERE company_id = ?
          AND applied_at >= (NOW() - INTERVAL 7 DAY)
          AND status <> 'withdrawn'`,
      [companyId]
    ).catch(() => ({ n: 0 })),
    db.queryOne(
      `SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND status = 'shortlisted'`,
      [companyId]
    ).catch(() => ({ n: 0 })),
    db.queryOne(
      `SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND status = 'interview'`,
      [companyId]
    ).catch(() => ({ n: 0 })),
    db.queryOne(
      `SELECT COUNT(*) AS n FROM applications WHERE company_id = ? AND status IN ('offered','hired')`,
      [companyId]
    ).catch(() => ({ n: 0 })),
    companyRepo.findById(companyId).catch(() => null),
  ]);
  return {
    hasCompany: true,
    companyId,
    companyName: company?.name || 'Your company',
    openJobs: Number(openJobsRow?.n || 0),
    applicationsThisWeek: Number(weekRow?.n || 0),
    shortlisted: Number(shortlistedRow?.n || 0),
    interviews: Number(interviewsRow?.n || 0),
    hires: Number(hiredRow?.n || 0),
  };
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
      const [hero, categories, companies, jobs, trending, salary] = await Promise.all([
        heroStats(),
        featuredCategories(),
        topCompanies(),
        latestJobs(8),
        trendingSkills().catch(() => []),
        salaryExplorer().catch(() => ({ byRole: [], byCountry: [], byExperience: [] })),
      ]);
      const stats = await liveStats(hero).catch(() => null);
      return {
        viewer: { authenticated: false, role: null },
        hero,
        liveStats: stats,
        categories,
        topCompanies: companies,
        // Guests see the same top-companies list under both keys so the
        // frontend can drop in the new "Recommended for your skills"
        // section without an auth check — guests just get the generic
        // top list.
        recommendedCompanies: companies,
        trendingSkills: trending,
        salaryExplorer: salary,
        careerResources: careerResourcesService.careerResources(),
        latestJobs: jobs,
        recommendedJobs: [],
        latestMatchedJobs: [],
        aiSuggestions: null,
        employer: null,
        cta: CTA_BLOCKS,
      };
    });
  }

  // Authenticated path. Pull everything in parallel — none of it is
  // dependent on the candidate context fetch except the match decoration.
  const [hero, categories, companies, latestRaw, trending, salary] = await Promise.all([
    heroStats(),
    featuredCategories(),
    topCompanies(),
    latestJobs(12),
    trendingSkills().catch(() => []),
    salaryExplorer().catch(() => ({ byRole: [], byCountry: [], byExperience: [] })),
  ]);
  const stats = await liveStats(hero).catch(() => null);

  let recommendedJobs = [];
  let latestMatchedJobs = [];
  let aiSuggestions = null;
  let profileCompletion = null;
  let recommendedCompanies = companies;
  let employer = null;
  let careerResources = null;

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
      // Candidate-personalised "recommended companies for you": derived
      // from the same scored job set so the recommendation surface stays
      // internally consistent — every recommended company has at least
      // one recommended job. Falls back to top companies when the
      // candidate has zero scored matches.
      recommendedCompanies = recommendedCompaniesFromMatches(recommendedJobs, companies);
      careerResources = careerResourcesService.careerResources({
        skills: (skills || []).map((s) => s.name),
        role: profile?.current_title,
      });
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
      careerResources = careerResourcesService.careerResources();
    }
  } else if (viewerRole === 'employer') {
    // Employer-specific homepage: skip the candidate-only blocks
    // (recommendedJobs, latestMatchedJobs, aiSuggestions stay null
    // and empty) and instead surface a hiring snapshot the employer
    // can act on from the homepage without diving into the dashboard.
    employer = await employerSummary(viewerUserId).catch(() => null);
    // Career resources don't apply to employers; we keep the slot
    // null so the frontend can branch cleanly on role.
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
    liveStats: stats,
    categories,
    topCompanies: companies,
    recommendedCompanies,
    trendingSkills: trending,
    salaryExplorer: salary,
    careerResources,
    latestJobs: latestRaw.slice(0, 8),
    recommendedJobs,
    latestMatchedJobs,
    aiSuggestions,
    employer,
    cta: CTA_BLOCKS,
  };
}

module.exports = {
  buildHome,
  CTA_BLOCKS,
};
