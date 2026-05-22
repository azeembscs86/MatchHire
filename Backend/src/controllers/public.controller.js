'use strict';

/**
 * Public controller
 * -----------------
 * HTTP boundary for the `/api/v1/public` namespace - the only unauthenticated
 * surface area of the API. All endpoints remain GET (project rule).
 *
 * Responses are cached in Redis where useful; the service layer transparently
 * falls back to MySQL if Redis is unavailable, so controllers stay simple.
 */

const service = require('../services/public.service');
const geo = require('../services/geolocation.service');
const response = require('../utils/response.helper');

/**
 * Build the filter object for `service.listJobs(...)`. When a signed-in
 * candidate hits the endpoint we inject their user id so the repo can
 * hide jobs they've already applied to. Cache keys are built from the
 * filter set, so per-candidate filtered lists don't collide with the
 * shared guest cache.
 */
function listJobsFilters(req) {
  const filters = { ...req.query };
  if (req.user?.id && req.user.role === 'candidate') {
    filters.exclude_applied_for_user_id = req.user.id;
  }
  return filters;
}

exports.listJobs = async (req, res) => {
  const data = await service.listJobs(listJobsFilters(req));
  return response.list(res, data.records, data.pagination, 'Jobs returned successfully');
};

exports.searchJobs = exports.listJobs;

exports.getJob = async (req, res) => {
  // Pass viewer id only when the requester is a candidate — employer /
  // admin viewers don't need the is_applied/saved/favorited decoration.
  const viewerUserId = (req.user?.role === 'candidate') ? req.user.id : null;
  const data = await service.getJob(Number(req.params.id), viewerUserId);
  return response.success(res, data, 'Job detail returned');
};

/**
 * "Recommended Jobs for You" rail on the Job Detail page. Returns up
 * to `limit` similar open jobs, excluding the anchor itself, expired
 * postings, and (when called by a candidate) the rows they've already
 * applied to.
 */
exports.similarJobs = async (req, res) => {
  const viewerUserId = (req.user?.role === 'candidate') ? req.user.id : null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 12);
  const records = await service.similarJobs(Number(req.params.id), viewerUserId, limit);
  return response.list(res, records, null, 'Similar jobs returned');
};

exports.listCompanies = async (req, res) => {
  const data = await service.listCompanies(req.query);
  return response.list(res, data.records, data.pagination, 'Companies returned successfully');
};

exports.getCompany = async (req, res) => {
  const data = await service.getCompany(Number(req.params.id));
  return response.success(res, data, 'Company detail returned');
};

exports.listCandidates = async (req, res) => {
  const data = await service.listCandidates(req.query);
  return response.list(res, data.records, data.pagination, 'Candidates returned successfully');
};

exports.getCandidate = async (req, res) => {
  const data = await service.getCandidate(Number(req.params.id));
  return response.success(res, data, 'Candidate detail returned');
};

exports.categories = async (req, res) => {
  const data = await service.categories();
  return response.success(res, { records: data }, 'Categories returned');
};

exports.skills = async (req, res) => {
  const data = await service.skills();
  return response.success(res, { records: data }, 'Skills returned');
};

exports.topCandidates = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 8, 24);
  const data = await service.topCandidates(limit);
  return response.success(res, { records: data }, 'Top candidates returned');
};

exports.featuredCompanies = async (req, res) => {
  const data = await service.listCompanies({ is_featured: true, page: 1, limit: Math.min(Number(req.query.limit) || 8, 24) });
  return response.success(res, { records: data.records }, 'Featured companies returned');
};

exports.featuredJobs = async (req, res) => {
  const filters = {
    is_featured: true,
    page: 1,
    limit: Math.min(Number(req.query.limit) || 8, 24),
  };
  if (req.user?.id && req.user.role === 'candidate') {
    filters.exclude_applied_for_user_id = req.user.id;
  }
  const data = await service.listJobs(filters);
  return response.success(res, { records: data.records }, 'Featured jobs returned');
};

/**
 * Role-aware navigation menu. Uses `optionalAuth` upstream so the
 * controller sees `req.user` when a valid token is present and `null`
 * otherwise - one endpoint serves both anonymous and authenticated UIs.
 */
exports.navigation = async (req, res) => {
  const data = service.navigation(req.user || null);
  return response.success(res, data, 'Navigation returned');
};

/**
 * Location-prioritised job feed. Decorates each row with a match_score
 * + reasons when called with a candidate token. Country/city are the
 * primary signals; falls back to global-remote ranking when neither is
 * provided.
 */
exports.locationBased = async (req, res) => {
  const filters = {
    country: req.query.country,
    city: req.query.city,
    role: req.query.role,
    skills: req.query.skills,
    experience_level: req.query.experience_level,
    job_scope: req.query.job_scope || 'hybrid',
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
  };
  // Hide already-applied jobs for signed-in candidates. Forwarded into
  // the repo's NOT EXISTS clause via the shared filters object.
  if (req.user?.id && req.user.role === 'candidate') {
    filters.exclude_applied_for_user_id = req.user.id;
  }
  const data = await service.locationBasedJobs(filters, req.user?.id || null);
  return response.list(res, data.records, data.pagination, 'Location-based jobs returned');
};

exports.countries = async (_req, res) => {
  const data = await service.listCountries();
  return response.success(res, { records: data }, 'Countries returned');
};

exports.cities = async (req, res) => {
  const data = await service.listCities(Number(req.query.country_id));
  return response.success(res, { records: data }, 'Cities returned');
};

/**
 * IP-based geolocation. Used as a fallback when the browser denies
 * the geolocation permission. The visitor's IP is read server-side
 * from `X-Forwarded-For` / `req.ip`; the frontend never talks to
 * ipapi directly.
 */
exports.geolocate = async (req, res) => {
  const data = await geo.lookup(req);
  return response.success(res, data, 'Geolocation resolved');
};
