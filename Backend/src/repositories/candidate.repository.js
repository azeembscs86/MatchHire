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
    'headline','summary','current_title','desired_role','years_experience','location','country','education',
    'open_to_remote','work_preference','relocation_scope',
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
  const row = await db.queryOne(
    `SELECT * FROM preferences WHERE user_id = ? LIMIT 1`,
    [user_id]
  );
  if (!row) return null;
  // mysql2 returns JSON columns as already-parsed objects, but a
  // belt-and-braces parse handles edge cases (server_version differences,
  // text-coerced JSON, missing fields on never-saved rows).
  const parseJson = (v, fallback) => {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(String(v)); } catch { return fallback; }
  };
  return {
    ...row,
    priorities:    parseJson(row.priorities, []),
    match_weights: parseJson(row.match_weights, {}),
    deal_breakers: parseJson(row.deal_breakers, []),
  };
}

async function upsertPreferences(user_id, p) {
  /*
   * One UPSERT touches every column on the table. Storage shapes:
   *   - CSV columns       (desired_titles, work_modes, ...) join(',')
   *   - JSON columns      (priorities, match_weights, deal_breakers) JSON.stringify
   *   - ENUM/scalar       passed through with sensible defaults
   *   - Booleans          coerced to 0/1
   *
   * `getPreferences` reverses each shape on the read side.
   */
  const csv = (arr) => (Array.isArray(arr) ? arr.join(',') : '');
  const json = (val) => (val == null ? null : JSON.stringify(val));

  const data = {
    // --- legacy (matching engine) ---
    desired_titles: csv(p.desired_titles),
    preferred_locations: csv(p.preferred_locations),
    preferred_job_types: csv(p.preferred_job_types),
    preferred_categories: csv(p.preferred_categories),
    job_scope: p.job_scope || 'hybrid',
    remote_only: p.remote_only ? 1 : 0,
    salary_min: p.salary_min ?? null,
    salary_max: p.salary_max ?? null,
    salary_currency: p.salary_currency || 'USD',
    notify_email: p.notify_email ? 1 : 0,
    notify_push: p.notify_push ? 1 : 0,
    // --- new (migration 032) ---
    priorities: json(p.priorities || []),
    experience_levels: csv(p.experience_levels),
    compensation_benefits: csv(p.compensation_benefits),
    work_modes: csv(p.work_modes),
    company_stages: csv(p.company_stages),
    deal_breakers: json(p.deal_breakers || []),
    relocate_open: p.relocate_open ? 1 : 0,
    visa_sponsorship_needed: p.visa_sponsorship_needed ? 1 : 0,
    timezone_overlap_required: p.timezone_overlap_required ? 1 : 0,
    match_weights: json(p.match_weights || {}),
    email_frequency: p.email_frequency || 'daily',
    minimum_match_score: p.minimum_match_score ?? 70,
    recruiter_messages: p.recruiter_messages == null ? 1 : (p.recruiter_messages ? 1 : 0),
    interview_reminders: p.interview_reminders == null ? 1 : (p.interview_reminders ? 1 : 0),
    weekly_profile_insights: p.weekly_profile_insights == null ? 1 : (p.weekly_profile_insights ? 1 : 0),
    salary_trend_alerts: p.salary_trend_alerts ? 1 : 0,
  };

  // The column list is ordered to match the placeholder list exactly.
  // 28 columns including user_id — keep them lockstep when editing.
  await db.getPool().execute(
    `INSERT INTO preferences
       (user_id,
        desired_titles, preferred_locations, preferred_job_types, preferred_categories,
        job_scope, remote_only, salary_min, salary_max, salary_currency,
        notify_email, notify_push,
        priorities, experience_levels, compensation_benefits, work_modes, company_stages,
        deal_breakers,
        relocate_open, visa_sponsorship_needed, timezone_overlap_required,
        match_weights, email_frequency, minimum_match_score,
        recruiter_messages, interview_reminders, weekly_profile_insights, salary_trend_alerts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       desired_titles            = VALUES(desired_titles),
       preferred_locations       = VALUES(preferred_locations),
       preferred_job_types       = VALUES(preferred_job_types),
       preferred_categories      = VALUES(preferred_categories),
       job_scope                 = VALUES(job_scope),
       remote_only               = VALUES(remote_only),
       salary_min                = VALUES(salary_min),
       salary_max                = VALUES(salary_max),
       salary_currency           = VALUES(salary_currency),
       notify_email              = VALUES(notify_email),
       notify_push               = VALUES(notify_push),
       priorities                = VALUES(priorities),
       experience_levels         = VALUES(experience_levels),
       compensation_benefits     = VALUES(compensation_benefits),
       work_modes                = VALUES(work_modes),
       company_stages            = VALUES(company_stages),
       deal_breakers             = VALUES(deal_breakers),
       relocate_open             = VALUES(relocate_open),
       visa_sponsorship_needed   = VALUES(visa_sponsorship_needed),
       timezone_overlap_required = VALUES(timezone_overlap_required),
       match_weights             = VALUES(match_weights),
       email_frequency           = VALUES(email_frequency),
       minimum_match_score       = VALUES(minimum_match_score),
       recruiter_messages        = VALUES(recruiter_messages),
       interview_reminders       = VALUES(interview_reminders),
       weekly_profile_insights   = VALUES(weekly_profile_insights),
       salary_trend_alerts       = VALUES(salary_trend_alerts)`,
    [
      user_id,
      data.desired_titles, data.preferred_locations, data.preferred_job_types, data.preferred_categories,
      data.job_scope, data.remote_only, data.salary_min, data.salary_max, data.salary_currency,
      data.notify_email, data.notify_push,
      data.priorities, data.experience_levels, data.compensation_benefits, data.work_modes, data.company_stages,
      data.deal_breakers,
      data.relocate_open, data.visa_sponsorship_needed, data.timezone_overlap_required,
      data.match_weights, data.email_frequency, data.minimum_match_score,
      data.recruiter_messages, data.interview_reminders, data.weekly_profile_insights, data.salary_trend_alerts,
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
 *   Section                Weight   When fully credited
 *   ---------------------  ------   -------------------------------------------
 *   profile_image           10%     candidate_profiles.profile_image set
 *   personal_information    20%     full_name + headline + phone + location
 *                                   + (open_to_remote/relocation_scope) set
 *   about                   10%     summary (>= 60 chars per validator)
 *   skills                  15%     >= 3 candidate_skills rows (linear up to 3)
 *   work_experience         20%     >= 1 candidate_experiences row
 *                                   (fallback: parsed-resume experience JSON)
 *   resume_upload           10%     a resumes row exists OR resume_url set
 *   job_preferences         10%     desired_role/work_preference/availability
 *                                   + expected_salary_min set (any 3 of 4)
 *   social_links             5%     linkedin_url OR portfolio_url OR github_url
 *
 *   ------------------------------------------------------------------
 *   Total                  100%
 *
 * Each section can be partially credited (e.g. personal_information:
 * 4 of 5 sub-fields populated = 16/20) so the bar moves smoothly as
 * the user fills the form rather than jumping in chunky increments.
 *
 * Stored in `candidate_profiles.profile_strength`. The per-section
 * breakdown is recomputed on demand by `/candidates/profile-completion`
 * and never persisted, so the UI's hints always reflect current data.
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
    `SELECT cp.headline, cp.summary, cp.current_title, cp.desired_role,
            cp.years_experience, cp.location, cp.country,
            cp.open_to_remote, cp.work_preference, cp.relocation_scope,
            cp.expected_salary_min, cp.availability,
            cp.resume_url, cp.linkedin_url, cp.portfolio_url, cp.github_url,
            cp.languages, cp.profile_image,
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
  // Prefer the normalised candidate_experiences table; fall back to
  // the legacy parsed-resume JSON so existing accounts keep their
  // work-experience credit until they migrate to the new editor.
  const expCount = Number(
    (await db.queryOne(
      `SELECT COUNT(*) AS n FROM candidate_experiences WHERE candidate_user_id = ?`,
      [user_id]
    ))?.n || 0
  );
  const parsedExp = expCount > 0 ? null : await db.queryOne(
    `SELECT experience FROM resume_parsed_data WHERE candidate_user_id = ? LIMIT 1`,
    [user_id]
  );

  // Relocation/work-mode signal: either column populated counts.
  const hasRelocationSignal = cp.relocation_scope != null
    || cp.work_preference != null
    || cp.open_to_remote != null;

  const sections = [
    {
      key: 'profile_image',
      label: 'Profile image',
      weight: 10,
      fill: cp.profile_image ? 1 : 0,
      hint: 'Upload your profile image to improve profile visibility.',
    },
    {
      key: 'personal_information',
      label: 'Personal information',
      weight: 20,
      // 5 sub-checks: name + headline + phone + location + work mode.
      fill: scoreFraction([
        !!cp.full_name,
        !!cp.headline,
        !!cp.phone,
        !!cp.location,
        hasRelocationSignal,
      ]),
      hint: 'Add your headline, phone, location and remote preference so we can match you to local roles.',
    },
    {
      key: 'about',
      label: 'About you',
      weight: 10,
      // Validator enforces summary >= 60 chars, so credit only when
      // it clears the same bar — half-credit at >= 30 chars to keep
      // the bar moving as the user types.
      fill: (() => {
        const len = String(cp.summary || '').trim().length;
        if (len >= 60) return 1;
        if (len >= 30) return 0.5;
        return 0;
      })(),
      hint: 'Write a short bio (at least 60 characters) describing what you build and what you are looking for.',
    },
    {
      key: 'skills',
      label: 'Skills & expertise',
      weight: 15,
      // 3 skills = fully credited; 1 skill = 1/3; saturates at 1.
      fill: Math.min(1, skillCount / 3),
      hint: 'Add at least 3 skills to get better job matches.',
    },
    {
      key: 'work_experience',
      label: 'Work experience',
      weight: 20,
      // 1 entry = 50% credit, 2+ = full credit. Fallback to parsed
      // resume only when the normalised table is empty.
      fill: (() => {
        if (expCount >= 2) return 1;
        if (expCount === 1) return 0.6;
        return parsedExperienceFilled(parsedExp?.experience) ? 0.5 : 0;
      })(),
      hint: 'Add your work history so recruiters can see your trajectory.',
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
      label: 'What you are looking for',
      weight: 10,
      // 4 sub-checks: desired role + availability + work preference +
      // salary expectation. Any 3 of 4 = full credit.
      fill: (() => {
        const checks = [
          !!cp.desired_role,
          !!cp.availability && cp.availability !== 'not_looking',
          !!cp.work_preference,
          cp.expected_salary_min != null,
        ];
        const hits = checks.filter(Boolean).length;
        return Math.min(1, hits / 3);
      })(),
      hint: 'Set the role you want, work preference, salary, and availability so we surface the right openings.',
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

/** Treat parsed-resume experience as "filled" only when it's a non-empty JSON array. */
function parsedExperienceFilled(raw) {
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
