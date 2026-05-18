'use strict';

/**
 * Candidate indexer
 *
 *   indexCandidate(userId)   on profile / skills change
 *   removeCandidate(userId)  on de-publish
 *   reindexAll()             admin reindex
 *
 * Only `is_public = 1` candidates land in the index. The candidate
 * search route (used by employers) reads from here; the public
 * candidate detail page still hits MySQL via the existing repo.
 */

const es = require('../config/elasticsearch');
const db = require('../config/database');
const logger = require('../utils/logger');

async function loadCandidateRow(user_id) {
  const profile = await db.queryOne(
    `SELECT u.id, u.full_name, u.email,
            cp.headline, cp.summary, cp.current_title, cp.years_experience,
            cp.city, cp.country, cp.timezone, cp.open_to_remote,
            cp.expected_salary_min, cp.expected_salary_max, cp.salary_currency,
            cp.availability, cp.profile_strength, cp.languages, cp.is_public,
            cp.updated_at
     FROM users u
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [user_id]
  );
  if (!profile) return null;
  if (!profile.is_public) return null;
  const skills = await db.query(
    `SELECT s.name FROM candidate_skills cs INNER JOIN skills s ON s.id = cs.skill_id WHERE cs.candidate_user_id = ?`,
    [user_id]
  );
  return { ...profile, skills: skills.map((s) => s.name) };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    full_name: row.full_name,
    headline: row.headline,
    summary: row.summary,
    current_title: row.current_title,
    years_experience: Number(row.years_experience || 0),
    skills: row.skills || [],
    skills_text: (row.skills || []).join(' '),
    city: row.city || null,
    country: row.country || null,
    timezone: row.timezone || null,
    open_to_remote: !!row.open_to_remote,
    expected_salary_min: row.expected_salary_min ? Number(row.expected_salary_min) : null,
    expected_salary_max: row.expected_salary_max ? Number(row.expected_salary_max) : null,
    salary_currency: row.salary_currency || null,
    availability: row.availability || null,
    profile_strength: Number(row.profile_strength || 0),
    languages: (row.languages || '').split(',').map((s) => s.trim()).filter(Boolean),
    is_public: !!row.is_public,
    updated_at: row.updated_at,
  };
}

async function indexCandidate(user_id) {
  if (!es.isReady()) return false;
  try {
    const row = await loadCandidateRow(user_id);
    const client = es.getClient();
    if (!row) {
      // Either missing or no longer public - remove from index.
      await client.delete({ index: es.INDEX.candidates, id: String(user_id) }).catch(() => null);
      return true;
    }
    await client.index({
      index: es.INDEX.candidates,
      id: String(row.id),
      document: mapRow(row),
      refresh: false,
    });
    return true;
  } catch (err) {
    logger.warn('candidate.indexer.indexCandidate failed', { user_id, error: err.message });
    return false;
  }
}

async function removeCandidate(user_id) {
  if (!es.isReady()) return false;
  try {
    const client = es.getClient();
    await client.delete({ index: es.INDEX.candidates, id: String(user_id) }).catch(() => null);
    return true;
  } catch (err) {
    logger.warn('candidate.indexer.removeCandidate failed', { user_id, error: err.message });
    return false;
  }
}

async function reindexAll({ batchSize = 200 } = {}) {
  if (!es.isReady()) return { ok: false, reason: 'elasticsearch_unavailable' };
  await es.ensureIndices();
  const client = es.getClient();
  let offset = 0, total = 0;
  while (true) {
    const ids = await db.query(
      `SELECT u.id FROM users u
       INNER JOIN candidate_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'candidate' AND u.deleted_at IS NULL AND cp.is_public = 1
       ORDER BY u.id ASC LIMIT ? OFFSET ?`,
      [Number(batchSize), Number(offset)]
    );
    if (!ids.length) break;
    const docs = [];
    for (const { id } of ids) {
      const row = await loadCandidateRow(id);
      if (row) docs.push(mapRow(row));
    }
    if (docs.length) {
      const body = docs.flatMap((doc) => [
        { index: { _index: es.INDEX.candidates, _id: String(doc.id) } },
        doc,
      ]);
      const res = await client.bulk({ refresh: false, operations: body });
      if (res?.errors) logger.warn('Candidate reindex had item-level errors');
    }
    total += ids.length;
    offset += ids.length;
  }
  try { await client.indices.refresh({ index: es.INDEX.candidates }); } catch (_) { /* noop */ }
  return { ok: true, indexed: total };
}

module.exports = {
  indexCandidate,
  removeCandidate,
  reindexAll,
};
