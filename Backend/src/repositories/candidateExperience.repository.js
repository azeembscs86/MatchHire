'use strict';

/**
 * candidateExperience repository
 * ------------------------------
 * Thin data layer for the `candidate_experiences` table. Every row
 * is scoped to its owning candidate; callers MUST always pass
 * `user_id` so we can enforce ownership in the WHERE clause — no
 * "trust the body" updates ever reach this layer.
 *
 * Sort policy (matches the UI):
 *   - is_current rows float to the top (NULL end_date is treated as
 *     "still here")
 *   - then by end_date DESC (more recent end = closer to today)
 *   - then by start_date DESC as a tiebreaker
 *   - finally by id DESC so newly added entries appear stable above
 *     same-date rows
 *
 * `sort_order` is reserved for an explicit drag-to-reorder feature
 * later; current writes leave it at 0.
 */

const db = require('../config/database');

const FIELDS = ['company', 'title', 'start_date', 'end_date', 'is_current', 'description'];

async function listForUser(user_id) {
  return db.query(
    `SELECT id, candidate_user_id, company, title, start_date, end_date,
            is_current, description, sort_order, created_at, updated_at
     FROM candidate_experiences
     WHERE candidate_user_id = ?
     ORDER BY is_current DESC,
              COALESCE(end_date, '9999-12-31') DESC,
              start_date DESC,
              id DESC`,
    [user_id]
  );
}

async function findOwned(user_id, id) {
  return db.queryOne(
    `SELECT id, candidate_user_id, company, title, start_date, end_date,
            is_current, description, sort_order, created_at, updated_at
     FROM candidate_experiences
     WHERE candidate_user_id = ? AND id = ?
     LIMIT 1`,
    [user_id, id]
  );
}

async function create(user_id, payload) {
  const data = sanitize(payload);
  const [res] = await db.getPool().execute(
    `INSERT INTO candidate_experiences
       (candidate_user_id, company, title, start_date, end_date, is_current, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      data.company,
      data.title,
      data.start_date,
      data.end_date,
      data.is_current,
      data.description,
    ]
  );
  return res.insertId;
}

async function update(user_id, id, payload) {
  const data = sanitize(payload, { partial: true });
  const cols = [];
  const vals = [];
  for (const k of FIELDS) {
    if (k in data) { cols.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (!cols.length) return 0;
  vals.push(user_id, id);
  const [res] = await db.getPool().execute(
    `UPDATE candidate_experiences SET ${cols.join(', ')}
     WHERE candidate_user_id = ? AND id = ?`,
    vals
  );
  return res?.affectedRows || 0;
}

async function remove(user_id, id) {
  const [res] = await db.getPool().execute(
    `DELETE FROM candidate_experiences WHERE candidate_user_id = ? AND id = ?`,
    [user_id, id]
  );
  return res?.affectedRows > 0;
}

async function countForUser(user_id) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS n FROM candidate_experiences WHERE candidate_user_id = ?`,
    [user_id]
  );
  return Number(row?.n || 0);
}

/**
 * Normalise inbound payloads:
 *   - `is_current=true` forces `end_date=null` (matches UI behaviour)
 *   - missing optional fields are not written (partial update path)
 */
function sanitize(input, { partial = false } = {}) {
  const out = {};
  if ('company' in input) out.company = String(input.company || '').trim();
  if ('title' in input) out.title = String(input.title || '').trim();
  if ('start_date' in input) out.start_date = input.start_date || null;
  if ('end_date' in input) out.end_date = input.end_date || null;
  if ('is_current' in input) out.is_current = input.is_current ? 1 : 0;
  if ('description' in input) {
    const d = input.description == null ? null : String(input.description);
    out.description = d && d.trim().length ? d : null;
  }
  if (out.is_current === 1) out.end_date = null;
  if (!partial) {
    // For create() — these are required by the table.
    out.company = out.company || '';
    out.title = out.title || '';
    out.start_date = out.start_date || null;
    if (!('is_current' in out)) out.is_current = 0;
    if (!('description' in out)) out.description = null;
  }
  return out;
}

module.exports = {
  listForUser,
  findOwned,
  create,
  update,
  remove,
  countForUser,
};
