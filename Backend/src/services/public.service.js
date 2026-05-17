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

/**
 * Dynamic, role-aware navigation menu.
 *
 * Returned shape:
 *
 *   {
 *     primary: [ { key, label, to, end? } ],
 *     actions: [ { key, label, kind: 'auth-signin' | 'auth-signup' | 'logout' | 'link', to? } ],
 *     dashboard: { label, to } | null,
 *     user: { id, full_name, role } | null
 *   }
 *
 * Visibility rules (matches the project spec):
 *   - Anonymous          - Home, Jobs, Companies, Candidates, For Employers + Sign in / Join free
 *   - Candidate          - + My Profile, Preferences, Favorites + Candidate Dashboard
 *   - Employer           - + Company Hub (Company Profile + Job Postings) + Company Dashboard
 *   - Admin/Super admin  - + Admin Console
 *
 * Computed on the fly (not cached) because the payload depends on the
 * bearer token; the body is small (sub-1KB) and easy to regenerate.
 */
function navigation(user) {
  const primary = [
    { key: 'home', label: 'Home', to: '/', end: true },
    { key: 'jobs', label: 'Jobs', to: '/jobs' },
    { key: 'companies', label: 'Companies', to: '/companies' },
    { key: 'candidates', label: 'Candidates', to: '/candidates' },
  ];

  const role = user?.role || null;

  if (role === 'candidate') {
    primary.push(
      { key: 'profile', label: 'My Profile', to: '/profile' },
      { key: 'preferences', label: 'Preferences', to: '/preferences' },
      { key: 'favorites', label: 'Favorites', to: '/favorites' },
    );
  } else if (role === 'employer') {
    primary.push(
      { key: 'company-profile', label: 'Company Profile', to: '/employer-onboarding' },
      { key: 'company-jobs', label: 'Job Postings', to: '/dashboard/company' },
    );
  } else if (role === 'admin' || role === 'super_admin') {
    primary.push({ key: 'admin-console', label: 'Admin Console', to: '/dashboard/admin' });
  } else {
    primary.push({ key: 'employer-onboarding', label: 'For Employers', to: '/employer-onboarding' });
  }

  let dashboard = null;
  if (role === 'candidate') dashboard = { label: 'Candidate Dashboard', to: '/dashboard/candidate' };
  else if (role === 'employer') dashboard = { label: 'Company Dashboard', to: '/dashboard/company' };
  else if (role === 'admin' || role === 'super_admin') dashboard = { label: 'Admin Dashboard', to: '/dashboard/admin' };

  const actions = user
    ? [{ key: 'logout', label: 'Sign out', kind: 'logout' }]
    : [
        { key: 'signin', label: 'Sign in', kind: 'auth-signin' },
        { key: 'signup', label: 'Join free', kind: 'auth-signup' },
      ];

  return {
    primary,
    actions,
    dashboard,
    user: user ? { id: user.id, full_name: user.full_name, role: user.role } : null,
  };
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
  navigation,
};
