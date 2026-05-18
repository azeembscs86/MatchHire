'use strict';

/**
 * Job indexer
 * -----------
 * Maps MySQL `jobs` rows into ElasticSearch documents and handles
 * single-row + bulk operations.
 *
 *   indexJob(id)         on create/update
 *   removeJob(id)        on delete
 *   reindexAll(opts)     admin reindex - paginates jobs from MySQL
 *
 * All operations are best-effort: when ES is unavailable they log a
 * warning and return, leaving MySQL as the source of truth. Producers
 * never need to await these or treat them as critical-path.
 */

const es = require('../config/elasticsearch');
const db = require('../config/database');
const logger = require('../utils/logger');

function mapRow(row) {
  if (!row) return null;
  const skillsArr = (row.skills_tags || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    skills_tags: skillsArr,
    skills_text: skillsArr.join(' '),
    company_name: row.company_name,
    company_id: Number(row.company_id),
    company_logo: row.company_logo || null,
    category_name: row.category_name || null,
    category_slug: row.category_slug || null,
    job_type: row.job_type,
    experience_level: row.experience_level,
    work_mode: row.work_mode,
    is_remote: !!row.is_remote,
    is_global_remote: !!row.is_global_remote,
    city: row.city || null,
    country: row.country || null,
    timezone: row.timezone || null,
    salary_min: row.salary_min ? Number(row.salary_min) : null,
    salary_max: row.salary_max ? Number(row.salary_max) : null,
    salary_currency: row.salary_currency || null,
    salary_period: row.salary_period || null,
    is_featured: !!row.is_featured,
    status: row.status,
    published_at: row.published_at,
    created_at: row.created_at,
  };
}

async function loadJobRow(id) {
  return db.queryOne(
    `SELECT j.id, j.title, j.description, j.responsibilities, j.requirements,
            j.skills_tags, j.job_type, j.experience_level, j.work_mode,
            j.is_remote, j.is_global_remote, j.city, j.country, j.timezone,
            j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
            j.is_featured, j.status, j.published_at, j.created_at, j.company_id,
            c.name AS company_name, c.logo_url AS company_logo,
            cat.name AS category_name, cat.slug AS category_slug
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE j.id = ? AND j.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

async function indexJob(id) {
  if (!es.isReady()) return false;
  try {
    const row = await loadJobRow(id);
    if (!row) return removeJob(id);
    const client = es.getClient();
    await client.index({
      index: es.INDEX.jobs,
      id: String(row.id),
      document: mapRow(row),
      refresh: false,
    });
    return true;
  } catch (err) {
    logger.warn('job.indexer.indexJob failed', { id, error: err.message });
    return false;
  }
}

async function removeJob(id) {
  if (!es.isReady()) return false;
  try {
    const client = es.getClient();
    await client.delete({ index: es.INDEX.jobs, id: String(id) }).catch(() => null);
    return true;
  } catch (err) {
    logger.warn('job.indexer.removeJob failed', { id, error: err.message });
    return false;
  }
}

async function reindexAll({ batchSize = 200 } = {}) {
  if (!es.isReady()) return { ok: false, reason: 'elasticsearch_unavailable' };
  await es.ensureIndices();
  const client = es.getClient();
  let offset = 0, total = 0;
  while (true) {
    const rows = await db.query(
      `SELECT j.id, j.title, j.description, j.responsibilities, j.requirements,
              j.skills_tags, j.job_type, j.experience_level, j.work_mode,
              j.is_remote, j.is_global_remote, j.city, j.country, j.timezone,
              j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
              j.is_featured, j.status, j.published_at, j.created_at, j.company_id,
              c.name AS company_name, c.logo_url AS company_logo,
              cat.name AS category_name, cat.slug AS category_slug
       FROM jobs j
       INNER JOIN companies c ON c.id = j.company_id
       LEFT JOIN job_categories cat ON cat.id = j.category_id
       WHERE j.deleted_at IS NULL
       ORDER BY j.id ASC LIMIT ? OFFSET ?`,
      [Number(batchSize), Number(offset)]
    );
    if (!rows.length) break;
    const body = rows.flatMap((row) => [
      { index: { _index: es.INDEX.jobs, _id: String(row.id) } },
      mapRow(row),
    ]);
    const res = await client.bulk({ refresh: false, operations: body });
    if (res?.errors) {
      const errors = (res.items || []).filter((i) => i.index?.error).length;
      if (errors) logger.warn(`Job reindex had ${errors} item-level errors`);
    }
    total += rows.length;
    offset += rows.length;
  }
  try { await client.indices.refresh({ index: es.INDEX.jobs }); } catch (_) { /* noop */ }
  return { ok: true, indexed: total };
}

module.exports = {
  indexJob,
  removeJob,
  reindexAll,
};
