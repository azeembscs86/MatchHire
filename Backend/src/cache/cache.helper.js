'use strict';

/**
 * Cache helpers (Redis with MySQL fallback)
 * -----------------------------------------
 * A thin facade over ioredis that hides connection failures from callers.
 *
 *   getCache(key)                    - returns the parsed value, or null
 *   setCache(key, value, ttlSeconds) - serialises (JSON) and stores
 *   deleteCache(...keys)             - bulk DEL
 *   deleteByPattern(pattern)         - SCAN + DEL (used for invalidation)
 *   rememberCache(key, ttl, loader)  - read-through helper
 *
 * Keys are namespaced (`jobs:list:*`, `companies:detail:42`, ...). The
 * `Keys` and `Patterns` maps below are the only place where naming lives -
 * services should never hand-craft cache keys as strings.
 *
 * Invalidation rules (enforced by the service layer):
 *   - Job created/updated/deleted/closed   -> jobs:detail:{id}, jobs:list:*
 *   - Company updated/verified             -> companies:detail:{id}, companies:list:*
 *   - Candidate profile/skills updated     -> candidates:detail:{id}, candidates:list:*, candidates:top
 *   - Application status changes           -> dashboard:*:*
 */

const redis = require('../config/redis');
const logger = require('../utils/logger');

const TTL = Object.freeze({
  JOBS_LIST: 10 * 60,
  JOB_DETAIL: 15 * 60,
  COMPANIES_LIST: 30 * 60,
  COMPANY_DETAIL: 30 * 60,
  CANDIDATES_LIST: 10 * 60,
  CANDIDATE_DETAIL: 10 * 60,
  DASHBOARD_STATS: 5 * 60,
  CATEGORIES: 60 * 60,
  SKILLS: 60 * 60,
});

function safeClient() {
  return redis.isReady() ? redis.getClient() : null;
}

async function getCache(key) {
  const client = safeClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  } catch (err) {
    logger.warn('cache.get failed', { key, error: err.message });
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 600) {
  const client = safeClient();
  if (!client) return false;
  try {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await client.set(key, payload);
    }
    return true;
  } catch (err) {
    logger.warn('cache.set failed', { key, error: err.message });
    return false;
  }
}

async function deleteCache(...keys) {
  const client = safeClient();
  if (!client) return 0;
  const flat = keys.flat().filter(Boolean);
  if (!flat.length) return 0;
  try {
    return await client.del(...flat);
  } catch (err) {
    logger.warn('cache.del failed', { error: err.message });
    return 0;
  }
}

async function deleteByPattern(pattern) {
  const client = safeClient();
  if (!client) return 0;
  if (!pattern) return 0;
  const fullPattern = client.options && client.options.keyPrefix
    ? client.options.keyPrefix + pattern
    : pattern;
  let cursor = '0';
  let removed = 0;
  try {
    do {
      const [next, found] = await client.scan(cursor, 'MATCH', fullPattern, 'COUNT', 200);
      cursor = next;
      if (found.length) {
        const stripped = client.options && client.options.keyPrefix
          ? found.map((k) => k.startsWith(client.options.keyPrefix) ? k.slice(client.options.keyPrefix.length) : k)
          : found;
        removed += await client.del(...stripped);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn('cache.deleteByPattern failed', { pattern, error: err.message });
  }
  return removed;
}

async function rememberCache(key, ttlSeconds, loader) {
  const cached = await getCache(key);
  if (cached !== null && cached !== undefined) return cached;
  const value = await loader();
  if (value !== undefined && value !== null) {
    await setCache(key, value, ttlSeconds);
  }
  return value;
}

/*
 * Cache namespace version. Bump this whenever a backend query is
 * changed in a way that would make previously-cached payloads
 * incorrect (e.g. adding a new WHERE clause to a list query). The
 * old entries TTL out on their own; the version bump just guarantees
 * the next read fetches the corrected data immediately.
 *
 * v2 — Nov 2026: candidate-facing job lists now exclude expired
 *               postings server-side. Bumping the key prefix forces
 *               the new filter to apply on the very next request.
 */
const CACHE_VERSION = 'v2';

const Keys = {
  jobsList: (qs = '') => `${CACHE_VERSION}:jobs:list:${qs}`,
  jobDetail: (id) => `${CACHE_VERSION}:jobs:detail:${id}`,
  companiesList: (qs = '') => `${CACHE_VERSION}:companies:list:${qs}`,
  companyDetail: (id) => `${CACHE_VERSION}:companies:detail:${id}`,
  candidatesList: (qs = '') => `${CACHE_VERSION}:candidates:list:${qs}`,
  candidateDetail: (id) => `${CACHE_VERSION}:candidates:detail:${id}`,
  topCandidates: () => `${CACHE_VERSION}:candidates:top`,
  categories: () => `${CACHE_VERSION}:meta:categories`,
  skills: () => `${CACHE_VERSION}:meta:skills`,
  dashboardStats: (scope, id = 'all') => `${CACHE_VERSION}:dashboard:${scope}:${id}`,
};

const Patterns = {
  allJobs: `${CACHE_VERSION}:jobs:*`,
  jobDetail: (id) => `${CACHE_VERSION}:jobs:detail:${id}`,
  jobsList: `${CACHE_VERSION}:jobs:list:*`,
  allCompanies: `${CACHE_VERSION}:companies:*`,
  companyDetail: (id) => `${CACHE_VERSION}:companies:detail:${id}`,
  companiesList: `${CACHE_VERSION}:companies:list:*`,
  allCandidates: `${CACHE_VERSION}:candidates:*`,
  candidateDetail: (id) => `${CACHE_VERSION}:candidates:detail:${id}`,
  candidatesList: `${CACHE_VERSION}:candidates:list:*`,
  dashboardStats: (scope) => `${CACHE_VERSION}:dashboard:${scope}:*`,
};

module.exports = {
  TTL,
  Keys,
  Patterns,
  getCache,
  setCache,
  deleteCache,
  deleteByPattern,
  rememberCache,
};
