'use strict';

/**
 * Public service
 * --------------
 * Read-through caching layer for the unauthenticated surface area.
 *
 * Pattern used everywhere:
 *
 *   const data = await cache.rememberCache(key, ttl, () => repository.lookup(...));
 *
 * If Redis is up, the value is stored under a namespaced key (see
 * `cache.helper.js > Keys`). If Redis is unavailable, `rememberCache` simply
 * calls the loader every time - the API stays functional without caching.
 */

const jobRepo = require('../repositories/job.repository');
const companyRepo = require('../repositories/company.repository');
const candidateRepo = require('../repositories/candidate.repository');
const candidateExperienceRepo = require('../repositories/candidateExperience.repository');
const candidatePortfolioRepo = require('../repositories/candidatePortfolio.repository');
const metaRepo = require('../repositories/meta.repository');
const matchService = require('./match.service');
const cache = require('../cache/cache.helper');
const { buildPagination } = require('../utils/pagination');
const AppError = require('../utils/AppError');
const db = require('../config/database');
const appRepo = require('../repositories/application.repository');
const favRepo = require('../repositories/favorite.repository');
const savedJobRepo = require('../repositories/savedJob.repository');

function queryString(obj) {
  const entries = Object.entries(obj || {})
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  entries.sort();
  return entries.join('&');
}

async function listJobs(filters) {
  const key = cache.Keys.jobsList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.JOBS_LIST, async () => {
    const { rows, total } = await jobRepo.listPublic(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

async function getJob(id, viewerUserId = null) {
  const key = cache.Keys.jobDetail(id);
  const cached = await cache.getCache(key);
  let job;
  if (cached) {
    job = cached;
  } else {
    job = await jobRepo.findById(id);
    if (!job || job.status === 'archived') throw new AppError('Job not found', 404);
    await cache.setCache(key, job, cache.TTL.JOB_DETAIL);
  }
  await jobRepo.incrementViews(id);

  // Decorate with the candidate's relationship to this job so the
  // detail page can render the right action state (Apply vs Already
  // Applied vs Withdraw vs Reapply) without a second round-trip.
  // These flags are NEVER cached — they're per-viewer and cheap to
  // compute.
  //
  // Semantics of `is_applied` (Step-2 refinement):
  //   - Only TRUE when the candidate's existing application is in an
  //     ACTIVE status (anything other than `withdrawn` / `rejected`).
  //   - After a candidate withdraws, the row still exists but
  //     `is_applied` returns FALSE so the Apply button can come back
  //     and the candidate can reapply. The `application_id` and
  //     `application_status` fields stay populated so the UI can
  //     still show "Previously withdrawn — Reapply" copy if desired.
  let viewer = {
    is_applied: false,
    is_favorited: false,
    is_saved_for_later: false,
    application_id: null,
    application_status: null,
    rejection_reason: null,
    application_updated_at: null,
  };
  const deadline = job.application_deadline ? new Date(job.application_deadline).getTime() : null;
  const isExpired = deadline != null && deadline < Date.now();
  if (viewerUserId) {
    const [applied, fav, saved] = await Promise.all([
      appRepo.findByJobAndCandidate(id, viewerUserId),
      favRepo.exists(viewerUserId, id),
      savedJobRepo.exists(viewerUserId, id),
    ]);
    const status = applied?.status ? String(applied.status).toLowerCase() : null;
    const isActive = !!applied && status !== 'withdrawn' && status !== 'rejected';
    viewer = {
      is_applied: isActive,
      is_favorited: !!fav,
      is_saved_for_later: !!saved,
      application_id: applied?.id || null,
      application_status: status,
      // rejection_reason + application_updated_at are surfaced only
      // when the row exists in a rejected state. Job Detail uses
      // them to render the rejection panel that used to sit beside
      // the card on My Applications / Rejected tabs.
      rejection_reason: status === 'rejected' ? (applied?.rejection_reason || null) : null,
      application_updated_at: status === 'rejected' ? (applied?.updated_at || null) : null,
    };
  }
  return { ...job, ...viewer, is_expired: isExpired };
}

/**
 * "Recommended Jobs for You" rail on the Job Detail page. Combines
 * the anchor job's category/skills with the candidate's own skills
 * (when present) so signed-in candidates get personalised picks while
 * guests still see relevant similar postings.
 */
async function similarJobs(anchorJobId, viewerUserId = null, limit = 6) {
  const rows = await jobRepo.findSimilar(anchorJobId, {
    candidate_user_id: viewerUserId || undefined,
    limit,
  });
  // Decorate with a normalised matchPercentage when a candidate is
  // logged in. We don't run the full match.service here (too heavy
  // for a 6-item rail) — just expose the score for the badge.
  return rows;
}

async function listCompanies(filters) {
  const key = cache.Keys.companiesList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.COMPANIES_LIST, async () => {
    const { rows, total } = await companyRepo.listPublic(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

async function getCompany(id) {
  const key = cache.Keys.companyDetail(id);
  const cached = await cache.getCache(key);
  if (cached) return cached;
  const company = await companyRepo.publicDetail(id);
  if (!company) throw new AppError('Company not found', 404);
  // Public company detail — candidates should only see jobs they can
  // still apply to. `exclude_expired:true` makes `listByCompany` filter
  // out closed-deadline / paused-company postings without affecting the
  // employer-management surface (which calls the same function without
  // the flag and still sees everything).
  const jobs = await jobRepo.listByCompany(id, {
    page: 1, limit: 10, status: 'open', exclude_expired: true,
  });
  const data = { ...company, jobs: jobs.rows };
  await cache.setCache(key, data, cache.TTL.COMPANY_DETAIL);
  return data;
}

async function listCandidates(filters) {
  const key = cache.Keys.candidatesList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.CANDIDATES_LIST, async () => {
    const { rows, total } = await candidateRepo.listPublicCandidates(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

/**
 * Public candidate detail. Returns the same anonymous payload for
 * guests and candidates; **adds** the contact email when the viewer
 * is an authenticated employer (so the "Contact" CTA on the detail
 * hero can open mailto). The viewer-specific decoration is applied
 * AFTER the cache lookup so the anonymous body stays cacheable.
 */
async function getCandidate(id, viewer = null) {
  const key = cache.Keys.candidateDetail(id);
  let data = await cache.getCache(key);
  if (!data) {
    const candidate = await candidateRepo.getPublicCandidate(id);
    if (!candidate) throw new AppError('Candidate not found', 404);
    const experiences = await candidateExperienceRepo.listForUser(id).catch(() => []);
    data = { ...candidate, experiences };
    await cache.setCache(key, data, cache.TTL.CANDIDATE_DETAIL);
  }
  // Work Portfolio & Achievements — visibility filtered per
  // viewer. Guests see public-only; employers also see
  // companies_only; the candidate themselves sees everything.
  // Fetched fresh (not part of the cached blob) so visibility
  // can't bleed across viewer roles.
  const selfView = !!viewer && Number(viewer.id) === Number(id);
  const portfolio = await candidatePortfolioRepo.listForViewer(Number(id), {
    viewerRole: viewer?.role || null,
    selfView,
  }).catch(() => []);

  // Layer per-viewer fields on top of the cached anonymous payload.
  // Email + has_resume are exposed ONLY to employer viewers — the
  // auth context is the gate, never the request body — and are
  // fetched fresh because the cached blob deliberately doesn't
  // carry them. `has_resume` lets the frontend decide whether to
  // render the "Download resume" CTA without probing a separate
  // endpoint and getting a 404.
  if (viewer?.role === 'employer') {
    const [row, resume] = await Promise.all([
      db.queryOne(`SELECT email FROM users WHERE id = ? LIMIT 1`, [Number(id)]),
      // `has_resume` is true ONLY when the candidate has promoted
      // an upload to primary — secondary uploads stay private and
      // the employer download endpoint refuses to serve them.
      // Aligning this flag with the download contract means the
      // button never appears for a candidate whose download would
      // fail with "Primary resume is not available."
      db.queryOne(
        `SELECT 1 AS one FROM resumes
         WHERE candidate_user_id = ? AND is_primary = 1 AND deleted_at IS NULL
         LIMIT 1`,
        [Number(id)]
      ),
    ]);
    return { ...data, email: row?.email || null, has_resume: !!resume, portfolio };
  }
  return { ...data, portfolio };
}

async function categories() {
  return cache.rememberCache(cache.Keys.categories(), cache.TTL.CATEGORIES, () => metaRepo.listCategories());
}

async function skills() {
  return cache.rememberCache(cache.Keys.skills(), cache.TTL.SKILLS, () => metaRepo.listSkills());
}

async function topCandidates(limit = 8) {
  return cache.rememberCache(cache.Keys.topCandidates(), cache.TTL.CANDIDATES_LIST, () => candidateRepo.topCandidates(limit));
}

/**
 * Dynamic, role-aware navigation menu.
 *
 * Returned shape:
 *
 *   {
 *     primary: [ { key, label, to, end? } ],
 *     actions: [ { key, label, kind: 'auth-signin' | 'auth-signup' | 'logout' | 'link', to? } ],
 *     dashboard: { label, to } | null,
 *     user: { id, full_name, role } | null
 *   }
 *
 * Visibility rules (matches the project spec):
 *   - Anonymous          - Home, Jobs, Companies, Candidates + Sign in / Join free
 *   - Candidate          - + My Profile, Preferences + Candidate Dashboard
 *   - Employer           - same as anonymous + Company Dashboard (via dropdown)
 *   - Admin/Super admin  - same as anonymous + Admin Dashboard (via dropdown)
 *
 * Favourites is intentionally absent from the top header — candidates
 * reach it from the Candidate Dashboard sidebar (♥ Favourites row).
 * Role-specific destinations (Company Profile, Job Postings, Admin
 * Console) live in the dashboard dropdown rather than the primary
 * nav, keeping the marketplace links uniform across roles.
 *
 * Computed on the fly (not cached) because the payload depends on the
 * bearer token; the body is small (sub-1KB) and easy to regenerate.
 */
function navigation(user) {
  const primary = [
    { key: 'home', label: 'Home', to: '/', end: true },
    { key: 'jobs', label: 'Jobs', to: '/jobs' },
    { key: 'companies', label: 'Companies', to: '/companies' },
    { key: 'candidates', label: 'Candidates', to: '/candidates' },
  ];

  const role = user?.role || null;

  if (role === 'candidate') {
    primary.push(
      { key: 'profile', label: 'My Profile', to: '/profile' },
      { key: 'preferences', label: 'Preferences', to: '/preferences' },
    );
  }

  let dashboard = null;
  if (role === 'candidate') dashboard = { label: 'Candidate Dashboard', to: '/dashboard/candidate' };
  else if (role === 'employer') dashboard = { label: 'Company Dashboard', to: '/dashboard/company' };
  else if (role === 'admin' || role === 'super_admin') dashboard = { label: 'Admin Dashboard', to: '/dashboard/admin' };

  const actions = user
    ? [{ key: 'logout', label: 'Sign out', kind: 'logout' }]
    : [
        { key: 'signin', label: 'Sign in', kind: 'auth-signin' },
        { key: 'signup', label: 'Join free', kind: 'auth-signup' },
      ];

  return {
    primary,
    actions,
    dashboard,
    user: user ? { id: user.id, full_name: user.full_name, role: user.role } : null,
  };
}

/**
 * Location-based job listing. Sorts by city > country > global remote
 * and decorates every row with a `match_score` + reason tags so the
 * frontend can render the badges without making a second request.
 */
async function locationBasedJobs(filters, viewerUserId) {
  const { rows, total } = await jobRepo.listLocationBased(filters);
  let candidate = null;
  if (viewerUserId) {
    candidate = await jobRepo.loadCandidateContext(viewerUserId);
  }
  const decorated = rows.map((job) => {
    if (!candidate) return { ...job, match_score: null, reasons: [], missing: [] };
    const res = matchService.scoreJob(job, candidate);
    return { ...job, match_score: res.score, reasons: res.reasons, missing: res.missing };
  });
  return { records: decorated, pagination: buildPagination(filters.page || 1, filters.limit || 20, total) };
}

/** Country / city lookup tables for the frontend pickers. */
async function listCountries() {
  return db.query(`SELECT id, code, name, continent, currency FROM countries WHERE is_active = 1 ORDER BY name ASC`);
}
async function listCities(country_id) {
  if (!country_id) return [];
  return db.query(
    `SELECT id, country_id, name, slug, timezone, latitude, longitude
     FROM cities WHERE country_id = ? AND is_active = 1 ORDER BY name ASC`,
    [Number(country_id)]
  );
}

module.exports = {
  listJobs,
  getJob,
  similarJobs,
  listCompanies,
  getCompany,
  listCandidates,
  getCandidate,
  categories,
  skills,
  topCandidates,
  navigation,
  locationBasedJobs,
  listCountries,
  listCities,
};
