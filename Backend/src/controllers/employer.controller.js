'use strict';

/**
 * Employer controller
 * -------------------
 * HTTP boundary for the `/api/v1/employers` namespace. Controllers handle
 * request/response shape only; the business logic (ownership checks, status
 * transitions, cache invalidation) is in `services/employer.service.js`.
 *
 * Project rule: every authenticated employer endpoint is POST. List filters
 * therefore arrive on `req.body`.
 */

const service = require('../services/employer.service');
const response = require('../utils/response.helper');
const { buildPagination } = require('../utils/pagination');

/** Read the employer's own company profile. */
exports.getCompanyProfile = async (req, res) => {
  const data = await service.getCompanyProfile(req.user.id);
  return response.success(res, data, 'Company profile fetched');
};

/** Update the employer's own company profile and invalidate company caches. */
exports.updateCompanyProfile = async (req, res) => {
  const data = await service.updateCompanyProfile(req.user.id, req.body);
  return response.success(res, data, 'Company profile updated');
};

/** Create a new job posting for the employer's company. */
exports.createJob = async (req, res) => {
  const data = await service.createJob(req.user.id, req.body);
  return response.created(res, data, 'Job created');
};

/** Update an existing job (only when the employer owns the parent company). */
exports.updateJob = async (req, res) => {
  const data = await service.updateJob(req.user.id, Number(req.params.jobId), req.body);
  return response.success(res, data, 'Job updated');
};

/** Soft-delete a job (status → archived, deleted_at set). */
exports.deleteJob = async (req, res) => {
  await service.deleteJob(req.user.id, Number(req.params.jobId));
  return response.success(res, {}, 'Job deleted');
};

/** Close a job to new applications. */
exports.closeJob = async (req, res) => {
  const data = await service.closeJob(req.user.id, Number(req.params.jobId));
  return response.success(res, data, 'Job closed');
};

/** Paginated list of jobs posted by the employer's company. */
exports.listMyJobs = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listMyJobs(req.user.id, { page, limit, status: req.body?.status });
  return response.list(res, rows, buildPagination(page, limit, total), 'Jobs returned');
};

/** Paginated list of applicants on a specific job (employer must own it). */
exports.listApplicants = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listApplicants(req.user.id, Number(req.params.jobId), {
    page, limit, status: req.body?.status,
  });
  return response.list(res, rows, buildPagination(page, limit, total), 'Applicants returned');
};

/** Move an application to "shortlisted" status. */
exports.shortlistApplication = async (req, res) => {
  const data = await service.shortlistApplication(req.user.id, Number(req.params.applicationId));
  return response.success(res, data, 'Application shortlisted');
};

/**
 * AI bulk shortlist: flip every actionable applicant for the given
 * job to status='shortlisted' when their match score >= 60%. Idempotent
 * — already-decided rows (shortlisted / interview / offered / hired /
 * rejected / withdrawn) are skipped, so re-running the action never
 * undoes a manual decision.
 *
 * Ownership is enforced inside `service.autoShortlistApplicants()` via
 * `jobRepo.ownsJob()`. The response carries a small summary the UI
 * uses to render its post-action toast.
 */
exports.autoShortlistApplicants = async (req, res) => {
  const data = await service.autoShortlistApplicants(req.user.id, Number(req.params.jobId));
  return response.success(res, data, 'AI shortlist complete');
};

/**
 * Reject an application with a mandatory canonical reason.
 *
 * The validator has already enforced that:
 *   - `reason` is one of REJECTION_REASON_KEYS
 *   - `custom_reason` is present when `reason === 'other'`
 *
 * Persistence format on `applications.rejection_reason` (VARCHAR(500)):
 *   - Canonical keys → stored as the key itself, e.g. "skills_mismatch"
 *   - "other" branch → stored as "other:<custom text>" so the
 *     candidate-supplied text survives without a schema change.
 *
 * The candidate-side renderer (CandidateApplications.jsx) parses this
 * format, looks up the human-readable label for canonical keys, and
 * surfaces the custom text verbatim for "other". Improvement
 * suggestions are derived from the canonical key on the frontend.
 */
exports.rejectApplication = async (req, res) => {
  const reasonKey = String(req.body?.reason || '').trim();
  const customReason = String(req.body?.custom_reason || '').trim();
  const stored = reasonKey === 'other' && customReason
    ? `other:${customReason}`
    : reasonKey;
  const data = await service.rejectApplication(req.user.id, Number(req.params.applicationId), stored);
  return response.success(res, data, 'Application rejected');
};

/** Schedule an interview for an application; flips the application to `interview`. */
exports.scheduleInterview = async (req, res) => {
  const data = await service.scheduleInterview(req.user.id, req.body);
  return response.created(res, data, 'Interview scheduled');
};

/** Aggregated dashboard stats for the employer's company. */
exports.dashboardStats = async (req, res) => {
  const data = await service.dashboardStats(req.user.id);
  return response.success(res, data, 'Dashboard stats returned');
};

/**
 * Resume download for an employer viewer. Returns a short-lived
 * signed URL pointing at the candidate's primary (or most recent)
 * resume file. Authorisation:
 *
 *   - `requireEmployer` at the route layer enforces role=employer.
 *   - The service enforces the candidate's `is_public` gate and
 *     404s when the candidate has no resume on file.
 *
 * The storage path itself is never returned — only the signed URL,
 * which the browser hits directly to stream the file.
 */
exports.downloadCandidateResume = async (req, res) => {
  const resumeService = require('../services/resume.service');
  const data = await resumeService.signedDownloadForEmployer(
    req.user.id,
    Number(req.params.candidateId)
  );
  return response.success(res, data, 'Resume download URL returned');
};

/**
 * AI-ranked candidates that match this employer's active jobs above
 * the 50% floor. Replaces the generic candidate browse for company
 * viewers — they don't see the public candidate list anymore, just
 * the slice that's relevant to what they're hiring for.
 */
exports.recommendedCandidates = async (req, res) => {
  const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 100);
  const data = await service.recommendedCandidates(req.user.id, { limit });
  return response.success(res, data, 'Recommended candidates returned');
};

/**
 * Matching jobs for a candidate, scoped to the logged-in employer's
 * company. Powers the "Matching jobs from your company" panel on the
 * candidate detail page. Returns only jobs with match score > 60.
 */
exports.matchingJobsForCandidate = async (req, res) => {
  const data = await service.matchingJobsForCandidate(
    req.user.id,
    Number(req.params.candidateId)
  );
  return response.success(res, data, 'Matching jobs returned');
};
