'use strict';

/**
 * Candidate controller
 * --------------------
 * HTTP boundary for the `/api/v1/candidates` namespace. Controllers only
 * translate between the request and the service layer; all business rules
 * live in `services/candidate.service.js`.
 *
 * Project rule: every authenticated candidate endpoint is exposed as POST,
 * so pagination/filters arrive in `req.body` rather than `req.query`.
 */

const service = require('../services/candidate.service');
const response = require('../utils/response.helper');
const { buildPagination } = require('../utils/pagination');

/** GET-style read of the current candidate's profile (POST per project rule). */
exports.getProfile = async (req, res) => {
  const data = await service.getProfile(req.user.id);
  return response.success(res, data, 'Profile fetched successfully');
};

/** Patch the candidate profile + linked user fields. */
exports.updateProfile = async (req, res) => {
  const data = await service.updateProfile(req.user.id, req.body);
  return response.success(res, data, 'Profile updated successfully');
};

/** Replace the full set of candidate skills (idempotent). */
exports.updateSkills = async (req, res) => {
  const data = await service.updateSkills(req.user.id, req.body.skills);
  return response.success(res, { skills: data }, 'Skills updated successfully');
};

/** Upsert candidate job preferences (titles, locations, salary range, etc). */
exports.updatePreferences = async (req, res) => {
  const data = await service.updatePreferences(req.user.id, req.body);
  return response.success(res, data, 'Preferences saved');
};

/** Personalized job recommendations based on profile, skills, and preferences. */
exports.recommendedJobs = async (req, res) => {
  const limit = req.body?.limit || 10;
  const data = await service.recommendedJobs(req.user.id, limit);
  return response.list(res, data, null, 'Recommended jobs');
};

/** Add a job to the candidate's favorites list (idempotent). */
exports.addFavorite = async (req, res) => {
  const data = await service.addFavorite(req.user.id, Number(req.params.jobId));
  return response.created(res, data, 'Job favorited');
};

/** Remove a job from the candidate's favorites list. */
exports.removeFavorite = async (req, res) => {
  await service.removeFavorite(req.user.id, Number(req.params.jobId));
  return response.success(res, {}, 'Favorite removed');
};

/** Paginated list of the candidate's favorite jobs. */
exports.listFavorites = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listFavorites(req.user.id, { page, limit });
  return response.list(res, rows, buildPagination(page, limit, total), 'Favorites returned');
};

/** Submit a job application. Duplicate applications are rejected by the service. */
exports.applyToJob = async (req, res) => {
  const data = await service.applyToJob(req.user.id, Number(req.params.jobId), req.body);
  return response.created(res, data, 'Application submitted');
};

/** Paginated list of the candidate's own applications (optionally filtered by status). */
exports.listApplications = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listApplications(req.user.id, {
    page, limit, status: req.body?.status,
  });
  return response.list(res, rows, buildPagination(page, limit, total), 'Applications returned');
};

/** Aggregated dashboard stats (applications, interviews, favorites, strength). */
exports.dashboardStats = async (req, res) => {
  const data = await service.dashboardStats(req.user.id);
  return response.success(res, data, 'Dashboard stats returned');
};

/** POST /candidates/jobs/match - skill-based ranked recommendations. */
exports.matchJobs = async (req, res) => {
  const data = await service.matchJobs(req.user.id, req.body || {});
  return response.list(res, data.records, null, 'Ranked job matches');
};

/** POST /candidates/applications/:jobId/validate-and-apply */
exports.validateAndApply = async (req, res) => {
  const data = await service.applyWithValidation(req.user.id, Number(req.params.jobId), req.body || {});
  if (!data.accepted) {
    return response.error(res, data.message, 422, data);
  }
  return response.created(res, data, 'Application submitted with match score');
};
