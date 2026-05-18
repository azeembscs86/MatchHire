'use strict';

/**
 * Search analytics service
 * ------------------------
 * Append-only writer for `search_events`. Backs the
 * `POST /api/v1/search/analytics` endpoint plus internal calls from
 * search.controller when a result set is returned.
 *
 * Reads are admin-only - small helper queries that the admin
 * dashboard uses for the "search performance" panel (top keywords,
 * no-result keywords, conversion rate).
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/** Append a single event. Never throws; analytics must not block UX. */
async function track(event) {
  try {
    await db.getPool().execute(
      `INSERT INTO search_events
         (user_id, index_name, keyword, country, city, filters, result_count,
          clicked_id, converted_application_id, no_results, latency_ms,
          ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.user_id || null,
        event.index_name || 'jobs',
        (event.keyword || '').slice(0, 200) || null,
        event.country || null,
        event.city || null,
        event.filters ? JSON.stringify(event.filters) : null,
        Number(event.result_count || 0),
        event.clicked_id || null,
        event.converted_application_id || null,
        event.no_results ? 1 : 0,
        event.latency_ms != null ? Number(event.latency_ms) : null,
        (event.ip_address || '').slice(0, 64) || null,
        (event.user_agent || '').slice(0, 255) || null,
      ]
    );
  } catch (err) {
    // Schema mismatch? Log and move on. Never break the SPA.
    logger.warn('search-analytics.track failed', { error: err.message });
  }
}

/* ---------------- Admin reads ---------------- */

async function topKeywords({ days = 7, limit = 20, index_name = null } = {}) {
  const where = ['created_at >= (NOW() - INTERVAL ? DAY)'];
  const params = [Number(days)];
  if (index_name) { where.push('index_name = ?'); params.push(index_name); }
  return db.query(
    `SELECT keyword, COUNT(*) AS searches, AVG(result_count) AS avg_results
     FROM search_events
     WHERE ${where.join(' AND ')} AND keyword IS NOT NULL AND keyword <> ''
     GROUP BY keyword
     ORDER BY searches DESC
     LIMIT ?`,
    [...params, Number(limit)]
  );
}

async function noResultKeywords({ days = 30, limit = 20 } = {}) {
  return db.query(
    `SELECT keyword, COUNT(*) AS searches, MAX(created_at) AS last_seen
     FROM search_events
     WHERE no_results = 1 AND keyword IS NOT NULL AND keyword <> ''
       AND created_at >= (NOW() - INTERVAL ? DAY)
     GROUP BY keyword
     ORDER BY searches DESC
     LIMIT ?`,
    [Number(days), Number(limit)]
  );
}

async function conversionRate({ days = 30 } = {}) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS searches,
            SUM(CASE WHEN clicked_id IS NOT NULL THEN 1 ELSE 0 END) AS clicks,
            SUM(CASE WHEN converted_application_id IS NOT NULL THEN 1 ELSE 0 END) AS applies
     FROM search_events
     WHERE created_at >= (NOW() - INTERVAL ? DAY)`,
    [Number(days)]
  );
  const searches = Number(row?.searches || 0);
  return {
    days,
    searches,
    clicks: Number(row?.clicks || 0),
    applies: Number(row?.applies || 0),
    click_through_rate: searches ? Number((Number(row.clicks) / searches).toFixed(4)) : 0,
    apply_rate: searches ? Number((Number(row.applies) / searches).toFixed(4)) : 0,
  };
}

module.exports = {
  track,
  topKeywords,
  noResultKeywords,
  conversionRate,
};
