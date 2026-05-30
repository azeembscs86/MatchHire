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

async function listForCandidate(candidate_user_id, { page = 1, limit = 10, status, statuses, exclude_statuses }) {
  const where = ['a.candidate_user_id = ?'];
  const params = [candidate_user_id];
  // Three filtering modes, in priority order:
  //   1. `status`           — single value (legacy)
  //   2. `statuses[]`       — inclusion set (e.g. just "withdrawn")
  //   3. `exclude_statuses[]` — exclusion set (e.g. hide withdrawn)
  // Only one is honoured per call — `status` wins if both supplied.
  if (status) {
    where.push('a.status = ?');
    params.push(status);
  } else if (Array.isArray(statuses) && statuses.length > 0) {
    where.push(`a.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  } else if (Array.isArray(exclude_statuses) && exclude_statuses.length > 0) {
    where.push(`a.status NOT IN (${exclude_statuses.map(() => '?').join(',')})`);
    params.push(...exclude_statuses);
  }
  const offset = (page - 1) * limit;
  // Pulls everything the candidate-side Applications page needs
  // to render a JobCard for each application — title + company +
  // location + remote flag + work_mode + job_type for the card
  // chrome, salary range + deadline so the meta row is complete,
  // skills_tags so the chip row matches other surfaces, and the
  // expiry-related columns so the page can flag rows whose
  // posting closed after the candidate applied. Keeping all of
  // this in ONE query (vs joining on the candidate-facing list
  // again) keeps the dashboard's Applications tab a single
  // round-trip.
  // Keep the legacy aliases (job_id, job_title, job_location)
  // consumed by DashboardCandidate's Applied Jobs section, and
  // ADD the columns the dedicated Applications page needs (work
  // mode, salary range, deadline, skills, featured flag). The
  // row carries both `j.id` (preferred by toJobCardShape) and
  // `job_id` (legacy alias) so neither call site needs changing.
  const rows = await db.query(
    `SELECT a.id, a.status, a.applied_at, a.updated_at, a.expected_salary,
            j.id AS job_id, j.id AS j_id,
            j.title AS job_title, j.location AS job_location,
            j.city, j.country, j.is_remote, j.work_mode, j.is_global_remote,
            j.job_type, j.experience_level,
            j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
            j.application_deadline, j.skills_tags,
            j.published_at, j.created_at AS job_created_at,
            j.is_featured,
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

async function listApplicantsForJob(job_id, { page = 1, limit = 10, status, include_withdrawn = false }) {
  const where = ['a.job_id = ?'];
  const params = [job_id];
  if (status) {
    where.push('a.status = ?');
    params.push(status);
  } else if (!include_withdrawn) {
    // Withdrawn applications are hidden from the employer dashboard
    // by default — once a candidate pulls out, the employer doesn't
    // need to keep seeing them in the active pipeline. Set
    // `include_withdrawn: true` in admin / audit contexts that need
    // the full history.
    where.push("a.status <> 'withdrawn'");
  }
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
  // Employer-facing stats — withdrawn applications are explicitly
  // excluded so the company dashboard, by-status chart, and any
  // employer reports never surface them. Candidate-side stats keep
  // every status; that breakdown is for the candidate's own history.
  const rows = await db.query(
    `SELECT status, COUNT(*) AS count FROM applications
      WHERE company_id = ? AND status <> 'withdrawn'
      GROUP BY status`,
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
