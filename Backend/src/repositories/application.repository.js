'use strict';

/**
 * Application repository
 * ----------------------
 * Data access for `applications` (the join between a candidate and a job).
 *
 * The composite unique key `(job_id, candidate_user_id)` enforces "one
 * application per candidate per job". `applications_count` on the parent
 * `jobs` row is incremented atomically inside `create`.
 */

const db = require('../config/database');

async function create({ job_id, candidate_user_id, company_id, cover_letter, resume_url, expected_salary }) {
  const [res] = await db.getPool().execute(
    `INSERT INTO applications (job_id, candidate_user_id, company_id, cover_letter, resume_url, expected_salary, status)
     VALUES (?, ?, ?, ?, ?, ?, 'applied')`,
    [job_id, candidate_user_id, company_id, cover_letter || null, resume_url || null, expected_salary ?? null]
  );
  await db.getPool().execute(
    `UPDATE jobs SET applications_count = applications_count + 1 WHERE id = ?`,
    [job_id]
  );
  return res.insertId;
}

async function findById(id) {
  return db.queryOne(
    `SELECT a.*, j.title AS job_title, j.company_id, c.name AS company_name
     FROM applications a
     INNER JOIN jobs j ON j.id = a.job_id
     INNER JOIN companies c ON c.id = a.company_id
     WHERE a.id = ? LIMIT 1`,
    [id]
  );
}

async function findByJobAndCandidate(job_id, candidate_user_id) {
  return db.queryOne(
    `SELECT id, status FROM applications WHERE job_id = ? AND candidate_user_id = ? LIMIT 1`,
    [job_id, candidate_user_id]
  );
}

async function listForCandidate(candidate_user_id, { page = 1, limit = 10, status }) {
  const where = ['a.candidate_user_id = ?'];
  const params = [candidate_user_id];
  if (status) { where.push('a.status = ?'); params.push(status); }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT a.id, a.status, a.applied_at, a.updated_at, a.expected_salary,
            j.id AS job_id, j.title AS job_title, j.location AS job_location, j.is_remote, j.job_type,
            c.id AS company_id, c.name AS company_name, c.logo_url AS company_logo
     FROM applications a
     INNER JOIN jobs j ON j.id = a.job_id
     INNER JOIN companies c ON c.id = a.company_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM applications a WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function listApplicantsForJob(job_id, { page = 1, limit = 10, status }) {
  const where = ['a.job_id = ?'];
  const params = [job_id];
  if (status) { where.push('a.status = ?'); params.push(status); }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT a.id, a.status, a.applied_at, a.expected_salary, a.cover_letter, a.resume_url,
            u.id AS candidate_id, u.full_name AS candidate_name, u.email AS candidate_email, u.avatar_url,
            cp.headline, cp.current_title, cp.years_experience, cp.location, cp.profile_strength
     FROM applications a
     INNER JOIN users u ON u.id = a.candidate_user_id
     LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM applications a WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function setStatus(id, status, reason = null) {
  const sets = ['status = ?'];
  const params = [status];
  if (status === 'rejected' && reason) { sets.push('rejection_reason = ?'); params.push(reason); }
  params.push(id);
  await db.getPool().execute(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function statsForCandidate(candidate_user_id) {
  const rows = await db.query(
    `SELECT status, COUNT(*) AS count FROM applications WHERE candidate_user_id = ? GROUP BY status`,
    [candidate_user_id]
  );
  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  return { total, by_status: map };
}

async function statsForCompany(company_id) {
  const rows = await db.query(
    `SELECT status, COUNT(*) AS count FROM applications WHERE company_id = ? GROUP BY status`,
    [company_id]
  );
  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  return { total, by_status: map };
}

async function totalCount() {
  const row = await db.queryOne(`SELECT COUNT(*) AS total FROM applications`);
  return Number(row?.total || 0);
}

module.exports = {
  create,
  findById,
  findByJobAndCandidate,
  listForCandidate,
  listApplicantsForJob,
  setStatus,
  statsForCandidate,
  statsForCompany,
  totalCount,
};
