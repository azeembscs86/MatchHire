'use strict';

/**
 * savedJob repository
 * -------------------
 * Data access for `saved_jobs` (candidate "save for apply later" surface).
 *
 * Separate from `favorites` per product spec — favourites express
 * interest (no expiry), saved_jobs express apply-intent (expires when
 * the job's application_deadline passes). The two surfaces are kept
 * apart so the candidate dashboard can render distinct sections with
 * distinct actions.
 *
 * Idempotency:
 *   - `add()` uses `ON DUPLICATE KEY UPDATE updated_at = NOW()` so a
 *     re-save is a no-op rather than a 409, matching the favorites
 *     contract callers expect.
 *
 * Expiry rule (read-time):
 *   - We filter `expires_at IS NULL OR expires_at > NOW()` so expired
 *     saves drop out of the active list without needing a cron sweep.
 */

const db = require('../config/database');

async function add(user_id, job_id, expires_at) {
  await db.getPool().execute(
    `INSERT INTO saved_jobs (candidate_user_id, job_id, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       expires_at = VALUES(expires_at),
       status = 'active',
       updated_at = NOW()`,
    [user_id, job_id, expires_at || null]
  );
}

async function remove(user_id, job_id) {
  const [res] = await db.getPool().execute(
    `DELETE FROM saved_jobs WHERE candidate_user_id = ? AND job_id = ?`,
    [user_id, job_id]
  );
  return res.affectedRows > 0;
}

async function exists(user_id, job_id) {
  const row = await db.queryOne(
    `SELECT id FROM saved_jobs
     WHERE candidate_user_id = ? AND job_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [user_id, job_id]
  );
  return !!row;
}

/**
 * Paginated active list for a candidate. Joins jobs + companies for
 * card rendering, excludes expired rows (or jobs that were soft-
 * deleted upstream), and orders newest-saved first.
 *
 * `include_expired=true` is reserved for a "Saved – expired" tab if
 * we ever add one; default is false so the dashboard only sees rows
 * the candidate can still act on.
 */
async function list(user_id, { page = 1, limit = 10, include_expired = false } = {}) {
  const offset = (page - 1) * limit;
  const expiryClause = include_expired
    ? ''
    : 'AND (sj.expires_at IS NULL OR sj.expires_at > NOW())';

  const rows = await db.query(
    `SELECT sj.id AS saved_id, sj.saved_at, sj.expires_at, sj.status AS saved_status,
            j.id, j.title, j.slug, j.location, j.is_remote, j.job_type, j.experience_level,
            j.salary_min, j.salary_max, j.salary_currency, j.skills_tags, j.is_featured,
            j.application_deadline, j.status AS job_status,
            c.id AS company_id, c.name AS company_name, c.logo_url AS company_logo
     FROM saved_jobs sj
     INNER JOIN jobs j ON j.id = sj.job_id AND j.deleted_at IS NULL
     INNER JOIN companies c ON c.id = j.company_id
     WHERE sj.candidate_user_id = ? AND sj.status = 'active' ${expiryClause}
     ORDER BY sj.saved_at DESC
     LIMIT ? OFFSET ?`,
    [user_id, Number(limit), Number(offset)]
  );

  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM saved_jobs sj
     INNER JOIN jobs j ON j.id = sj.job_id AND j.deleted_at IS NULL
     WHERE sj.candidate_user_id = ? AND sj.status = 'active' ${expiryClause}`,
    [user_id]
  );
  return { rows, total: Number(countRow?.total || 0) };
}

/** Job ids the candidate has saved — used to flag JobCards in feeds. */
async function listIdsForUser(user_id) {
  const rows = await db.query(
    `SELECT job_id FROM saved_jobs
     WHERE candidate_user_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [user_id]
  );
  return rows.map((r) => Number(r.job_id));
}

module.exports = { add, remove, exists, list, listIdsForUser };
