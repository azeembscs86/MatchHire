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

/** Reject an application; optional `reason` stored for the audit trail. */
exports.rejectApplication = async (req, res) => {
  const data = await service.rejectApplication(req.user.id, Number(req.params.applicationId), req.body?.reason);
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
