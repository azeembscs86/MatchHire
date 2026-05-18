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
const jobIndexer = require('../indexers/job.indexer');
const employerRepo = require('../repositories/employer.repository');
const jobRepo = require('../repositories/job.repository');
const appRepo = require('../repositories/application.repository');
const interviewRepo = require('../repositories/interview.repository');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');

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
  // Push to ES (best-effort - logs and returns on failure).
  jobIndexer.indexJob(id).catch(() => {});
  return jobRepo.findById(id);
}

async function updateJob(user_id, jobId, payload) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.update(jobId, payload);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  jobIndexer.indexJob(jobId).catch(() => {});
  return jobRepo.findById(jobId);
}

async function deleteJob(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.softDelete(jobId);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  jobIndexer.removeJob(jobId).catch(() => {});
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
};
