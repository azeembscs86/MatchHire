'use strict';

/**
 * Trending jobs - Redis sorted sets keyed by scope:
 *
 *   mh:job:trending:global               every job, weighted activity
 *   mh:job:trending:country:Pakistan     same, scoped to a country
 *   mh:job:trending:city:Karachi         same, scoped to a city
 *
 * Weights (per event):
 *
 *   view         +1
 *   save         +3
 *   apply        +5
 *   match-shown  +0.5
 *
 * `bump(...)` is called from the read paths (job detail, list view,
 * favorites toggle, validate-and-apply). `top(...)` returns the
 * ranked job ids; consumers join against MySQL to hydrate.
 *
 * Falls back gracefully when Redis is offline: `bump` is a no-op,
 * `top` returns the most-recently-published jobs from MySQL.
 */

const cache = require('./cache.service');
const db = require('../config/database');
const logger = require('../utils/logger');

const SCOPES = ['global', 'country', 'city'];
const TTL_SCOPE = 7 * 24 * 3600; // expire the sorted set after a week of inactivity

function scopeKey(scope, value) {
  if (scope === 'global') return cache.Keys.jobsTrending('global');
  if (!value) return cache.Keys.jobsTrending(scope);
  return cache.Keys.jobsTrending(`${scope}:${String(value).toLowerCase()}`);
}

async function bump({ jobId, weight = 1, country = null, city = null }) {
  if (!jobId) return;
  try {
    const keys = [
      scopeKey('global'),
      country ? scopeKey('country', country) : null,
      city ? scopeKey('city', city) : null,
    ].filter(Boolean);
    for (const k of keys) {
      await cache.zincrby(k, weight, String(jobId));
      await cache.expire(k, TTL_SCOPE);
    }
  } catch (err) {
    logger.warn('trending.bump failed', { jobId, error: err.message });
  }
}

const EVENT_WEIGHTS = {
  view: 1,
  save: 3,
  apply: 5,
  match_shown: 0.5,
  trending_decay: -1, // used by the periodic decay job
};

async function bumpEvent({ jobId, event, country, city }) {
  const weight = EVENT_WEIGHTS[event] ?? 1;
  return bump({ jobId, weight, country, city });
}

async function topIds({ scope = 'global', value = null, limit = 10 }) {
  const key = scopeKey(scope, value);
  const ids = await cache.zrevrange(key, 0, Math.max(0, limit - 1));
  return ids.map((id) => Number(id)).filter((n) => Number.isInteger(n));
}

/**
 * Return a list of trending jobs hydrated from MySQL. Falls back to
 * "newest published" when the sorted set is empty (e.g. Redis offline,
 * or just after a fresh deploy).
 */
async function top({ scope = 'global', value = null, limit = 10 }) {
  const ids = await topIds({ scope, value, limit });
  if (!ids.length) {
    const where = ["j.status = 'open'", "j.admin_status = 'approved'", "j.deleted_at IS NULL"];
    const params = [];
    if (scope === 'country' && value) { where.push('j.country = ?'); params.push(value); }
    if (scope === 'city' && value) { where.push('j.city = ?'); params.push(value); }
    const rows = await db.query(
      `SELECT j.id, j.title, j.city, j.country, j.is_remote, j.is_global_remote, j.work_mode,
              j.job_type, j.experience_level, j.salary_min, j.salary_max, j.salary_currency,
              j.skills_tags, j.published_at, j.created_at, j.is_featured,
              c.name AS company_name, c.logo_url AS company_logo,
              c.id AS company_id
       FROM jobs j INNER JOIN companies c ON c.id = j.company_id
       WHERE ${where.join(' AND ')}
       ORDER BY j.is_featured DESC, j.published_at DESC LIMIT ?`,
      [...params, Number(limit)]
    );
    return rows.map((r) => ({ ...r, _source: 'fallback' }));
  }
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT j.id, j.title, j.city, j.country, j.is_remote, j.is_global_remote, j.work_mode,
            j.job_type, j.experience_level, j.salary_min, j.salary_max, j.salary_currency,
            j.skills_tags, j.published_at, j.created_at, j.is_featured,
            c.name AS company_name, c.logo_url AS company_logo,
            c.id AS company_id
     FROM jobs j INNER JOIN companies c ON c.id = j.company_id
     WHERE j.id IN (${placeholders}) AND j.deleted_at IS NULL`,
    ids
  );
  // Preserve the sorted-set order returned by Redis.
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

module.exports = {
  SCOPES,
  bump,
  bumpEvent,
  top,
  topIds,
  EVENT_WEIGHTS,
};
