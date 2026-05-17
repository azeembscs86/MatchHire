'use strict';

/**
 * Interview repository
 * --------------------
 * Data access for `interviews`. Each row pins back to its application, job,
 * company, candidate, and the employer who scheduled it - the heavy FK
 * footprint keeps the dashboards joinable without N+1 queries.
 */

const db = require('../config/database');

async function create(data) {
  const [res] = await db.getPool().execute(
    `INSERT INTO interviews
      (application_id, job_id, company_id, candidate_user_id, employer_user_id,
       scheduled_at, duration_minutes, mode, location, meeting_url, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
    [
      data.application_id, data.job_id, data.company_id, data.candidate_user_id, data.employer_user_id || null,
      data.scheduled_at, data.duration_minutes || 45, data.mode || 'video', data.location || null,
      data.meeting_url || null, data.notes || null,
    ]
  );
  return res.insertId;
}

async function listForCandidate(candidate_user_id) {
  return db.query(
    `SELECT i.id, i.scheduled_at, i.duration_minutes, i.mode, i.location, i.meeting_url, i.status, i.notes,
            j.id AS job_id, j.title AS job_title,
            c.id AS company_id, c.name AS company_name, c.logo_url AS company_logo
     FROM interviews i
     INNER JOIN jobs j ON j.id = i.job_id
     INNER JOIN companies c ON c.id = i.company_id
     WHERE i.candidate_user_id = ?
     ORDER BY i.scheduled_at DESC`,
    [candidate_user_id]
  );
}

async function listForCompany(company_id, { page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT i.id, i.scheduled_at, i.duration_minutes, i.mode, i.location, i.meeting_url, i.status, i.notes,
            j.id AS job_id, j.title AS job_title,
            u.id AS candidate_id, u.full_name AS candidate_name, u.avatar_url
     FROM interviews i
     INNER JOIN jobs j ON j.id = i.job_id
     INNER JOIN users u ON u.id = i.candidate_user_id
     WHERE i.company_id = ?
     ORDER BY i.scheduled_at DESC LIMIT ? OFFSET ?`,
    [company_id, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM interviews WHERE company_id = ?`,
    [company_id]
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function statsForCompany(company_id) {
  const rows = await db.query(
    `SELECT status, COUNT(*) AS count FROM interviews WHERE company_id = ? GROUP BY status`,
    [company_id]
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

module.exports = {
  create,
  listForCandidate,
  listForCompany,
  statsForCompany,
};
