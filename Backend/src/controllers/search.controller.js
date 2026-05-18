'use strict';

/**
 * Search controller
 * -----------------
 * HTTP boundary for `/api/v1/search/*`. Routes always return the
 * standard MatchHire envelope; the underlying service decides whether
 * the data came from ElasticSearch or the MySQL fallback (the source
 * lives on `Data.source` for observability).
 *
 *   GET  /search/jobs                 fast job search
 *   GET  /search/candidates           employer candidate search
 *   GET  /search/companies            (MySQL only - small set)
 *   GET  /search/skills/autocomplete  edge-ngram skill suggestions
 *   POST /search/analytics            front-end click / conversion ping
 *   POST /index/jobs/reindex          admin bulk reindex
 *   POST /index/candidates/reindex    admin bulk reindex
 *   POST /index/resumes/reindex       admin bulk reindex
 */

const searchService = require('../services/search.service');
const analytics = require('../services/searchAnalytics.service');
const response = require('../utils/response.helper');
const jobIndexer = require('../indexers/job.indexer');
const candidateIndexer = require('../indexers/candidate.indexer');
const resumeIndexer = require('../indexers/resume.indexer');
const { buildPagination } = require('../utils/pagination');

function pickFilters(q) { return { ...q }; }

exports.searchJobs = async (req, res) => {
  const started = Date.now();
  const filters = pickFilters(req.query);
  // numeric coercion + bounds
  filters.page = Math.max(1, Number(filters.page) || 1);
  filters.limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const data = await searchService.searchJobs(filters);
  analytics.track({
    user_id: req.user?.id || null,
    index_name: 'jobs',
    keyword: filters.keyword || null,
    country: filters.country || null,
    city: filters.city || null,
    filters,
    result_count: data.total,
    no_results: !data.total,
    latency_ms: Date.now() - started,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});
  return response.list(
    res,
    data.records,
    buildPagination(data.page, data.limit, data.total),
    `Jobs (${data.source})`
  );
};

exports.searchCandidates = async (req, res) => {
  const started = Date.now();
  const filters = pickFilters(req.query);
  filters.page = Math.max(1, Number(filters.page) || 1);
  filters.limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const data = await searchService.searchCandidates(filters);
  analytics.track({
    user_id: req.user?.id || null,
    index_name: 'candidates',
    keyword: filters.keyword || null,
    filters,
    result_count: data.total,
    no_results: !data.total,
    latency_ms: Date.now() - started,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  }).catch(() => {});
  return response.list(
    res,
    data.records,
    buildPagination(data.page, data.limit, data.total),
    `Candidates (${data.source})`
  );
};

exports.searchCompanies = async (req, res) => {
  const data = await searchService.searchCompanies(req.query);
  return response.list(res, data.records, buildPagination(data.page, data.limit, data.total), 'Companies');
};

exports.autocompleteSkills = async (req, res) => {
  const data = await searchService.autocompleteSkills(req.query.q || req.query.prefix || '', req.query.limit);
  return response.success(res, { records: data }, 'Skill suggestions');
};

exports.recordAnalytics = async (req, res) => {
  await analytics.track({
    ...(req.body || {}),
    user_id: req.user?.id || req.body?.user_id || null,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  });
  return response.success(res, {}, 'Analytics recorded');
};

/* ----- Reindex (admin only) ----- */

exports.reindexJobs = async (_req, res) => {
  const result = await jobIndexer.reindexAll();
  return response.success(res, result, 'Job reindex complete');
};
exports.reindexCandidates = async (_req, res) => {
  const result = await candidateIndexer.reindexAll();
  return response.success(res, result, 'Candidate reindex complete');
};
exports.reindexResumes = async (_req, res) => {
  const result = await resumeIndexer.reindexAll();
  return response.success(res, result, 'Resume reindex complete');
};
