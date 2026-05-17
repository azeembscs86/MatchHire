'use strict';

/**
 * Public service
 * --------------
 * Read-through caching layer for the unauthenticated surface area.
 *
 * Pattern used everywhere:
 *
 *   const data = await cache.rememberCache(key, ttl, () => repository.lookup(...));
 *
 * If Redis is up, the value is stored under a namespaced key (see
 * `cache.helper.js > Keys`). If Redis is unavailable, `rememberCache` simply
 * calls the loader every time - the API stays functional without caching.
 */

const jobRepo = require('../repositories/job.repository');
const companyRepo = require('../repositories/company.repository');
const candidateRepo = require('../repositories/candidate.repository');
const metaRepo = require('../repositories/meta.repository');
const cache = require('../cache/cache.helper');
const { buildPagination } = require('../utils/pagination');
const AppError = require('../utils/AppError');

function queryString(obj) {
  const entries = Object.entries(obj || {})
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  entries.sort();
  return entries.join('&');
}

async function listJobs(filters) {
  const key = cache.Keys.jobsList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.JOBS_LIST, async () => {
    const { rows, total } = await jobRepo.listPublic(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

async function getJob(id) {
  const key = cache.Keys.jobDetail(id);
  const cached = await cache.getCache(key);
  if (cached) {
    await jobRepo.incrementViews(id);
    return cached;
  }
  const job = await jobRepo.findById(id);
  if (!job || job.status === 'archived') throw new AppError('Job not found', 404);
  await jobRepo.incrementViews(id);
  await cache.setCache(key, job, cache.TTL.JOB_DETAIL);
  return job;
}

async function listCompanies(filters) {
  const key = cache.Keys.companiesList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.COMPANIES_LIST, async () => {
    const { rows, total } = await companyRepo.listPublic(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

async function getCompany(id) {
  const key = cache.Keys.companyDetail(id);
  const cached = await cache.getCache(key);
  if (cached) return cached;
  const company = await companyRepo.publicDetail(id);
  if (!company) throw new AppError('Company not found', 404);
  const jobs = await jobRepo.listByCompany(id, { page: 1, limit: 10, status: 'open' });
  const data = { ...company, jobs: jobs.rows };
  await cache.setCache(key, data, cache.TTL.COMPANY_DETAIL);
  return data;
}

async function listCandidates(filters) {
  const key = cache.Keys.candidatesList(queryString(filters));
  return cache.rememberCache(key, cache.TTL.CANDIDATES_LIST, async () => {
    const { rows, total } = await candidateRepo.listPublicCandidates(filters);
    return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
  });
}

async function getCandidate(id) {
  const key = cache.Keys.candidateDetail(id);
  const cached = await cache.getCache(key);
  if (cached) return cached;
  const candidate = await candidateRepo.getPublicCandidate(id);
  if (!candidate) throw new AppError('Candidate not found', 404);
  await cache.setCache(key, candidate, cache.TTL.CANDIDATE_DETAIL);
  return candidate;
}

async function categories() {
  return cache.rememberCache(cache.Keys.categories(), cache.TTL.CATEGORIES, () => metaRepo.listCategories());
}

async function skills() {
  return cache.rememberCache(cache.Keys.skills(), cache.TTL.SKILLS, () => metaRepo.listSkills());
}

async function topCandidates(limit = 8) {
  return cache.rememberCache(cache.Keys.topCandidates(), cache.TTL.CANDIDATES_LIST, () => candidateRepo.topCandidates(limit));
}

module.exports = {
  listJobs,
  getJob,
  listCompanies,
  getCompany,
  listCandidates,
  getCandidate,
  categories,
  skills,
  topCandidates,
};
