'use strict';

/**
 * candidatePortfolio repository
 * -----------------------------
 * Data layer for `candidate_portfolio_items` — the universal
 * "Work Portfolio & Achievements" surface. Every method is scoped
 * to the owning candidate via `candidate_user_id`; visibility
 * gating is enforced by the SERVICE layer so this file stays a
 * thin SQL wrapper.
 *
 * Sort policy (matches the editor + the company-view block):
 *   - is_current rows float to the top.
 *   - then by end_date DESC (more recent → closer to today).
 *   - then start_date DESC, finally id DESC for stability.
 *
 * `skills_used` and `tools_used` are JSON columns; we serialise
 * on write and parse on read so callers always see arrays.
 */

const db = require('../config/database');

const COLS = `id, candidate_user_id, title, item_type, category, role_responsibility,
              skills_used, tools_used, description, impact,
              proof_file_url, external_link,
              start_date, end_date, is_current,
              visibility, completeness_score, sort_order,
              created_at, updated_at`;

function decodeRow(r) {
  if (!r) return r;
  const parse = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return []; }
  };
  return {
    ...r,
    skills_used: parse(r.skills_used),
    tools_used: parse(r.tools_used),
    is_current: !!r.is_current,
  };
}

async function listForUser(candidate_user_id) {
  const rows = await db.query(
    `SELECT ${COLS} FROM candidate_portfolio_items
     WHERE candidate_user_id = ? AND deleted_at IS NULL
     ORDER BY is_current DESC,
              COALESCE(end_date, '9999-12-31') DESC,
              start_date DESC, id DESC`,
    [candidate_user_id]
  );
  return rows.map(decodeRow);
}

/**
 * Visibility-filtered list for a foreign viewer (an employer
 * looking at a candidate's public profile). `viewerRole` is the
 * authenticated viewer's role; `selfView` is `true` when the
 * candidate is viewing their own profile (private rows visible).
 */
async function listForViewer(candidate_user_id, { viewerRole = null, selfView = false } = {}) {
  // Build visibility predicate based on viewer role.
  let predicate;
  if (selfView) {
    predicate = `1`; // everything
  } else if (viewerRole === 'employer') {
    predicate = `visibility IN ('public', 'companies_only')`;
  } else {
    predicate = `visibility = 'public'`;
  }
  const rows = await db.query(
    `SELECT ${COLS} FROM candidate_portfolio_items
     WHERE candidate_user_id = ? AND deleted_at IS NULL AND ${predicate}
     ORDER BY is_current DESC,
              COALESCE(end_date, '9999-12-31') DESC,
              start_date DESC, id DESC`,
    [candidate_user_id]
  );
  return rows.map(decodeRow);
}

async function findOwned(candidate_user_id, id) {
  const row = await db.queryOne(
    `SELECT ${COLS} FROM candidate_portfolio_items
     WHERE candidate_user_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [candidate_user_id, id]
  );
  return decodeRow(row);
}

async function create(candidate_user_id, payload) {
  const [res] = await db.getPool().execute(
    `INSERT INTO candidate_portfolio_items
       (candidate_user_id, title, item_type, category, role_responsibility,
        skills_used, tools_used, description, impact,
        proof_file_url, external_link,
        start_date, end_date, is_current,
        visibility, completeness_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      candidate_user_id,
      payload.title,
      payload.item_type || 'project',
      payload.category || null,
      payload.role_responsibility || null,
      JSON.stringify(payload.skills_used || []),
      JSON.stringify(payload.tools_used || []),
      payload.description || null,
      payload.impact || null,
      payload.proof_file_url || null,
      payload.external_link || null,
      payload.start_date || null,
      payload.end_date || null,
      payload.is_current ? 1 : 0,
      payload.visibility || 'companies_only',
      Number(payload.completeness_score || 0),
    ]
  );
  return res.insertId;
}

async function update(candidate_user_id, id, payload) {
  const allowed = [
    'title', 'item_type', 'category', 'role_responsibility',
    'description', 'impact', 'proof_file_url', 'external_link',
    'start_date', 'end_date', 'visibility',
  ];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (k in payload) { sets.push(`${k} = ?`); params.push(payload[k] ?? null); }
  }
  if ('skills_used' in payload) {
    sets.push('skills_used = ?'); params.push(JSON.stringify(payload.skills_used || []));
  }
  if ('tools_used' in payload) {
    sets.push('tools_used = ?'); params.push(JSON.stringify(payload.tools_used || []));
  }
  if ('is_current' in payload) {
    sets.push('is_current = ?'); params.push(payload.is_current ? 1 : 0);
  }
  if ('completeness_score' in payload) {
    sets.push('completeness_score = ?'); params.push(Number(payload.completeness_score || 0));
  }
  if (sets.length === 0) return false;
  params.push(candidate_user_id, id);
  const [res] = await db.getPool().execute(
    `UPDATE candidate_portfolio_items SET ${sets.join(', ')}
     WHERE candidate_user_id = ? AND id = ? AND deleted_at IS NULL`,
    params
  );
  return res.affectedRows > 0;
}

async function softDelete(candidate_user_id, id) {
  const [res] = await db.getPool().execute(
    `UPDATE candidate_portfolio_items SET deleted_at = NOW()
     WHERE candidate_user_id = ? AND id = ? AND deleted_at IS NULL`,
    [candidate_user_id, id]
  );
  return res.affectedRows > 0;
}

async function countForUser(candidate_user_id) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS n FROM candidate_portfolio_items
     WHERE candidate_user_id = ? AND deleted_at IS NULL`,
    [candidate_user_id]
  );
  return Number(row?.n || 0);
}

module.exports = {
  listForUser,
  listForViewer,
  findOwned,
  create,
  update,
  softDelete,
  countForUser,
};
