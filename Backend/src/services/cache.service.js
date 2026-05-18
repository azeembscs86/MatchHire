'use strict';

/**
 * Cache service - the canonical entry point for application-level
 * Redis caching. Wraps `cache/cache.helper.js` with named methods
 * that read keys from `helpers/cacheKey.helper.js`. Consumers should
 * call THIS module, never `cache.helper` or the raw Redis client
 * directly - that way swapping Redis for a different cache (or
 * adding a stampede lock) is a one-file change.
 *
 *   cache.get(key)
 *   cache.set(key, value, ttlSeconds)
 *   cache.del(...keys)
 *   cache.delByPattern(pattern)
 *   cache.remember(key, ttl, loader)         read-through helper
 *   cache.zadd / zincrby / zrevrange         sorted-set ops (trending)
 *   cache.invalidate.jobsAll()               domain-specific blasters
 *
 * Every call short-circuits when Redis is unavailable - consumers
 * write the code as if Redis is always there and the service handles
 * the fallback.
 */

const cacheBase = require('../cache/cache.helper');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { Keys, Patterns, TTL } = require('../helpers/cacheKey.helper');

function client() { return redis.isReady() ? redis.getClient() : null; }

async function get(key) { return cacheBase.getCache(key); }
async function set(key, value, ttl) { return cacheBase.setCache(key, value, ttl); }
async function del(...keys) { return cacheBase.deleteCache(...keys); }
async function delByPattern(pattern) { return cacheBase.deleteByPattern(pattern); }
async function remember(key, ttl, loader) { return cacheBase.rememberCache(key, ttl, loader); }

/* --------- Sorted-set helpers (used by trending jobs) --------- */

async function zadd(key, score, member) {
  const c = client();
  if (!c) return 0;
  try { return await c.zadd(key, score, member); }
  catch (err) { logger.warn('cache.zadd failed', { key, error: err.message }); return 0; }
}

async function zincrby(key, delta, member) {
  const c = client();
  if (!c) return 0;
  try { return await c.zincrby(key, delta, member); }
  catch (err) { logger.warn('cache.zincrby failed', { key, error: err.message }); return 0; }
}

async function zrevrange(key, start = 0, stop = 9, withScores = false) {
  const c = client();
  if (!c) return [];
  try {
    return withScores
      ? await c.zrevrange(key, start, stop, 'WITHSCORES')
      : await c.zrevrange(key, start, stop);
  } catch (err) { logger.warn('cache.zrevrange failed', { key, error: err.message }); return []; }
}

async function expire(key, ttl) {
  const c = client();
  if (!c) return 0;
  try { return await c.expire(key, ttl); }
  catch (err) { logger.warn('cache.expire failed', { key, error: err.message }); return 0; }
}

/* --------- Hash helpers (used by session.service) --------- */

async function hset(key, field, value, ttl) {
  const c = client();
  if (!c) return 0;
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    await c.hset(key, field, v);
    if (ttl) await c.expire(key, ttl);
    return 1;
  } catch (err) { logger.warn('cache.hset failed', { key, error: err.message }); return 0; }
}

async function hget(key, field) {
  const c = client();
  if (!c) return null;
  try {
    const raw = await c.hget(key, field);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  } catch (err) { logger.warn('cache.hget failed', { key, error: err.message }); return null; }
}

async function hdel(key, field) {
  const c = client();
  if (!c) return 0;
  try { return await c.hdel(key, field); }
  catch (err) { logger.warn('cache.hdel failed', { key, error: err.message }); return 0; }
}

async function hkeys(key) {
  const c = client();
  if (!c) return [];
  try { return await c.hkeys(key); }
  catch (err) { logger.warn('cache.hkeys failed', { key, error: err.message }); return []; }
}

/* --------- Domain invalidators --------- */

const invalidate = {
  /** Blow every key under the job domain (lists, feeds, details, trending). */
  async jobs() {
    return delByPattern(Patterns.allJobs);
  },
  /** Targeted: a single job's detail and any list cache that may include it. */
  async job(id) {
    await del(Keys.jobDetail(id));
    await delByPattern(Patterns.jobLists);
    await delByPattern(Patterns.jobFeeds);
    // matchScore for this job across all candidates - drop them all
    await delByPattern(Patterns.matchForJob(id));
    // Per-index search results that may have included this job.
    await delByPattern(Patterns.searchByIndex('jobs'));
  },
  async company(id) {
    await del(Keys.companyDetail(id));
    await delByPattern(Patterns.companyLists);
    await delByPattern(Patterns.searchByIndex('companies'));
  },
  async candidate(id) {
    await del(Keys.candidateDetail(id));
    await delByPattern(Patterns.candidateLists);
    await delByPattern(Patterns.matchForCandidate(id));
    await delByPattern(Patterns.searchByIndex('candidates'));
  },
  async candidateProfileChanged(userId) {
    // Profile / skills / preferences impact every match the user has.
    await delByPattern(Patterns.matchForCandidate(userId));
    await delByPattern(Patterns.jobFeedsForUser(userId));
    await delByPattern(Patterns.dashboard('candidate'));
  },
  async dashboards(scope) {
    await delByPattern(Patterns.dashboard(scope));
  },
};

module.exports = {
  Keys,
  Patterns,
  TTL,
  get,
  set,
  del,
  delByPattern,
  remember,
  zadd,
  zincrby,
  zrevrange,
  expire,
  hset,
  hget,
  hdel,
  hkeys,
  invalidate,
  isReady: redis.isReady,
};
