'use strict';

/**
 * Employer service
 * ----------------
 * Business logic for employer-only flows. Responsible for:
 *
 *   - Looking up the employer's company (owner_user_id or employer_profiles)
 *   - Enforcing job ownership on every mutation
 *   - Job lifecycle: create / update / soft-delete / close
 *   - Applicant pipeline: shortlist / reject / schedule interview
 *   - Cache invalidation on writes (job detail/list, dashboard stats)
 */

const companyRepo = require('../repositories/company.repository');
const employerRepo = require('../repositories/employer.repository');
const jobRepo = require('../repositories/job.repository');
const candidateRepo = require('../repositories/candidate.repository');
const appRepo = require('../repositories/application.repository');
const interviewRepo = require('../repositories/interview.repository');
const matchService = require('./match.service');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');

// Match floor for the "Matching jobs from your company" panel on the
// candidate detail page. Anything below this is hidden so the
// employer only sees postings worth reaching out about.
const MATCH_FLOOR = 60;

async function getCompanyForUser(user_id) {
  const company = await companyRepo.findByOwner(user_id);
  if (!company) throw new AppError('No company associated with this employer', 404);
  return company;
}

async function getCompanyProfile(user_id) {
  return getCompanyForUser(user_id);
}

async function updateCompanyProfile(user_id, payload) {
  const company = await getCompanyForUser(user_id);
  await companyRepo.updateById(company.id, payload);
  await cache.deleteByPattern(cache.Patterns.companiesList);
  await cache.deleteCache(cache.Keys.companyDetail(company.id));
  return companyRepo.findById(company.id);
}

async function createJob(user_id, payload) {
  const company = await getCompanyForUser(user_id);
  const { id } = await jobRepo.create({
    ...payload,
    company_id: company.id,
    posted_by_user_id: user_id,
  });
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return jobRepo.findById(id);
}

async function updateJob(user_id, jobId, payload) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.update(jobId, payload);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return jobRepo.findById(jobId);
}

async function deleteJob(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.softDelete(jobId);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return true;
}

async function closeJob(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.closeJob(jobId);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return jobRepo.findById(jobId);
}

async function listMyJobs(user_id, paging) {
  const company = await getCompanyForUser(user_id);
  return jobRepo.listByCompany(company.id, paging);
}

async function listApplicants(user_id, jobId, paging) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  return appRepo.listApplicantsForJob(jobId, paging);
}

async function shortlistApplication(user_id, applicationId) {
  const application = await appRepo.findById(applicationId);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  await appRepo.setStatus(applicationId, 'shortlisted');
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(applicationId);
}

async function rejectApplication(user_id, applicationId, reason) {
  const application = await appRepo.findById(applicationId);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  await appRepo.setStatus(applicationId, 'rejected', reason);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(applicationId);
}

async function scheduleInterview(user_id, payload) {
  const application = await appRepo.findById(payload.application_id);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  const id = await interviewRepo.create({
    application_id: payload.application_id,
    job_id: application.job_id,
    company_id: application.company_id,
    candidate_user_id: application.candidate_user_id,
    employer_user_id: user_id,
    scheduled_at: payload.scheduled_at,
    duration_minutes: payload.duration_minutes,
    mode: payload.mode,
    location: payload.location,
    meeting_url: payload.meeting_url,
    notes: payload.notes,
  });
  await appRepo.setStatus(payload.application_id, 'interview');
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return { id, ...payload };
}

async function dashboardStats(user_id) {
  const company = await getCompanyForUser(user_id);
  const key = cache.Keys.dashboardStats('employer', company.id);
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const apps = await appRepo.statsForCompany(company.id);
    const interviews = await interviewRepo.statsForCompany(company.id);
    const jobs = await jobRepo.listByCompany(company.id, { page: 1, limit: 1 });
    return {
      company: { id: company.id, name: company.name, verification_status: company.verification_status },
      applications: apps,
      interviews,
      jobs_total: jobs.total,
    };
  });
}

/**
 * "Matching jobs from your company" — used by the candidate detail
 * page when the viewer is the logged-in employer.
 *
 * Steps:
 *   1. Resolve the viewer's company (404 if they're not an owner).
 *   2. Fetch the candidate's PUBLIC profile (404 if they don't exist
 *      or have set the profile private — we don't leak existence).
 *   3. Load the candidate's full match context (skills + experience +
 *      preferences) so `match.service#scoreJob` has everything it
 *      needs.
 *   4. List the company's active, non-expired, approved jobs.
 *   5. Score each, keep only `score > MATCH_FLOOR` (60), sort desc.
 *   6. Decorate each row with the matched-skills overlap (which the
 *      match service doesn't return on its own) so the UI can show
 *      "Matched skills: …" alongside "Missing skills: …".
 *
 * Security: ownership is enforced by sourcing the company id from
 * the auth context (never the request body). A company can only see
 * its own jobs scored against any candidate they're allowed to view.
 */
async function matchingJobsForCandidate(user_id, candidateUserId) {
  const company = await getCompanyForUser(user_id);

  const candidatePublic = await candidateRepo.getPublicCandidate(Number(candidateUserId));
  if (!candidatePublic) throw new AppError('Candidate not found', 404);

  const candidate = await jobRepo.loadCandidateContext(Number(candidateUserId));
  if (!candidate) throw new AppError('Candidate not found', 404);

  // Active jobs only — `exclude_expired:true` filters past-deadline
  // postings AND inactive companies. We over-fetch (limit 100) so the
  // panel doesn't miss a strong match when a company has many roles.
  const { rows: jobs } = await jobRepo.listByCompany(company.id, {
    page: 1, limit: 100, status: 'open', exclude_expired: true,
  });
  if (jobs.length === 0) return { records: [], company_id: company.id };

  const candidateSkillsLower = new Set(
    (candidate.skills || []).map((s) => String(s.name || s).toLowerCase())
  );

  const scored = jobs.map((job) => {
    const result = matchService.scoreJob(job, candidate);
    // Compute the overlap inline — the match service exposes
    // `missing` but not the matched set. Same tokenisation /
    // case-insensitive contains logic as `pickSkillsMatch` so the
    // counts on both sides stay consistent.
    const required = String(job.skills_tags || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const matchedSkills = required.filter((r) =>
      [...candidateSkillsLower].some((h) => h === r || h.includes(r) || r.includes(h))
    );
    return {
      job_id: job.id,
      job_title: job.title,
      company_id: job.company_id,
      company_name: job.company_name,
      match_score: result.score,
      matched_skills: matchedSkills,
      missing_skills: result.missing || [],
      match_reasons: result.reasons || [],
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_currency: job.salary_currency,
      salary_period: job.salary_period,
      location: job.location || job.city || null,
      country: job.country,
      work_mode: job.work_mode,
      is_remote: !!job.is_remote,
      job_type: job.job_type,
      experience_level: job.experience_level,
      category_name: job.category_name,
      application_deadline: job.application_deadline,
    };
  })
    .filter((r) => r.match_score > MATCH_FLOOR)
    .sort((a, b) => b.match_score - a.match_score);

  return {
    company_id: company.id,
    candidate_id: Number(candidateUserId),
    floor: MATCH_FLOOR,
    records: scored,
  };
}

module.exports = {
  getCompanyProfile,
  updateCompanyProfile,
  createJob,
  updateJob,
  deleteJob,
  closeJob,
  listMyJobs,
  listApplicants,
  shortlistApplication,
  rejectApplication,
  scheduleInterview,
  dashboardStats,
  matchingJobsForCandidate,
};
