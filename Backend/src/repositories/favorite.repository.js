'use strict';

/**
 * Favorite repository
 * -------------------
 * Data access for `favorites` (saved jobs). `INSERT IGNORE` keeps the API
 * idempotent: re-favoriting the same job is a no-op rather than an error.
 */

const db = require('../config/database');

async function add(user_id, job_id) {
  await db.getPool().execute(
    `INSERT IGNORE INTO favorites (user_id, job_id) VALUES (?, ?)`,
    [user_id, job_id]
  );
}

async function remove(user_id, job_id) {
  const [res] = await db.getPool().execute(
    `DELETE FROM favorites WHERE user_id = ? AND job_id = ?`,
    [user_id, job_id]
  );
  return res.affectedRows > 0;
}

/**
 * Paginated list of a candidate's favourited jobs. Filters out rows
 * where the underlying job has expired, been closed/archived, soft-
 * deleted, or whose company has been deactivated, so the dashboard
 * only surfaces actionable favourites. The favorite row itself is
 * preserved in the DB (only the LIST result is filtered) so if the
 * employer revives the job, the favourite reappears automatically.
 */
async function list(user_id, { page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  const activeJobClauses = `
    AND j.deleted_at IS NULL
    AND j.status = 'open'
    AND j.admin_status = 'approved'
    AND c.status = 'active'
    AND (j.application_deadline IS NULL OR j.application_deadline > NOW())
  `;
  const rows = await db.query(
    `SELECT f.id AS favorite_id, f.created_at AS favorited_at,
            j.id, j.title, j.slug, j.location, j.is_remote, j.job_type, j.experience_level,
            j.salary_min, j.salary_max, j.salary_currency, j.skills_tags, j.is_featured,
            j.application_deadline,
            c.id AS company_id, c.name AS company_name, c.logo_url AS company_logo
     FROM favorites f
     INNER JOIN jobs j ON j.id = f.job_id
     INNER JOIN companies c ON c.id = j.company_id
     WHERE f.user_id = ? ${activeJobClauses}
     ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    [user_id, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM favorites f
     INNER JOIN jobs j ON j.id = f.job_id
     INNER JOIN companies c ON c.id = j.company_id
     WHERE f.user_id = ? ${activeJobClauses}`,
    [user_id]
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function exists(user_id, job_id) {
  const row = await db.queryOne(`SELECT id FROM favorites WHERE user_id = ? AND job_id = ? LIMIT 1`, [user_id, job_id]);
  return !!row;
}

module.exports = { add, remove, list, exists };
