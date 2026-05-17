'use strict';

/**
 * Job repository
 * --------------
 * Data access for `jobs`. Provides:
 *
 *   - Public listing with composable filters (keyword, category, location,
 *     job_type, experience_level, salary range, remote, company, featured)
 *   - Admin listing (all statuses)
 *   - Company-scoped listing for employers
 *   - `recommendedForUser` - weighted match score against the candidate's
 *     preferences/profile/skills
 *
 * All filters are bound with `?` placeholders. The full-text index on
 * (title, description, skills_tags) is defined in the migration; the
 * current queries use LIKE for portability with strict mode and small
 * datasets.
 */

const db = require('../config/database');

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function jobsListSelect() {
  return `j.id, j.company_id, j.category_id, j.title, j.slug, j.description,
          j.job_type, j.experience_level, j.location, j.city, j.country, j.country_id, j.timezone, j.is_remote,
          j.work_mode, j.is_global_remote,
          j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
          j.skills_tags, j.application_deadline, j.vacancies, j.status,
          j.is_featured, j.views_count, j.applications_count, j.published_at, j.created_at,
          c.name AS company_name, c.slug AS company_slug, c.logo_url AS company_logo,
          c.industry AS company_industry, c.location AS company_location,
          cat.name AS category_name, cat.slug AS category_slug`;
}

async function create(data) {
  const slug = `${slugify(data.title)}-${Date.now()}`;
  const [res] = await db.getPool().execute(
    `INSERT INTO jobs
      (company_id, posted_by_user_id, category_id, title, slug, description, responsibilities, requirements, benefits,
       job_type, experience_level, location, country, is_remote, salary_min, salary_max, salary_currency, salary_period,
       skills_tags, application_deadline, vacancies, status, is_featured, admin_status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
    [
      data.company_id, data.posted_by_user_id || null, data.category_id || null,
      data.title, slug, data.description, data.responsibilities || null, data.requirements || null, data.benefits || null,
      data.job_type, data.experience_level, data.location || null, data.country || null, data.is_remote ? 1 : 0,
      data.salary_min ?? null, data.salary_max ?? null, data.salary_currency || 'USD', data.salary_period || 'year',
      (data.skills_tags || []).join(','), data.application_deadline || null, data.vacancies || 1,
      data.status || 'open', data.is_featured ? 1 : 0,
      data.status === 'draft' ? null : new Date(),
    ]
  );
  return { id: res.insertId, slug };
}

async function findById(id) {
  return db.queryOne(
    `SELECT ${jobsListSelect()}, j.responsibilities, j.requirements, j.benefits
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE j.id = ? AND j.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

async function ownsJob(jobId, userId) {
  const row = await db.queryOne(
    `SELECT j.id FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN employer_profiles ep ON ep.company_id = c.id AND ep.user_id = ?
     WHERE j.id = ? AND (c.owner_user_id = ? OR ep.user_id = ?) AND j.deleted_at IS NULL LIMIT 1`,
    [userId, jobId, userId, userId]
  );
  return !!row;
}

async function update(id, fields) {
  const allowed = ['title','description','responsibilities','requirements','benefits','category_id','job_type','experience_level',
    'location','country','is_remote','salary_min','salary_max','salary_currency','salary_period','skills_tags',
    'application_deadline','vacancies','status','is_featured','admin_status','closed_at','published_at'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (k in fields) {
      let v = fields[k];
      if (k === 'is_remote' || k === 'is_featured') v = v ? 1 : 0;
      if (k === 'skills_tags' && Array.isArray(v)) v = v.join(',');
      sets.push(`${k} = ?`); params.push(v);
    }
  }
  if (!sets.length) return false;
  params.push(id);
  const [res] = await db.getPool().execute(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, params);
  return res.affectedRows > 0;
}

async function softDelete(id) {
  await db.getPool().execute(`UPDATE jobs SET deleted_at = NOW(), status = 'archived' WHERE id = ?`, [id]);
}

async function closeJob(id) {
  await db.getPool().execute(`UPDATE jobs SET status = 'closed', closed_at = NOW() WHERE id = ?`, [id]);
}

async function incrementViews(id) {
  await db.getPool().execute(`UPDATE jobs SET views_count = views_count + 1 WHERE id = ?`, [id]);
}

async function listPublic(filters) {
  const {
    keyword, category, location, job_type, experience_level, salary_min, salary_max,
    remote, company_id, is_featured, page = 1, limit = 10, sort = 'latest',
  } = filters;

  const where = ["j.status = 'open'", "j.admin_status = 'approved'", "j.deleted_at IS NULL", "c.status = 'active'"];
  const params = [];

  if (keyword) {
    where.push('(j.title LIKE ? OR j.description LIKE ? OR j.skills_tags LIKE ? OR c.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) {
    if (Number.isInteger(Number(category))) { where.push('j.category_id = ?'); params.push(Number(category)); }
    else { where.push('cat.slug = ?'); params.push(String(category).toLowerCase()); }
  }
  if (location) { where.push('(j.location LIKE ? OR j.country LIKE ?)'); params.push(`%${location}%`, `%${location}%`); }
  if (job_type) { where.push('j.job_type = ?'); params.push(job_type); }
  if (experience_level) { where.push('j.experience_level = ?'); params.push(experience_level); }
  if (salary_min != null) { where.push('(j.salary_max IS NULL OR j.salary_max >= ?)'); params.push(salary_min); }
  if (salary_max != null) { where.push('(j.salary_min IS NULL OR j.salary_min <= ?)'); params.push(salary_max); }
  if (remote === true) where.push('j.is_remote = 1');
  if (remote === false) where.push('j.is_remote = 0');
  if (company_id) { where.push('j.company_id = ?'); params.push(company_id); }
  if (is_featured === true) where.push('j.is_featured = 1');

  let orderBy = 'j.is_featured DESC, j.published_at DESC, j.id DESC';
  if (sort === 'salary_high') orderBy = 'j.salary_max DESC, j.salary_min DESC';
  if (sort === 'salary_low') orderBy = 'j.salary_min ASC';
  if (sort === 'featured') orderBy = 'j.is_featured DESC, j.published_at DESC';

  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT ${jobsListSelect()}
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function listByCompany(company_id, { page = 1, limit = 10, status }) {
  const where = ['j.company_id = ?', 'j.deleted_at IS NULL'];
  const params = [company_id];
  if (status) { where.push('j.status = ?'); params.push(status); }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT ${jobsListSelect()}
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM jobs j WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function listAdmin({ keyword, status, page = 1, limit = 10 }) {
  const where = ['j.deleted_at IS NULL'];
  const params = [];
  if (keyword) { where.push('(j.title LIKE ? OR c.name LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { where.push('j.status = ?'); params.push(status); }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT ${jobsListSelect()}
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM jobs j INNER JOIN companies c ON c.id = j.company_id WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function recommendedForUser(user_id, limit = 10) {
  const pref = await db.queryOne(`SELECT * FROM preferences WHERE user_id = ? LIMIT 1`, [user_id]);
  const profile = await db.queryOne(`SELECT location, country, open_to_remote FROM candidate_profiles WHERE user_id = ? LIMIT 1`, [user_id]);
  const skills = await db.query(
    `SELECT s.name FROM candidate_skills cs INNER JOIN skills s ON s.id = cs.skill_id WHERE cs.candidate_user_id = ?`,
    [user_id]
  );

  const params = [];
  const where = ["j.status = 'open'", "j.admin_status = 'approved'", "j.deleted_at IS NULL"];
  let scoreParts = ['0'];

  const titles = pref?.desired_titles?.split(',').filter(Boolean) || [];
  for (const t of titles) {
    scoreParts.push(`(CASE WHEN j.title LIKE ? THEN 3 ELSE 0 END)`);
    params.push(`%${t.trim()}%`);
  }
  for (const sk of skills.slice(0, 8)) {
    scoreParts.push(`(CASE WHEN j.skills_tags LIKE ? THEN 2 ELSE 0 END)`);
    params.push(`%${sk.name}%`);
  }
  const locations = pref?.preferred_locations?.split(',').filter(Boolean) || [];
  for (const loc of locations) {
    scoreParts.push(`(CASE WHEN j.location LIKE ? THEN 2 ELSE 0 END)`);
    params.push(`%${loc.trim()}%`);
  }
  if (profile?.open_to_remote) scoreParts.push(`(CASE WHEN j.is_remote = 1 THEN 1 ELSE 0 END)`);
  if (profile?.location) {
    scoreParts.push(`(CASE WHEN j.location LIKE ? THEN 1 ELSE 0 END)`);
    params.push(`%${profile.location}%`);
  }

  const rows = await db.query(
    `SELECT ${jobsListSelect()},
            (${scoreParts.join(' + ')}) AS match_score
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY match_score DESC, j.published_at DESC
     LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows;
}

async function totalCount() {
  const row = await db.queryOne(`SELECT COUNT(*) AS total FROM jobs WHERE deleted_at IS NULL`);
  return Number(row?.total || 0);
}

/**
 * Location-priority listing.
 *
 *   city == filter.city           -> priority 0 (top)
 *   country == filter.country     -> priority 1
 *   is_global_remote || remote    -> priority 2
 *   everything else               -> priority 3
 *
 * Plus the usual keyword/role/skills filters. Used by GET
 * /public/jobs/location-based.
 */
async function listLocationBased({
  country, city, role, skills, experience_level,
  job_scope = 'hybrid', limit = 20, page = 1,
}) {
  const where = ["j.status = 'open'", "j.admin_status = 'approved'", "j.deleted_at IS NULL", "c.status = 'active'"];
  const params = [];
  if (role) { where.push('j.title LIKE ?'); params.push(`%${role}%`); }
  if (experience_level) { where.push('j.experience_level = ?'); params.push(experience_level); }

  const skillsList = Array.isArray(skills)
    ? skills
    : (typeof skills === 'string' ? skills.split(',').map((s) => s.trim()).filter(Boolean) : []);
  if (skillsList.length > 0) {
    where.push(`(${skillsList.map(() => 'j.skills_tags LIKE ?').join(' OR ')})`);
    skillsList.forEach((s) => params.push(`%${s}%`));
  }

  // Scope filter (local/country/global_remote/hybrid).
  if (job_scope === 'local' && city) {
    where.push('j.city = ?'); params.push(city);
  } else if (job_scope === 'country' && country) {
    where.push('j.country = ?'); params.push(country);
  } else if (job_scope === 'global_remote') {
    where.push('(j.is_global_remote = 1 OR (j.work_mode = "remote" AND j.country IS NULL))');
  }

  // priority CASE for sorting
  const priorityParams = [];
  let priority = '999';
  if (city || country) {
    priority = `CASE
      WHEN j.city = ? THEN 0
      WHEN j.country = ? THEN 1
      WHEN j.is_global_remote = 1 OR j.work_mode = 'remote' THEN 2
      ELSE 3 END`;
    priorityParams.push(city || '__none__', country || '__none__');
  }

  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT ${jobsListSelect()}, ${priority} AS priority
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${priority === '999' ? '' : 'priority ASC, '} j.is_featured DESC, j.published_at DESC
     LIMIT ? OFFSET ?`,
    [...priorityParams, ...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

/**
 * Load a "match candidate context": the row used by the match service.
 * Composes user + candidate_profile + skills + preferences in one go.
 */
async function loadCandidateContext(user_id) {
  const profile = await db.queryOne(
    `SELECT u.id, u.full_name, u.email,
            cp.headline, cp.summary, cp.current_title, cp.years_experience,
            cp.location, cp.city, cp.country, cp.timezone, cp.open_to_remote,
            cp.expected_salary_min, cp.expected_salary_max, cp.salary_currency
     FROM users u
     LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [user_id]
  );
  if (!profile) return null;
  const skills = await db.query(
    `SELECT s.name FROM candidate_skills cs INNER JOIN skills s ON s.id = cs.skill_id WHERE cs.candidate_user_id = ?`,
    [user_id]
  );
  const prefs = await db.queryOne(
    `SELECT desired_titles, preferred_locations, preferred_job_types, preferred_categories,
            job_scope, remote_only
     FROM preferences WHERE user_id = ? LIMIT 1`,
    [user_id]
  );
  return {
    ...profile,
    skills,
    preferred_categories: prefs?.preferred_categories || '',
    desired_titles: prefs?.desired_titles || '',
    preferred_locations: prefs?.preferred_locations || '',
    preferred_job_types: prefs?.preferred_job_types || '',
    job_scope: prefs?.job_scope || 'hybrid',
    open_to_remote: profile.open_to_remote ?? (prefs?.remote_only ? 1 : 1),
  };
}

async function findByIdRaw(id) {
  return db.queryOne(
    `SELECT ${jobsListSelect()}
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE j.id = ? AND j.deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

module.exports = {
  create,
  findById,
  findByIdRaw,
  ownsJob,
  update,
  softDelete,
  closeJob,
  incrementViews,
  listPublic,
  listByCompany,
  listAdmin,
  recommendedForUser,
  listLocationBased,
  loadCandidateContext,
  totalCount,
};
