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
    'profile_image',
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

/**
 * Append skills to a candidate without disturbing existing ones.
 * Relies on `UNIQUE(candidate_user_id, skill_id)` + ON DUPLICATE KEY
 * UPDATE so duplicates are silently merged (the proficiency /
 * years_experience are refreshed to the latest values if supplied).
 *
 * Returns the number of NEW rows actually inserted (affectedRows-2
 * accounting comes from `INSERT IGNORE` semantics; we just count
 * pre/post).
 */
async function addSkills(user_id, skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) return 0;
  let inserted = 0;
  await db.transaction(async (conn) => {
    for (const sk of skills) {
      const [res] = await conn.execute(
        `INSERT INTO candidate_skills (candidate_user_id, skill_id, proficiency, years_experience)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           proficiency = VALUES(proficiency),
           years_experience = VALUES(years_experience)`,
        [user_id, sk.skill_id, sk.proficiency || 'intermediate', sk.years_experience || 0]
      );
      // mysql2 returns affectedRows=1 for fresh insert, 2 for ON DUP UPDATE.
      if (res?.affectedRows === 1) inserted += 1;
    }
  });
  return inserted;
}

/** Remove a single skill from a candidate's set. Idempotent. */
async function removeSkill(user_id, skill_id) {
  const [res] = await db.getPool().execute(
    `DELETE FROM candidate_skills WHERE candidate_user_id = ? AND skill_id = ?`,
    [user_id, skill_id]
  );
  return res?.affectedRows > 0;
}

/** Count the candidate's current skills (cheap — UNIQUE index). */
async function countSkills(user_id) {
  const row = await db.queryOne(
    `SELECT COUNT(*) AS n FROM candidate_skills WHERE candidate_user_id = ?`,
    [user_id]
  );
  return Number(row?.n || 0);
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

/**
 * Recompute the 0-100 completion score from the spec rubric.
 *
 *   Section            Weight  When fully credited
 *   -----------------  ------  ---------------------------------------
 *   profile_image       10%    candidate_profiles.profile_image set
 *   basic_info          15%    headline + current_title + years_experience
 *   contact_info        10%    phone OR (location + country)
 *   skills_expertise    15%    >= 3 candidate_skills rows
 *   work_experience     15%    years_experience > 0 AND current_title
 *   education           10%    languages set OR parsed-resume education JSON
 *   resume_upload       10%    a resumes row exists OR resume_url set
 *   job_preferences     10%    preferences row with desired_titles populated
 *   social_links         5%    linkedin_url OR portfolio_url OR github_url
 *
 * Each section can be partially credited (e.g. basic_info: 2 of 3
 * sub-fields populated = 10/15) so the bar moves smoothly as the
 * user fills the form, rather than jumping in chunky 15% increments.
 *
 * Stored in `candidate_profiles.profile_strength`. The per-section
 * breakdown is recomputed on demand by
 * `profile.service.computeCompletion()` and never persisted, so the
 * UI's hints always reflect current data.
 */
async function recomputeProfileStrength(user_id) {
  const result = await computeCompletionBreakdown(user_id);
  await db.getPool().execute(
    'UPDATE candidate_profiles SET profile_strength = ? WHERE user_id = ?',
    [result.score, user_id]
  );
  return result.score;
}

/**
 * Pure (no writes) calculation used by both the recompute hook
 * above and the read-only `/profile-completion` endpoint. Returns
 * the total score AND the per-section breakdown so the frontend can
 * render hints without a second round-trip.
 */
async function computeCompletionBreakdown(user_id) {
  const cp = await db.queryOne(
    `SELECT cp.headline, cp.summary, cp.current_title, cp.years_experience,
            cp.location, cp.country, cp.resume_url, cp.linkedin_url, cp.portfolio_url,
            cp.github_url, cp.languages, cp.profile_image,
            u.phone, u.full_name, u.avatar_url
     FROM candidate_profiles cp
     INNER JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = ? LIMIT 1`,
    [user_id]
  );
  if (!cp) return { score: 0, sections: [], totals: { earned: 0, max: 100 } };

  const skillCount = Number(
    (await db.queryOne(
      `SELECT COUNT(*) AS n FROM candidate_skills WHERE candidate_user_id = ?`,
      [user_id]
    ))?.n || 0
  );
  const resumeRow = await db.queryOne(
    `SELECT id FROM resumes WHERE candidate_user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [user_id]
  );
  const parsedEdu = await db.queryOne(
    `SELECT education FROM resume_parsed_data WHERE candidate_user_id = ? LIMIT 1`,
    [user_id]
  );
  const prefs = await db.queryOne(
    `SELECT desired_titles, preferred_locations FROM preferences WHERE user_id = ? LIMIT 1`,
    [user_id]
  );

  // Each section: max weight + a 0..1 "fill ratio".
  const sections = [
    {
      key: 'profile_image',
      label: 'Profile image',
      weight: 10,
      fill: cp.profile_image ? 1 : 0,
      hint: 'Upload your profile image to improve profile visibility.',
    },
    {
      key: 'basic_info',
      label: 'Basic info',
      weight: 15,
      fill: scoreFraction([!!cp.full_name, !!cp.headline, !!cp.current_title]),
      hint: 'Add your headline and current job title so recruiters know your role at a glance.',
    },
    {
      key: 'contact_info',
      label: 'Contact info',
      weight: 10,
      fill: scoreFraction([!!cp.phone, !!cp.location, !!cp.country]),
      hint: 'Add a phone number and location so we can match local roles.',
    },
    {
      key: 'skills_expertise',
      label: 'Skills & expertise',
      weight: 15,
      // 3 skills = fully credited; 1 skill = 1/3; saturates at 1.
      fill: Math.min(1, skillCount / 3),
      hint: 'Add at least 3 skills to get better job matches.',
    },
    {
      key: 'work_experience',
      label: 'Work experience',
      weight: 15,
      // current_title + a positive years_experience together = full credit.
      fill: scoreFraction([!!cp.current_title, Number(cp.years_experience) > 0]),
      hint: 'Add work experience to increase your profile strength.',
    },
    {
      key: 'education',
      label: 'Education',
      weight: 10,
      // No dedicated education table yet; we credit when languages
      // are listed OR the parsed-resume education JSON is non-empty.
      fill: ((cp.languages && String(cp.languages).trim()) || parsedEducationFilled(parsedEdu?.education)) ? 1 : 0,
      hint: 'Add your education history (upload a resume — we extract education automatically).',
    },
    {
      key: 'resume_upload',
      label: 'Resume',
      weight: 10,
      fill: (resumeRow || cp.resume_url) ? 1 : 0,
      hint: 'Upload your resume so companies can review your experience.',
    },
    {
      key: 'job_preferences',
      label: 'Job preferences',
      weight: 10,
      fill: scoreFraction([
        !!(prefs?.desired_titles && String(prefs.desired_titles).trim()),
        !!(prefs?.preferred_locations && String(prefs.preferred_locations).trim()),
      ]),
      hint: 'Complete job preferences to receive relevant openings.',
    },
    {
      key: 'social_links',
      label: 'Social links & portfolio',
      weight: 5,
      fill: scoreFraction([!!cp.linkedin_url, !!cp.portfolio_url, !!cp.github_url]),
      hint: 'Add a LinkedIn / portfolio / GitHub link so recruiters can verify your work.',
    },
  ];

  let earned = 0;
  for (const s of sections) {
    s.earned = Math.round(s.weight * Math.min(1, Math.max(0, s.fill)));
    earned += s.earned;
  }
  const score = Math.min(100, earned);
  return {
    score,
    sections: sections.map((s) => ({
      key: s.key,
      label: s.label,
      weight: s.weight,
      earned: s.earned,
      // Surface as a 0..100 percentage of the section's own weight
      percent: Math.round((s.earned / s.weight) * 100),
      complete: s.earned >= s.weight,
      hint: s.earned >= s.weight ? null : s.hint,
    })),
    totals: { earned, max: 100 },
  };
}

/** Treat parsed-resume education as "filled" only when it's a non-empty JSON array. */
function parsedEducationFilled(raw) {
  if (!raw) return false;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch { return false; }
}

/** Fraction of `checks` (booleans) that are true, in [0, 1]. */
function scoreFraction(checks) {
  if (!checks.length) return 0;
  const hits = checks.filter(Boolean).length;
  return hits / checks.length;
}

module.exports = {
  findProfileByUserId,
  upsertProfile,
  listSkills,
  replaceSkills,
  addSkills,
  removeSkill,
  countSkills,
  getPreferences,
  upsertPreferences,
  listPublicCandidates,
  getPublicCandidate,
  topCandidates,
  recomputeProfileStrength,
  computeCompletionBreakdown,
};
