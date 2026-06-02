'use strict';

/**
 * Home / Jobs (smart matching) controller
 * ---------------------------------------
 * HTTP boundary for the personalised home + jobs feed surface:
 *
 *   GET  /home               -> service.buildHome
 *   GET  /jobs               -> service.smartJobsList
 *   GET  /jobs/recommended   -> service.recommendedJobs
 *   GET  /jobs/:id           -> service.smartJobDetail
 *
 * Every route is `optionalAuth`. When the caller is a candidate the
 * payload is decorated with match% / matched skills / AI labels. When
 * the caller is a guest the original "latest active jobs" surface is
 * returned untouched — no personalisation applied (per product spec).
 */

const homeService = require('../services/home.service');
const jobMatch = require('../services/jobMatch.service');
const jobRepo = require('../repositories/job.repository');
const publicService = require('../services/public.service');
const response = require('../utils/response.helper');
const AppError = require('../utils/AppError');
const { buildPagination } = require('../utils/pagination');

/* ============================================================================
 * GET /home
 * ========================================================================== */

exports.home = async (req, res) => {
  const userId = req.user?.id || null;
  const role = req.user?.role || null;
  const data = await homeService.buildHome(userId, role);
  return response.success(res, data, 'Home payload returned');
};

/* ============================================================================
 * GET /jobs
 *
 * For guests:    forwards to the public listing (cached) and returns the
 *                paginated records as-is.
 * For candidates: returns ONLY jobs that exceed the personalised match
 *                threshold (default 40%), ranked by match% descending.
 * ========================================================================== */

exports.listJobs = async (req, res) => {
  const userId = req.user?.id || null;
  const role = req.user?.role || null;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  // Guests + non-candidate roles still see the standard jobs list.
  if (!userId || role !== 'candidate') {
    const data = await publicService.listJobs({ ...req.query, page, limit });
    return response.list(res, data.records, data.pagination, 'Jobs returned');
  }

  // Candidate path — over-fetch so threshold filtering still leaves
  // enough material for the requested page size.
  const candidate = await jobRepo.loadCandidateContext(userId);
  if (!candidate) {
    return response.success(res, {
      records: [],
      pagination: buildPagination(page, limit, 0),
      profileIncomplete: true,
      message: 'Complete your profile and add your skills to get better job recommendations.',
    }, 'No matched jobs');
  }

  // Pull a candidate-shaped pool (location-aware) and overlay user filters.
  // Every sidebar filter the Jobs page exposes is forwarded here so the
  // candidate path produces the same shape of results as the guest path
  // (listPublic) for the same query string.
  const oversample = Math.min(Math.max(limit * 4, 60), 200);
  const { rows } = await jobRepo.listLocationBased({
    country: req.query.location || candidate.country,
    city: candidate.city,
    role: req.query.keyword || undefined,
    experience_level: req.query.experience_level || undefined,
    skills: req.query.skills || undefined,
    job_type: req.query.job_type || undefined,
    work_mode: req.query.work_mode || undefined,
    remote: req.query.remote, // legacy alias; parseBoolish in the repo
    salary_min: req.query.salary_min,
    salary_max: req.query.salary_max,
    posted_within_days: req.query.posted_within_days ?? req.query.posted_within,
    verified_only: req.query.verified_only,
    job_scope: candidate.job_scope || 'hybrid',
    page: 1,
    limit: oversample,
  });

  const ranked = jobMatch.rankJobs(rows, candidate, {
    filter: req.query.include_below_threshold ? false : true,
    threshold: req.query.threshold != null ? Number(req.query.threshold) : jobMatch.LOGGED_IN_THRESHOLD,
  });

  // Manual pagination over the ranked list so the response shape matches
  // every other list endpoint in the codebase.
  const total = ranked.length;
  const start = (page - 1) * limit;
  const records = ranked.slice(start, start + limit);
  return response.list(res, records, buildPagination(page, limit, total), 'Personalised jobs returned');
};

/* ============================================================================
 * GET /jobs/recommended
 * ========================================================================== */

exports.recommendedJobs = async (req, res) => {
  const userId = req.user?.id || null;
  const role = req.user?.role || null;
  const limit = Math.min(Number(req.query.limit) || 12, 50);

  // Guests fall through to the existing featured/latest job feed so the
  // section is never empty. The frontend uses `personalised: false` to
  // hide the AI-specific copy.
  if (!userId || role !== 'candidate') {
    const data = await publicService.listJobs({ page: 1, limit, sort: 'featured' });
    return response.success(res, {
      personalised: false,
      records: data.records,
      message: 'Sign in as a candidate to see personalised matches.',
    }, 'Latest jobs');
  }

  const { records, candidateMissing } = await jobMatch.recommendedFor(userId, { limit });
  if (candidateMissing) {
    return response.success(res, {
      personalised: false,
      records: [],
      profileIncomplete: true,
      message: 'Please add your skills to see personalised job recommendations.',
    }, 'No matched jobs');
  }
  return response.success(res, {
    personalised: true,
    records,
    message: records.length
      ? null
      : 'No strong matches found yet. Add more skills or update your profile to improve recommendations.',
  }, 'Recommended jobs returned');
};

/* ============================================================================
 * GET /jobs/:id
 * ========================================================================== */

exports.getJob = async (req, res) => {
  const id = Number(req.params.id);
  const job = await publicService.getJob(id);
  if (!job) throw new AppError('Job not found', 404);
  const userId = req.user?.id || null;
  const decorated = await jobMatch.decorateOne(job, userId);
  return response.success(res, decorated, 'Job detail returned');
};
