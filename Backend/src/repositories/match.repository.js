'use strict';

/**
 * Match results repository
 * ------------------------
 * Persists every apply-time match decision into
 * `application_match_results`. The application_id is filled in after
 * the application row is created (or stays null when the application
 * was rejected outright). Used by:
 *
 *   - the company dashboard, to show match scores next to applicants
 *   - the admin dashboard, to surface rejected applications + reasons
 *   - the audit log
 */

const db = require('../config/database');

async function save({ application_id, candidate_user_id, job_id, match_score, decision, reasons, missing, rejection_message }) {
  const [res] = await db.getPool().execute(
    `INSERT INTO application_match_results
       (application_id, candidate_user_id, job_id, match_score, decision, reasons, missing, rejection_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      application_id || null,
      candidate_user_id,
      job_id,
      Math.max(0, Math.min(100, Math.round(Number(match_score) || 0))),
      decision,
      reasons ? JSON.stringify(reasons) : null,
      missing ? JSON.stringify(missing) : null,
      rejection_message || null,
    ]
  );
  return res.insertId;
}

async function listRejectedForAdmin({ page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT amr.id, amr.match_score, amr.decision, amr.rejection_message, amr.created_at,
            u.full_name AS candidate_name, u.email AS candidate_email,
            j.title AS job_title, c.name AS company_name
     FROM application_match_results amr
     INNER JOIN users u ON u.id = amr.candidate_user_id
     INNER JOIN jobs j ON j.id = amr.job_id
     INNER JOIN companies c ON c.id = j.company_id
     WHERE amr.decision = 'rejected'
     ORDER BY amr.created_at DESC LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM application_match_results WHERE decision = 'rejected'`
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function statsByDecision() {
  const rows = await db.query(
    `SELECT decision, COUNT(*) AS count, AVG(match_score) AS avg_score
     FROM application_match_results GROUP BY decision`
  );
  return Object.fromEntries(rows.map((r) => [r.decision, { count: Number(r.count), avg_score: Math.round(Number(r.avg_score) || 0) }]));
}

async function jobsByLocation({ limit = 10 } = {}) {
  // Country / city demand snapshot for the admin dashboard.
  return db.query(
    `SELECT
       COALESCE(country, 'Global Remote') AS country,
       COALESCE(city, '') AS city,
       COUNT(*) AS jobs,
       SUM(applications_count) AS applications
     FROM jobs
     WHERE deleted_at IS NULL AND status = 'open'
     GROUP BY country, city
     ORDER BY jobs DESC, applications DESC
     LIMIT ?`,
    [Number(limit)]
  );
}

async function getLatestForApplication(application_id) {
  return db.queryOne(
    `SELECT * FROM application_match_results WHERE application_id = ? ORDER BY id DESC LIMIT 1`,
    [application_id]
  );
}

module.exports = {
  save,
  listRejectedForAdmin,
  statsByDecision,
  jobsByLocation,
  getLatestForApplication,
};
