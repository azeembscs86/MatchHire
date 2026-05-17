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
const response = require('../utils/response.helper');

exports.listJobs = async (req, res) => {
  const data = await service.listJobs(req.query);
  return response.list(res, data.records, data.pagination, 'Jobs returned successfully');
};

exports.searchJobs = exports.listJobs;

exports.getJob = async (req, res) => {
  const data = await service.getJob(Number(req.params.id));
  return response.success(res, data, 'Job detail returned');
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
  const data = await service.listJobs({ is_featured: true, page: 1, limit: Math.min(Number(req.query.limit) || 8, 24) });
  return response.success(res, { records: data.records }, 'Featured jobs returned');
};
