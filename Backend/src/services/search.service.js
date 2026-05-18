'use strict';

/**
 * Search service
 * --------------
 * Wraps ElasticSearch query building for the four supported indices:
 *
 *   jobs       /search/jobs           full-text + advanced filters
 *   candidates /search/candidates     employer-facing candidate search
 *   resumes    (internal)             admin / company candidate search
 *   skills     /search/skills/autocomplete  edge-ngram suggester
 *   companies  /search/companies      MySQL only (small set, no ES)
 *
 * When ES is unavailable, jobs/candidates fall back to the existing
 * MySQL repositories so the SPA keeps working - the page just loses
 * fuzzy / semantic features.
 *
 * Every query is bounded (max 100 results), all user-provided
 * strings are passed as data (no template injection), and results
 * carry `id` + score so callers can hydrate against MySQL if they
 * need fresher data (e.g. the favorites flag).
 */

const es = require('../config/elasticsearch');
const db = require('../config/database');
const cache = require('./cache.service');
const jobRepo = require('../repositories/job.repository');
const candidateRepo = require('../repositories/candidate.repository');
const companyRepo = require('../repositories/company.repository');
const logger = require('../utils/logger');

/* ---------------- Skill autocomplete ---------------- */

async function autocompleteSkills(prefix, limit = 10) {
  const q = String(prefix || '').trim();
  if (!q) return [];
  // ES path: edge-ngram match against skill suggestion field. We just
  // proxy to the skills table since it's small + already cached.
  const all = await cache.remember(cache.Keys.skillsAll(), cache.TTL.META, () =>
    db.query(`SELECT name FROM skills WHERE is_active = 1 ORDER BY name ASC`)
  );
  const lowered = q.toLowerCase();
  return all
    .filter((s) => s.name.toLowerCase().includes(lowered))
    .slice(0, Math.min(Math.max(1, Number(limit) || 10), 25))
    .map((s) => s.name);
}

/* ---------------- Jobs ---------------- */

function buildJobQuery(filters) {
  const must = [];
  const filter = [];

  if (filters.keyword) {
    must.push({
      multi_match: {
        query: filters.keyword,
        fields: [
          'title^4', 'title.autocomplete^3',
          'skills_text^3', 'skills_tags^2',
          'company_name^2', 'company_name.autocomplete',
          'responsibilities', 'requirements', 'description',
        ],
        fuzziness: 'AUTO',
        type: 'best_fields',
      },
    });
  }
  if (filters.role) {
    must.push({ match: { 'title': { query: filters.role, fuzziness: 'AUTO', boost: 3 } } });
  }
  if (Array.isArray(filters.skills) && filters.skills.length) {
    filter.push({ terms: { skills_tags: filters.skills.map((s) => String(s).toLowerCase()) } });
  } else if (typeof filters.skills === 'string' && filters.skills.trim()) {
    const list = filters.skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (list.length) filter.push({ terms: { skills_tags: list } });
  }
  if (filters.country) filter.push({ term: { country: filters.country } });
  if (filters.city) filter.push({ term: { city: filters.city } });
  if (filters.job_type) filter.push({ term: { job_type: filters.job_type } });
  if (filters.work_mode) filter.push({ term: { work_mode: filters.work_mode } });
  if (filters.experience_level) filter.push({ term: { experience_level: filters.experience_level } });
  if (filters.is_remote != null) filter.push({ term: { is_remote: !!filters.is_remote } });
  if (filters.is_global_remote != null) filter.push({ term: { is_global_remote: !!filters.is_global_remote } });
  if (filters.company_id) filter.push({ term: { company_id: Number(filters.company_id) } });
  if (filters.category) filter.push({ term: { category_slug: String(filters.category).toLowerCase() } });
  if (filters.salary_min != null) filter.push({ range: { salary_max: { gte: Number(filters.salary_min) } } });
  if (filters.salary_max != null) filter.push({ range: { salary_min: { lte: Number(filters.salary_max) } } });
  if (filters.posted_after) filter.push({ range: { published_at: { gte: filters.posted_after } } });
  // Only show open + approved jobs.
  filter.push({ term: { status: 'open' } });

  return { must, filter };
}

async function jobsViaES(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const { must, filter } = buildJobQuery(filters);
  const client = es.getClient();
  const res = await client.search({
    index: es.INDEX.jobs,
    from: (page - 1) * limit,
    size: limit,
    query: { bool: { must: must.length ? must : [{ match_all: {} }], filter } },
    sort: filters.sort === 'salary_high'
      ? [{ salary_max: { order: 'desc', missing: '_last' } }, '_score']
      : filters.sort === 'latest'
        ? [{ published_at: { order: 'desc' } }, '_score']
        : ['_score', { is_featured: 'desc' }, { published_at: 'desc' }],
  });
  const records = (res.hits?.hits || []).map((h) => ({ ...h._source, _score: h._score }));
  const total = typeof res.hits?.total === 'object' ? res.hits.total.value : (res.hits?.total || 0);
  return { records, total, source: 'elasticsearch', page, limit };
}

async function jobsViaMySQL(filters) {
  // Reuse the existing repo; the field names are nearly identical so
  // the frontend doesn't have to branch on the source.
  const { rows, total } = await jobRepo.listPublic(filters);
  return { records: rows, total, source: 'mysql', page: filters.page || 1, limit: filters.limit || 20 };
}

async function searchJobs(filters = {}) {
  const cacheKey = cache.Keys.search('jobs', filters);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  let result;
  if (es.isReady()) {
    try { result = await jobsViaES(filters); }
    catch (err) {
      logger.warn('searchJobs ES failed - falling back to MySQL', { error: err.message });
      result = await jobsViaMySQL(filters);
    }
  } else {
    result = await jobsViaMySQL(filters);
  }

  await cache.set(cacheKey, result, cache.TTL.SEARCH_RESULT);
  return result;
}

/* ---------------- Candidates ---------------- */

async function candidatesViaES(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const must = [];
  const filterClauses = [{ term: { is_public: true } }];

  if (filters.keyword) {
    must.push({
      multi_match: {
        query: filters.keyword,
        fields: ['full_name^3', 'headline^3', 'headline.autocomplete', 'current_title^2', 'skills_text^2', 'summary'],
        fuzziness: 'AUTO',
        type: 'best_fields',
      },
    });
  }
  if (filters.skill) {
    must.push({ term: { skills: String(filters.skill).toLowerCase() } });
  }
  if (filters.country) filterClauses.push({ term: { country: filters.country } });
  if (filters.city) filterClauses.push({ term: { city: filters.city } });
  if (filters.remote === true) filterClauses.push({ term: { open_to_remote: true } });
  if (filters.experience_min != null) filterClauses.push({ range: { years_experience: { gte: Number(filters.experience_min) } } });
  if (filters.salary_min != null) filterClauses.push({ range: { expected_salary_min: { gte: Number(filters.salary_min) } } });
  if (filters.salary_max != null) filterClauses.push({ range: { expected_salary_max: { lte: Number(filters.salary_max) } } });

  const client = es.getClient();
  const res = await client.search({
    index: es.INDEX.candidates,
    from: (page - 1) * limit,
    size: limit,
    query: { bool: { must: must.length ? must : [{ match_all: {} }], filter: filterClauses } },
    sort: ['_score', { profile_strength: 'desc' }, { updated_at: 'desc' }],
  });
  const records = (res.hits?.hits || []).map((h) => ({ ...h._source, _score: h._score }));
  const total = typeof res.hits?.total === 'object' ? res.hits.total.value : (res.hits?.total || 0);
  return { records, total, source: 'elasticsearch', page, limit };
}

async function candidatesViaMySQL(filters) {
  const { rows, total } = await candidateRepo.listPublicCandidates(filters);
  return { records: rows, total, source: 'mysql', page: filters.page || 1, limit: filters.limit || 20 };
}

async function searchCandidates(filters = {}) {
  const cacheKey = cache.Keys.search('candidates', filters);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  let result;
  if (es.isReady()) {
    try { result = await candidatesViaES(filters); }
    catch (err) {
      logger.warn('searchCandidates ES failed - falling back to MySQL', { error: err.message });
      result = await candidatesViaMySQL(filters);
    }
  } else {
    result = await candidatesViaMySQL(filters);
  }
  await cache.set(cacheKey, result, cache.TTL.SEARCH_RESULT);
  return result;
}

/* ---------------- Companies (MySQL only - small set) ---------------- */

async function searchCompanies(filters = {}) {
  const { rows, total } = await companyRepo.listPublic({
    keyword: filters.keyword,
    industry: filters.industry,
    location: filters.location,
    is_featured: filters.is_featured,
    page: filters.page || 1,
    limit: Math.min(100, Math.max(1, Number(filters.limit) || 20)),
  });
  return { records: rows, total, source: 'mysql', page: filters.page || 1, limit: filters.limit || 20 };
}

module.exports = {
  autocompleteSkills,
  searchJobs,
  searchCandidates,
  searchCompanies,
};
