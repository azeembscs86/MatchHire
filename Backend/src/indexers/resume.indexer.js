'use strict';

/**
 * Resume indexer
 *
 *   indexResume(resumeId)     after parse / confirm
 *   removeResume(resumeId)    on delete
 *   reindexAll()              admin reindex
 *
 * Pulls from `resume_parsed_data` joined with `resumes`. The raw
 * resume text is NOT indexed - we only push structured fields so
 * privacy stays tight (the original file remains in private storage).
 */

const es = require('../config/elasticsearch');
const db = require('../config/database');
const logger = require('../utils/logger');

async function loadRow(resume_id) {
  return db.queryOne(
    `SELECT r.id, r.candidate_user_id, r.uploaded_at, r.parse_status,
            p.full_name, p.email, p.job_title, p.summary,
            p.skills, p.experience, p.education, p.city, p.country, p.confidence
     FROM resumes r
     LEFT JOIN resume_parsed_data p ON p.resume_id = r.id
     WHERE r.id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [resume_id]
  );
}

function parseJson(v, fallback) {
  if (!v) return fallback;
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    candidate_user_id: Number(row.candidate_user_id),
    full_name: row.full_name,
    email: row.email,
    job_title: row.job_title,
    summary: row.summary,
    skills: parseJson(row.skills, []),
    experience_text: (parseJson(row.experience, []) || []).join('\n'),
    education_text: (parseJson(row.education, []) || []).join('\n'),
    city: row.city || null,
    country: row.country || null,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    parse_status: row.parse_status,
    uploaded_at: row.uploaded_at,
  };
}

async function indexResume(resume_id) {
  if (!es.isReady()) return false;
  try {
    const row = await loadRow(resume_id);
    if (!row || row.parse_status !== 'parsed') return false;
    const client = es.getClient();
    await client.index({
      index: es.INDEX.resumes,
      id: String(row.id),
      document: mapRow(row),
      refresh: false,
    });
    return true;
  } catch (err) {
    logger.warn('resume.indexer.indexResume failed', { resume_id, error: err.message });
    return false;
  }
}

async function removeResume(resume_id) {
  if (!es.isReady()) return false;
  try {
    const client = es.getClient();
    await client.delete({ index: es.INDEX.resumes, id: String(resume_id) }).catch(() => null);
    return true;
  } catch (err) {
    logger.warn('resume.indexer.removeResume failed', { resume_id, error: err.message });
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
      `SELECT id FROM resumes
       WHERE deleted_at IS NULL AND parse_status = 'parsed'
       ORDER BY id ASC LIMIT ? OFFSET ?`,
      [Number(batchSize), Number(offset)]
    );
    if (!rows.length) break;
    const docs = [];
    for (const { id } of rows) {
      const row = await loadRow(id);
      if (row && row.parse_status === 'parsed') docs.push(mapRow(row));
    }
    if (docs.length) {
      const body = docs.flatMap((doc) => [
        { index: { _index: es.INDEX.resumes, _id: String(doc.id) } },
        doc,
      ]);
      await client.bulk({ refresh: false, operations: body });
    }
    total += rows.length;
    offset += rows.length;
  }
  try { await client.indices.refresh({ index: es.INDEX.resumes }); } catch (_) { /* noop */ }
  return { ok: true, indexed: total };
}

module.exports = {
  indexResume,
  removeResume,
  reindexAll,
};
