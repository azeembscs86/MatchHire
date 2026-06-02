'use strict';

/**
 * Candidate service
 * -----------------
 * Business logic for candidate-only flows. Responsible for:
 *
 *   - Combining profile + skills + preferences into the read model
 *   - Recomputing `profile_strength` after profile/skill changes
 *   - Job application: enforces "open" jobs only, single application per
 *     (job, candidate) pair, and increments the job's applications_count
 *   - Cache invalidation on writes (candidate detail/list, dashboard)
 */

const userRepo = require('../repositories/user.repository');
const candidateRepo = require('../repositories/candidate.repository');
const jobRepo = require('../repositories/job.repository');
const favRepo = require('../repositories/favorite.repository');
const appRepo = require('../repositories/application.repository');
const interviewRepo = require('../repositories/interview.repository');
const matchRepo = require('../repositories/match.repository');
const matchService = require('./match.service');
const jobMatchService = require('./jobMatch.service');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');
const db = require('../config/database');

async function getProfile(user_id) {
  const profile = await candidateRepo.findProfileByUserId(user_id);
  const skills = await candidateRepo.listSkills(user_id);
  const preferences = await candidateRepo.getPreferences(user_id);
  return { profile, skills, preferences };
}

/**
 * Safe-merge predicate for partial profile updates.
 *
 * Background: the frontend save handlers (Profile.jsx) historically
 * sent the FULL form on every submit — including empty strings for
 * fields the user hadn't touched. Those empties would land in the
 * `IF (k in payload)` allowlist below and overwrite saved values
 * (e.g. saving the bio would clear an unrelated `linkedin_url`).
 *
 * Rule going forward:
 *   - `undefined`  → not in payload → skipped (existing behaviour)
 *   - `null`       → SKIPPED. Treat as "not supplied" rather than
 *                    "explicit clear" — the UI never sends null on
 *                    purpose today, and clearing is rare.
 *   - `''`         → SKIPPED. Same logic; empty input rarely means
 *                    "clear", more often means "no change".
 *   - `false`, `0` → kept. Valid boolean / numeric values.
 *   - `[]`         → kept. Empty array can be a legitimate value
 *                    (e.g. languages = none).
 *
 * If we ever need a true "explicit clear" path, add a dedicated
 * mutator (`POST /candidates/profile/clear-field`) so the intent
 * is unambiguous server-side.
 */
function isMeaningfulValue(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

async function updateProfile(user_id, payload) {
  const userFields = {};
  for (const k of ['full_name', 'phone', 'avatar_url']) {
    if (k in payload && isMeaningfulValue(payload[k])) userFields[k] = payload[k];
  }
  if (Object.keys(userFields).length) await userRepo.updateById(user_id, userFields);

  const profileFields = {};
  const allowed = [
    'headline','summary','current_title','desired_role','years_experience',
    'location','country',
    'open_to_remote','work_preference','relocation_scope',
    'expected_salary_min','expected_salary_max','salary_currency','availability',
    'resume_url','portfolio_url','linkedin_url','github_url','languages','is_public',
    // Free-text education block. Repo + validator already accept it
    // (see candidate.validator.js > profileUpdate + candidate.repository.js > upsertProfile.allowed).
    'education',
  ];
  for (const k of allowed) {
    if (k in payload && isMeaningfulValue(payload[k])) profileFields[k] = payload[k];
  }

  // Derive `open_to_remote` from `relocation_scope` when the caller
  // sent the new tri-state without also explicitly sending the
  // legacy boolean. Keeps every existing read path (matching,
  // search, public profile) working without changes.
  if ('relocation_scope' in profileFields && !('open_to_remote' in profileFields)) {
    profileFields.open_to_remote = profileFields.relocation_scope !== null
      && profileFields.relocation_scope !== 'onsite_only';
  }

  if (Object.keys(profileFields).length) await candidateRepo.upsertProfile(user_id, profileFields);

  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id), cache.Keys.topCandidates());
  return getProfile(user_id);
}

/**
 * Toggle the profile's publish state. "Save Draft" sets `is_public=0`,
 * "Save & Publish" sets `is_public=1`. Splits out from updateProfile
 * so the UI can wire one button to each path without sending the
 * whole form payload.
 */
async function setPublishState(user_id, publish) {
  await candidateRepo.upsertProfile(user_id, { is_public: publish ? 1 : 0 });
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id), cache.Keys.topCandidates());
  return getProfile(user_id);
}

async function updateSkills(user_id, skills) {
  await candidateRepo.replaceSkills(user_id, skills);
  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id));
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  return candidateRepo.listSkills(user_id);
}

async function updatePreferences(user_id, preferences) {
  await candidateRepo.upsertPreferences(user_id, preferences);
  return candidateRepo.getPreferences(user_id);
}

async function recommendedJobs(user_id, limit = 10) {
  return jobRepo.recommendedForUser(user_id, limit);
}

async function addFavorite(user_id, job_id) {
  const job = await jobRepo.findById(job_id);
  if (!job) throw new AppError('Job not found', 404);
  await favRepo.add(user_id, job_id);
  return { user_id, job_id };
}

async function removeFavorite(user_id, job_id) {
  const removed = await favRepo.remove(user_id, job_id);
  if (!removed) throw new AppError('Favorite not found', 404);
  return true;
}

/**
 * Decorate a candidate's favourite jobs with personalised match
 * data (June 2031 dashboard-card consistency fix).
 *
 * The shared JobCard renders a "Why we recommend this role"
 * checklist (matched skills / missing skills) whenever it sees
 * `match_score` + `reasons` + `missing` on the row. The Jobs page
 * smart-feed already supplies that triple; favourites + saved-jobs
 * previously did not, so candidate dashboard cards looked taller-
 * or-shorter than Jobs page cards depending on surface.
 *
 * We use the existing `jobMatch.rankJobs` helper to score the
 * favourites against the candidate's loaded context. The
 * decoration is best-effort: if the candidate context isn't
 * loadable (missing profile / preferences) we hand back the raw
 * rows unchanged, exactly like the guest path.
 */
async function listFavorites(user_id, paging) {
  // `paging` accepts `{ page, limit, include_expired }`. The
  // include_expired flag lets the dashboard render the
  // "Expired favourites" filter without a second endpoint —
  // see favorite.repository.list().
  const { rows, total } = await favRepo.list(user_id, paging);
  try {
    const candidate = await jobRepo.loadCandidateContext(user_id);
    if (candidate && Array.isArray(rows) && rows.length > 0) {
      // `rankJobs` returns decorated rows preserving every field; we
      // disable filtering so favourite jobs that score below the
      // threshold still surface (the candidate explicitly opted in
      // by favouriting them).
      const decorated = jobMatchService.rankJobs(rows, candidate, { filter: false });
      return { rows: decorated, total };
    }
  } catch (_e) { /* fall through with un-decorated rows */ }
  return { rows, total };
}

async function applyToJob(user_id, job_id, payload) {
  const job = await jobRepo.findById(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') throw new AppError('Job is no longer accepting applications', 400);
  const existing = await appRepo.findByJobAndCandidate(job_id, user_id);
  if (existing) throw new AppError('You already applied to this job', 409);
  const id = await appRepo.create({
    job_id,
    candidate_user_id: user_id,
    company_id: job.company_id,
    cover_letter: payload.cover_letter,
    resume_url: payload.resume_url,
    expected_salary: payload.expected_salary,
  });
  await cache.deleteCache(cache.Keys.jobDetail(job_id));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(id);
}

/**
 * Decorate the candidate's applications (active / withdrawn /
 * rejected) with live match data so the dashboard JobCard's "Why
 * we recommend" checklist populates the same way it does on the
 * Jobs page (June 2031 dashboard-card consistency fix).
 *
 * We live-score against the candidate's current context rather
 * than pulling the historic `applications.match_score`/
 * `application_match_results` row, because:
 *
 *   - The freshly-computed score reflects the candidate's CURRENT
 *     skills/profile — most useful for "what should I improve".
 *   - The historic row exists only for applications that went
 *     through `apply-and-validate`; legacy `apply` rows lack it.
 *
 * Best-effort: if the candidate context isn't loadable, the rows
 * pass through un-decorated and the dashboard cards fall back to
 * their compact, no-match-content layout.
 */
async function listApplications(user_id, paging) {
  const { rows, total } = await appRepo.listForCandidate(user_id, paging);
  try {
    const candidate = await jobRepo.loadCandidateContext(user_id);
    if (candidate && Array.isArray(rows) && rows.length > 0) {
      // `filter: false` — applied rows must always surface,
      // regardless of their score.
      const decorated = jobMatchService.rankJobs(rows, candidate, { filter: false });
      // `rankJobs` re-sorts by score; the caller expects applied-at
      // ordering. Restore it.
      decorated.sort((a, b) => {
        const ta = a.applied_at ? new Date(a.applied_at).getTime() : 0;
        const tb = b.applied_at ? new Date(b.applied_at).getTime() : 0;
        return tb - ta;
      });
      return { rows: decorated, total };
    }
  } catch (_e) { /* fall through with un-decorated rows */ }
  return { rows, total };
}

/**
 * Application statuses a candidate is still allowed to withdraw from.
 * Once an application is terminal — already withdrawn, rejected by the
 * employer, or the candidate was hired — withdrawal is a no-op and we
 * reject it so the UI can hide the button and the API stays honest.
 */
const WITHDRAWABLE_STATUSES = new Set([
  'applied', 'reviewing', 'under_review', 'shortlisted', 'interview', 'offered',
]);

/**
 * Withdraw one of the authenticated candidate's own applications.
 *
 * Ownership is enforced here (the application must belong to the
 * caller) so a candidate can never withdraw someone else's row by
 * guessing an id. The employer side keeps full visibility of the
 * withdrawn row — we only flip the status, never delete — so the
 * company dashboard can still see that the candidate pulled out.
 */
async function withdrawApplication(user_id, application_id) {
  const application = await appRepo.findById(application_id);
  if (!application) throw new AppError('Application not found', 404);
  if (Number(application.candidate_user_id) !== Number(user_id)) {
    throw new AppError('You can only withdraw your own applications', 403);
  }
  const status = String(application.status || '').toLowerCase();
  if (status === 'withdrawn') {
    throw new AppError('This application has already been withdrawn', 409);
  }
  if (!WITHDRAWABLE_STATUSES.has(status)) {
    throw new AppError('This application can no longer be withdrawn', 409);
  }
  await appRepo.setStatus(application_id, 'withdrawn');
  // Bust the same caches apply touches so both dashboards refresh.
  await cache.deleteCache(cache.Keys.jobDetail(application.job_id));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(application_id);
}

/**
 * Career-dashboard score band: four AI-derived scores per candidate.
 *
 * Pure derivation from existing tables — no schema migration, no
 * external API. Each score is 0–100 with an attached tier label so
 * the UI can render a consistent badge style across the four tiles.
 *
 * Components
 *   profile_score        candidate_profiles.profile_strength
 *                        (already-section-weighted, kept as-is).
 *
 *   ai_match_score       Average match score across the top-10
 *                        recommendedForUser() jobs. Falls back to
 *                        null when the candidate has no skills /
 *                        no eligible jobs (UI hides the tile).
 *
 *   interview_readiness  Composite, capped 0–100:
 *                          profile_strength      × 0.40   (0–40)
 *                          primary resume on file × 20    (0/20)
 *                          portfolio items count × 5     (0–15)
 *                          applications submitted × 3    (0–15)
 *                          interviews attended × 2       (0–10)
 *                        Designed so a fully-built profile + 1
 *                        resume + 3 portfolio items + 5 apps
 *                        + 5 interviews lands at exactly 100.
 *
 *   salary_potential     % uplift between candidate's
 *                        expected_salary_min and the median
 *                        salary_max of the same scored top-10
 *                        feed. Caps at 100. Null when the
 *                        candidate hasn't set an expected salary
 *                        OR no recommendedJobs returned.
 *
 * The endpoint is cached per-user for `DASHBOARD_STATS` TTL so the
 * scoring fanout doesn't run on every dashboard mount.
 */
const SCORE_TIERS = [
  { min: 80, key: 'excellent', label: 'Excellent' },
  { min: 65, key: 'strong',    label: 'Strong' },
  { min: 50, key: 'good',      label: 'Good' },
  { min:  0, key: 'developing', label: 'Developing' },
];
function tierFor(score) {
  if (score == null || !Number.isFinite(score)) return null;
  const tier = SCORE_TIERS.find((t) => score >= t.min);
  return tier ? { key: tier.key, label: tier.label } : null;
}

async function employabilitySnapshot(user_id) {
  const key = `${cache.Keys.dashboardStats('candidate', user_id)}:employability`;
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const profile = await candidateRepo.findProfileByUserId(user_id);
    const profileScore = Math.max(0, Math.min(100, Number(profile?.profile_strength || 0)));

    // AI match score — average over top-10 recommended jobs. The
    // recommendedForUser path already runs the same match scorer
    // the apply-validate flow uses, so the average matches what
    // the candidate sees on their job cards.
    let aiMatchScore = null;
    let marketSalaryMedian = null;
    try {
      const recRes = await jobRepo.recommendedForUser(user_id, 10);
      const recRows = recRes?.rows || recRes?.records || recRes || [];
      const scores = recRows
        .map((r) => Number(r.match_score))
        .filter((s) => Number.isFinite(s));
      if (scores.length > 0) {
        aiMatchScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
      // Salary potential — median of the same job set's salary_max,
      // since those are the roles the candidate qualifies for.
      const salaryMaxes = recRows
        .map((r) => Number(r.salary_max))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      if (salaryMaxes.length > 0) {
        const mid = Math.floor(salaryMaxes.length / 2);
        marketSalaryMedian = salaryMaxes.length % 2 === 0
          ? Math.round((salaryMaxes[mid - 1] + salaryMaxes[mid]) / 2)
          : salaryMaxes[mid];
      }
    } catch (_e) { /* leave aiMatchScore null on best-effort failure */ }

    // Interview readiness components.
    const apps = await appRepo.statsForCandidate(user_id);
    const appsCount = Number(apps?.total || 0);
    const interviewsCount = Number(apps?.by_status?.interview || 0)
      + Number(apps?.by_status?.offered || 0)
      + Number(apps?.by_status?.hired || 0);
    const primaryResume = await db.queryOne(
      `SELECT 1 AS yes FROM resumes
        WHERE candidate_user_id = ? AND is_primary = 1 AND deleted_at IS NULL
        LIMIT 1`,
      [user_id]
    );
    const portfolioRow = await db.queryOne(
      `SELECT COUNT(*) AS n FROM candidate_portfolio_items
        WHERE candidate_user_id = ? AND deleted_at IS NULL`,
      [user_id]
    );
    const portfolioCount = Number(portfolioRow?.n || 0);

    const interviewReadiness = Math.min(100, Math.round(
      profileScore * 0.40
      + (primaryResume ? 20 : 0)
      + Math.min(portfolioCount, 3) * 5
      + Math.min(appsCount, 5) * 3
      + Math.min(interviewsCount, 5) * 2
    ));

    // Salary potential — % uplift the candidate could chase. If they
    // haven't set an expected salary, or no market data, return null
    // (UI hides the tile rather than showing a meaningless 0%).
    const expected = Number(profile?.expected_salary_min || 0);
    let salaryPotential = null;
    if (expected > 0 && marketSalaryMedian && marketSalaryMedian > 0) {
      const upliftPct = ((marketSalaryMedian - expected) / expected) * 100;
      salaryPotential = Math.max(0, Math.min(100, Math.round(upliftPct)));
    }

    return {
      profile_score: profileScore,
      profile_tier: tierFor(profileScore),
      ai_match_score: aiMatchScore,
      ai_match_tier: tierFor(aiMatchScore),
      interview_readiness: interviewReadiness,
      interview_readiness_tier: tierFor(interviewReadiness),
      salary_potential: salaryPotential,
      salary_potential_tier: tierFor(salaryPotential),
      // Diagnostic counts so the UI can render context tooltips
      // ("Based on N recommended roles", "5 applications") without
      // an extra request.
      meta: {
        recommended_count: aiMatchScore != null ? 10 : 0,
        applications_count: appsCount,
        interviews_count: interviewsCount,
        portfolio_count: portfolioCount,
        has_primary_resume: !!primaryResume,
        market_salary_median: marketSalaryMedian,
        expected_salary_min: expected || null,
      },
    };
  });
}

async function dashboardStats(user_id) {
  const key = cache.Keys.dashboardStats('candidate', user_id);
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const applications = await appRepo.statsForCandidate(user_id);
    const interviews = await interviewRepo.listForCandidate(user_id);
    const favs = await favRepo.list(user_id, { page: 1, limit: 5 });
    const profile = await candidateRepo.findProfileByUserId(user_id);
    return {
      applications,
      interviews: { upcoming: interviews.filter((i) => i.status === 'scheduled').slice(0, 5), total: interviews.length },
      favorites: { recent: favs.rows.slice(0, 5), total: favs.total },
      profile_strength: profile?.profile_strength || 0,
    };
  });
}

/**
 * Skill-based job matching for the authenticated candidate.
 *
 * Pulls a candidate-shaped context once, then scores every open job
 * matching the supplied filters and returns them sorted by descending
 * match score. Only returns rows above the soft threshold by default;
 * caller can override with `include_below_threshold`.
 */
async function matchJobs(user_id, payload = {}) {
  const candidate = await jobRepo.loadCandidateContext(user_id);
  if (!candidate) throw new AppError('Profile not found', 404);

  const limit = Math.min(Number(payload.limit) || 20, 50);
  const filters = {
    country: payload.country || candidate.country,
    city: payload.city || candidate.city,
    role: payload.role,
    skills: payload.skills,
    experience_level: payload.experience_level,
    job_scope: payload.job_scope || candidate.job_scope || 'hybrid',
    page: payload.page || 1,
    limit: 60, // over-fetch a little so post-scoring still has volume
    // Hide jobs the candidate has already applied to — the smart-match
    // surface is for new opportunities only.
    exclude_applied_for_user_id: user_id,
  };
  const { rows } = await jobRepo.listLocationBased(filters);
  const scored = rows
    .map((job) => ({ job, m: matchService.scoreJob(job, candidate) }))
    .sort((a, b) => b.m.score - a.m.score);
  const filtered = payload.include_below_threshold
    ? scored
    : scored.filter((r) => r.m.score >= matchService.BORDERLINE_THRESHOLD);
  const records = filtered.slice(0, limit).map(({ job, m }) => ({
    ...job,
    match_score: m.score,
    reasons: m.reasons,
    missing: m.missing,
    decision: m.decision,
  }));
  return { records };
}

/**
 * Apply-and-validate: score the candidate against the job first; if
 * the match clears the threshold create the application AND store the
 * match result, otherwise reject politely and record the attempt so
 * admins can audit it.
 */
async function applyWithValidation(user_id, job_id, payload = {}) {
  const job = await jobRepo.findByIdRaw(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') throw new AppError('Job is no longer accepting applications', 400);

  const candidate = await jobRepo.loadCandidateContext(user_id);
  if (!candidate) throw new AppError('Complete your profile before applying', 400);

  const verdict = matchService.validateApplication(job, candidate);

  if (!verdict.allowed) {
    await matchRepo.save({
      application_id: null,
      candidate_user_id: user_id,
      job_id,
      match_score: verdict.score,
      decision: 'rejected',
      reasons: verdict.reasons,
      missing: verdict.missing,
      rejection_message: verdict.message,
    });
    return {
      accepted: false,
      decision: 'rejected',
      match_score: verdict.score,
      reasons: verdict.reasons,
      missing: verdict.missing,
      message: verdict.message,
    };
  }

  // Soft-accept / accept paths still create the application; the
  // employer dashboard sees the match score next to it.
  const existing = await appRepo.findByJobAndCandidate(job_id, user_id);
  if (existing) throw new AppError('You already applied to this job', 409);

  const application_id = await appRepo.create({
    job_id,
    candidate_user_id: user_id,
    company_id: job.company_id,
    cover_letter: payload.cover_letter || null,
    resume_url: payload.resume_url || null,
    expected_salary: payload.expected_salary ?? null,
  });
  await db.getPool().execute(
    `UPDATE applications SET match_score = ? WHERE id = ?`,
    [verdict.score, application_id]
  );
  await matchRepo.save({
    application_id,
    candidate_user_id: user_id,
    job_id,
    match_score: verdict.score,
    decision: verdict.decision,
    reasons: verdict.reasons,
    missing: verdict.missing,
  });
  await cache.deleteCache(cache.Keys.jobDetail(job_id));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));

  return {
    accepted: true,
    decision: verdict.decision,
    match_score: verdict.score,
    reasons: verdict.reasons,
    missing: verdict.missing,
    application_id,
  };
}

const SIMILARITY_FLOOR = 50;

/**
 * "Similar Professionals" — AI-ranked feed of other candidates that
 * share the logged-in candidate's skills / role / experience band.
 * Powers the Candidate-role branch of the Candidates discovery page,
 * replacing the generic candidate browse.
 *
 * Pipeline (no N+1):
 *   1. Load my candidate context.
 *   2. SQL prefilter to public candidates whose listed skills
 *      overlap any of mine (capped at 500).
 *   3. Bulk-load profile + skills for the pool in 2 queries.
 *   4. Score each via `matchService.candidateSimilarity`, drop
 *      anything <= 50%, sort highest first.
 *
 * Returns rich rows (matched_skills, skills_they_have,
 * skills_you_have, experience_comparison) so the UI can render
 * the "Profile Comparison" section without a second round-trip.
 */
async function similarCandidates(user_id, { limit = 50 } = {}) {
  const me = await jobRepo.loadCandidateContext(user_id);
  if (!me) throw new AppError('Candidate profile not found', 404);

  const mySkillsLower = (me.skills || [])
    .map((s) => String(s.name || s).toLowerCase()).filter(Boolean);
  if (mySkillsLower.length === 0) {
    return { floor: SIMILARITY_FLOOR, total: 0, records: [] };
  }

  // Prefilter: other public candidates with any overlapping skill.
  const placeholders = mySkillsLower.map(() => '?').join(',');
  const idRows = await db.query(
    `SELECT DISTINCT cs.candidate_user_id
     FROM candidate_skills cs
     INNER JOIN skills s ON s.id = cs.skill_id
     INNER JOIN users u ON u.id = cs.candidate_user_id
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE LOWER(s.name) IN (${placeholders})
       AND u.id <> ?
       AND u.role = 'candidate'
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND cp.is_public = 1
     LIMIT 500`,
    [...mySkillsLower, user_id]
  );
  const ids = idRows.map((r) => Number(r.candidate_user_id));
  if (ids.length === 0) {
    return { floor: SIMILARITY_FLOOR, total: 0, records: [] };
  }

  // Bulk-load profile + skills for the prefiltered pool.
  const idPh = ids.map(() => '?').join(',');
  const [profiles, skillRows] = await Promise.all([
    db.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.created_at,
              cp.headline, cp.summary, cp.current_title, cp.years_experience,
              cp.location, cp.country, cp.open_to_remote, cp.profile_strength
       FROM users u
       INNER JOIN candidate_profiles cp ON cp.user_id = u.id
       WHERE u.id IN (${idPh})`,
      ids
    ),
    db.query(
      `SELECT cs.candidate_user_id, s.name
       FROM candidate_skills cs
       INNER JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_user_id IN (${idPh})`,
      ids
    ),
  ]);

  const skillByUser = new Map();
  for (const r of skillRows) {
    const arr = skillByUser.get(r.candidate_user_id) || [];
    arr.push({ name: r.name });
    skillByUser.set(r.candidate_user_id, arr);
  }

  const scored = profiles.map((p) => {
    const them = { ...p, skills: skillByUser.get(p.id) || [] };
    const sim = matchService.candidateSimilarity(me, them);
    if (sim.score <= SIMILARITY_FLOOR) return null;
    return {
      candidate_id: p.id,
      name: p.full_name,
      profile_image: p.avatar_url,
      current_title: p.current_title || p.headline || null,
      current_company: null, // not in candidate_profiles schema today
      experience_years: p.years_experience != null ? Number(p.years_experience) : null,
      location: p.location || p.country || null,
      skills: (skillByUser.get(p.id) || []).map((s) => s.name),
      professional_summary_short: (p.summary || '').slice(0, 220) || null,
      similarity_score: sim.score,
      matched_skills: sim.matched_skills,
      skills_they_have: sim.skills_they_have,
      skills_you_have: sim.skills_you_have,
      experience_comparison: sim.experience_comparison,
    };
  }).filter(Boolean);

  scored.sort((a, b) => b.similarity_score - a.similarity_score);
  return {
    floor: SIMILARITY_FLOOR,
    total: scored.length,
    records: scored.slice(0, limit),
  };
}

/**
 * Candidate-to-candidate professional message. Persisted only when
 * the body passes the content filter. The recipient must currently
 * appear in the sender's similarity feed (>50%) — we re-score on
 * send to avoid trusting a stale client-side check.
 */
async function sendCandidateMessage(senderUserId, recipientUserId, { subject = null, body }) {
  if (Number(senderUserId) === Number(recipientUserId)) {
    throw new AppError('You can\'t message yourself.', 400);
  }

  // Content gate FIRST so a clearly-inappropriate body short-
  // circuits without loading both profiles.
  const verdict = matchService.validateProfessionalMessage(body);
  if (!verdict.ok) {
    const err = new AppError(verdict.message, 422);
    err.reason = verdict.reason;
    throw err;
  }

  // Similarity gate — load both contexts and rescore.
  const me = await jobRepo.loadCandidateContext(Number(senderUserId));
  const them = await jobRepo.loadCandidateContext(Number(recipientUserId));
  if (!me || !them) throw new AppError('Candidate not found', 404);

  // Recipient must be a public, active candidate.
  const recipientRow = await db.queryOne(
    `SELECT u.id, u.role, u.status, cp.is_public
     FROM users u INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [Number(recipientUserId)]
  );
  if (!recipientRow || recipientRow.role !== 'candidate'
      || recipientRow.status !== 'active' || !recipientRow.is_public) {
    throw new AppError('Recipient not available for messaging.', 404);
  }

  const sim = matchService.candidateSimilarity(me, them);
  if (sim.score <= SIMILARITY_FLOOR) {
    throw new AppError(
      'You can only message candidates whose profile is similar to yours (above 50%).',
      403
    );
  }

  const trimmedSubject = subject ? String(subject).slice(0, 200) : null;
  const trimmedBody = String(body).slice(0, 4000);

  const [res] = await db.getPool().execute(
    `INSERT INTO candidate_messages
       (sender_user_id, recipient_user_id, subject, body, similarity_score)
     VALUES (?, ?, ?, ?, ?)`,
    [Number(senderUserId), Number(recipientUserId), trimmedSubject, trimmedBody, sim.score]
  );

  return {
    message_id: res.insertId,
    similarity_score: sim.score,
    sent_at: new Date().toISOString(),
  };
}

module.exports = {
  getProfile,
  updateProfile,
  setPublishState,
  updateSkills,
  updatePreferences,
  recommendedJobs,
  addFavorite,
  removeFavorite,
  listFavorites,
  applyToJob,
  applyWithValidation,
  listApplications,
  withdrawApplication,
  dashboardStats,
  employabilitySnapshot,
  matchJobs,
  similarCandidates,
  sendCandidateMessage,
};
