'use strict';

/**
 * savedJob service
 * ----------------
 * Candidate "save for apply later" business logic. Conceptually paired
 * with favorites but kept distinct (see migration 035 notes):
 *
 *   favorites  → interest, no expiry
 *   saved_jobs → apply-intent, expires with the job's deadline
 *
 * Why derive `expires_at` server-side: a tampered client request could
 * otherwise extend the apply window indefinitely. We snapshot the
 * deadline at save-time from the trusted `jobs.application_deadline`
 * value rather than accepting it from the caller. If the job's
 * deadline later moves, the saved row keeps the original snapshot —
 * good enough for the candidate's intent ("save this NOW").
 */

const repo = require('../repositories/savedJob.repository');
const jobRepo = require('../repositories/job.repository');
const appRepo = require('../repositories/application.repository');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');
const jobMatchService = require('./jobMatch.service');

async function save(user_id, job_id) {
  const job = await jobRepo.findById(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') {
    throw new AppError('Job is no longer accepting applications', 400);
  }

  // Snapshot deadline → expires_at. NULL = no deadline = never expires.
  const expires_at = job.application_deadline || null;

  // If the deadline is already in the past, refuse to save so the
  // dashboard never shows a row the candidate can't act on.
  if (expires_at && new Date(expires_at).getTime() < Date.now()) {
    throw new AppError('This job is past its application deadline', 400);
  }

  await repo.add(user_id, job_id, expires_at);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));

  return {
    job_id,
    saved_at: new Date().toISOString(),
    expires_at,
  };
}

async function remove(user_id, job_id) {
  const removed = await repo.remove(user_id, job_id);
  if (!removed) throw new AppError('Saved job not found', 404);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  return true;
}

/**
 * List the candidate's saved-for-later jobs, decorated with the
 * candidate's match data (June 2031 dashboard-card consistency fix).
 *
 * The shared JobCard renders its "Why we recommend this role"
 * checklist whenever the row carries `match_score` + `reasons` +
 * `missing`. The Jobs page smart-feed already supplies that triple;
 * we now do the same for saved-jobs so candidate dashboard cards on
 * /saved-jobs read identically to Jobs page cards.
 *
 * The decoration is best-effort: if the candidate context isn't
 * loadable we return the raw rows unchanged.
 */
async function list(user_id, paging) {
  const { rows, total } = await repo.list(user_id, paging);
  try {
    const candidate = await jobRepo.loadCandidateContext(user_id);
    if (candidate && Array.isArray(rows) && rows.length > 0) {
      // `filter: false` so saved-but-low-match jobs still appear —
      // the candidate explicitly opted in by saving them.
      const decorated = jobMatchService.rankJobs(rows, candidate, { filter: false });
      return { rows: decorated, total };
    }
  } catch (_e) { /* fall through with un-decorated rows */ }
  return { rows, total };
}

async function isSaved(user_id, job_id) {
  return repo.exists(user_id, job_id);
}

/**
 * Dry-run eligibility check — does NOT create an application row.
 * Reuses the same match scoring used by validate-and-apply so the
 * dashboard "Apply" button can pre-flight without a write. Returns
 * the score + decision + reasons + missing, plus a precomputed
 * `can_apply` flag for the SPA to gate the apply button on.
 */
const matchService = require('./match.service');

async function checkEligibility(user_id, job_id) {
  const job = await jobRepo.findByIdRaw(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') {
    return { can_apply: false, reason: 'closed', message: 'Job is no longer accepting applications' };
  }

  const candidate = await jobRepo.loadCandidateContext(user_id);
  if (!candidate) {
    return { can_apply: false, reason: 'profile_incomplete', message: 'Complete your profile before applying' };
  }

  const existing = await appRepo.findByJobAndCandidate(job_id, user_id);
  if (existing) {
    return { can_apply: false, reason: 'already_applied', message: 'You already applied to this job' };
  }

  const verdict = matchService.validateApplication(job, candidate);
  return {
    can_apply: verdict.allowed,
    decision: verdict.decision,
    match_score: verdict.score,
    reasons: verdict.reasons,
    missing: verdict.missing,
    gaps: verdict.gaps,
    message: verdict.message,
  };
}

module.exports = { save, remove, list, isSaved, checkEligibility };
