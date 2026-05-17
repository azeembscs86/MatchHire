'use strict';

/**
 * Candidate repository
 * --------------------
 * Data access for `candidate_profiles`, `candidate_skills`, and `preferences`.
 *
 * `recomputeProfileStrength` is a deterministic 0-100 score driven by which
 * fields are populated (headline, summary, resume, LinkedIn, location, and
 * a small bonus per skill). It is recomputed after every profile/skills
 * write so the `profile_strength` column stays accurate.
 */

const db = require('../config/database');

async function findProfileByUserId(user_id) {
  return db.queryOne(
    `SELECT cp.*, u.full_name, u.email, u.phone, u.avatar_url, u.status, u.created_at AS user_created_at
     FROM candidate_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = ? LIMIT 1`,
    [user_id]
  );
}

async function upsertProfile(user_id, fields, conn = null) {
  const exec = conn ? conn.execute.bind(conn) : (sql, params) => db.getPool().execute(sql, params);
  const allowed = [
    'headline','summary','current_title','years_experience','location','country','open_to_remote',
    'expected_salary_min','expected_salary_max','salary_currency','availability','resume_url',
    'portfolio_url','linkedin_url','github_url','languages','is_public',
  ];
  const cols = ['user_id']; const placeholders = ['?']; const values = [user_id];
  const updates = [];
  for (const k of allowed) {
    if (k in fields) {
      const v = k === 'languages' && Array.isArray(fields[k]) ? fields[k].join(',') : fields[k];
      cols.push(k); placeholders.push('?'); values.push(v);
      updates.push(`${k} = VALUES(${k})`);
    }
  }
  const sql = `INSERT INTO candidate_profiles (${cols.join(',')}) VALUES (${placeholders.join(',')})
               ${updates.length ? `ON DUPLICATE KEY UPDATE ${updates.join(', ')}` : ''}`;
  await exec(sql, values);
}

async function listSkills(user_id) {
  return db.query(
    `SELECT s.id, s.name, s.slug, s.category, cs.proficiency, cs.years_experience
     FROM candidate_skills cs
     INNER JOIN skills s ON s.id = cs.skill_id
     WHERE cs.candidate_user_id = ?
     ORDER BY s.name ASC`,
    [user_id]
  );
}

async function replaceSkills(user_id, skills = []) {
  return db.transaction(async (conn) => {
    await conn.execute('DELETE FROM candidate_skills WHERE candidate_user_id = ?', [user_id]);
    for (const sk of skills) {
      await conn.execute(
        `INSERT INTO candidate_skills (candidate_user_id, skill_id, proficiency, years_experience)
         VALUES (?, ?, ?, ?)`,
        [user_id, sk.skill_id, sk.proficiency || 'intermediate', sk.years_experience || 0]
      );
    }
  });
}

async function getPreferences(user_id) {
  return db.queryOne(`SELECT * FROM preferences WHERE user_id = ? LIMIT 1`, [user_id]);
}

async function upsertPreferences(user_id, p) {
  const data = {
    desired_titles: (p.desired_titles || []).join(','),
    preferred_locations: (p.preferred_locations || []).join(','),
    preferred_job_types: (p.preferred_job_types || []).join(','),
    preferred_categories: (p.preferred_categories || []).join(','),
    remote_only: p.remote_only ? 1 : 0,
    salary_min: p.salary_min ?? null,
    salary_max: p.salary_max ?? null,
    salary_currency: p.salary_currency || 'USD',
    notify_email: p.notify_email ? 1 : 0,
    notify_push: p.notify_push ? 1 : 0,
  };
  await db.getPool().execute(
    `INSERT INTO preferences
       (user_id, desired_titles, preferred_locations, preferred_job_types, preferred_categories,
        remote_only, salary_min, salary_max, salary_currency, notify_email, notify_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       desired_titles = VALUES(desired_titles),
       preferred_locations = VALUES(preferred_locations),
       preferred_job_types = VALUES(preferred_job_types),
       preferred_categories = VALUES(preferred_categories),
       remote_only = VALUES(remote_only),
       salary_min = VALUES(salary_min),
       salary_max = VALUES(salary_max),
       salary_currency = VALUES(salary_currency),
       notify_email = VALUES(notify_email),
       notify_push = VALUES(notify_push)`,
    [
      user_id, data.desired_titles, data.preferred_locations, data.preferred_job_types, data.preferred_categories,
      data.remote_only, data.salary_min, data.salary_max, data.salary_currency, data.notify_email, data.notify_push,
    ]
  );
}

async function listPublicCandidates({ keyword, location, skill, remote, experience_min, page = 1, limit = 10 }) {
  const where = ["u.status = 'active'", "u.deleted_at IS NULL", "cp.is_public = 1", "u.role = 'candidate'"];
  const params = [];
  if (keyword) {
    where.push('(u.full_name LIKE ? OR cp.headline LIKE ? OR cp.current_title LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (location) { where.push('cp.location LIKE ?'); params.push(`%${location}%`); }
  if (remote === true) where.push('cp.open_to_remote = 1');
  if (experience_min != null) { where.push('cp.years_experience >= ?'); params.push(experience_min); }
  let joinSkill = '';
  if (skill) {
    joinSkill = `INNER JOIN candidate_skills cs ON cs.candidate_user_id = u.id
                 INNER JOIN skills s ON s.id = cs.skill_id AND s.name LIKE ?`;
    params.push(`%${skill}%`);
  }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT DISTINCT u.id, u.full_name, u.avatar_url, u.email, u.created_at,
            cp.headline, cp.current_title, cp.years_experience, cp.location, cp.country,
            cp.open_to_remote, cp.profile_strength
     FROM users u
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     ${joinSkill}
     WHERE ${where.join(' AND ')}
     ORDER BY cp.profile_strength DESC, u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     ${joinSkill}
     WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function getPublicCandidate(id) {
  const row = await db.queryOne(
    `SELECT u.id, u.full_name, u.avatar_url, u.created_at,
            cp.headline, cp.summary, cp.current_title, cp.years_experience,
            cp.location, cp.country, cp.open_to_remote, cp.availability,
            cp.linkedin_url, cp.portfolio_url, cp.github_url, cp.languages, cp.profile_strength
     FROM users u
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? AND u.status = 'active' AND u.deleted_at IS NULL AND cp.is_public = 1
     LIMIT 1`,
    [id]
  );
  if (!row) return null;
  const skills = await listSkills(id);
  return { ...row, skills };
}

async function topCandidates(limit = 8) {
  return db.query(
    `SELECT u.id, u.full_name, u.avatar_url,
            cp.headline, cp.current_title, cp.years_experience, cp.location, cp.profile_strength
     FROM users u
     INNER JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE u.status = 'active' AND u.role = 'candidate' AND u.deleted_at IS NULL AND cp.is_public = 1
     ORDER BY cp.profile_strength DESC, cp.years_experience DESC
     LIMIT ?`,
    [Number(limit)]
  );
}

async function recomputeProfileStrength(user_id) {
  const row = await db.queryOne(
    `SELECT cp.headline, cp.summary, cp.resume_url, cp.linkedin_url, cp.portfolio_url, cp.location,
            (SELECT COUNT(*) FROM candidate_skills WHERE candidate_user_id = cp.user_id) AS skill_count
     FROM candidate_profiles cp WHERE cp.user_id = ? LIMIT 1`,
    [user_id]
  );
  if (!row) return 0;
  let score = 20;
  if (row.headline) score += 15;
  if (row.summary) score += 15;
  if (row.resume_url) score += 15;
  if (row.linkedin_url) score += 10;
  if (row.portfolio_url) score += 5;
  if (row.location) score += 5;
  score += Math.min(15, Number(row.skill_count) * 2);
  if (score > 100) score = 100;
  await db.getPool().execute('UPDATE candidate_profiles SET profile_strength = ? WHERE user_id = ?', [score, user_id]);
  return score;
}

module.exports = {
  findProfileByUserId,
  upsertProfile,
  listSkills,
  replaceSkills,
  getPreferences,
  upsertPreferences,
  listPublicCandidates,
  getPublicCandidate,
  topCandidates,
  recomputeProfileStrength,
};
