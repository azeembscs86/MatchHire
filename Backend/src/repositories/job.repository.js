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

/**
 * Reusable predicate for "a job a candidate can still see and act on".
 *
 *   - status='open'         posting is live (not draft / closed / archived)
 *   - admin_status='approved'    moderation cleared
 *   - deleted_at IS NULL    not soft-deleted
 *   - company c.status='active'  the employer is still active
 *   - application_deadline IS NULL OR > NOW()  not past its deadline
 *
 * Every public / candidate-facing listing query (`listPublic`,
 * `recommendedForUser`, `listLocationBased`, `findSimilar`, and the
 * favorites + saved-jobs join queries) composes this fragment instead
 * of hand-rolling its own copy. The admin and employer-management
 * paths intentionally do NOT use this — they need to see expired
 * postings to manage them.
 *
 * Returns an array of WHERE-clause strings that callers join with ' AND '.
 */
/**
 * SQL fragment that excludes jobs the candidate has an ACTIVE
 * application for — but leaves withdrawn / rejected applications
 * eligible so the job re-appears in candidate-facing listings.
 *
 * Active = anything that isn't `withdrawn` or `rejected`. Once an
 * application is in `applied / reviewing / shortlisted / interview /
 * offered / hired / accepted`, we don't want the job to reappear on
 * Home, Jobs, Search, Recommended, Similar, Matching, or the
 * dashboard rail. After a candidate withdraws (status='withdrawn')
 * or the employer rejects them (status='rejected'), the job becomes
 * visible again so the candidate can reapply if they wish.
 *
 * Caller binds a single `?` (the candidate's user id).
 */
function notHasActiveApplicationFragment() {
  return `NOT EXISTS (
    SELECT 1 FROM applications a
     WHERE a.job_id = j.id
       AND a.candidate_user_id = ?
       AND a.status NOT IN ('withdrawn', 'rejected')
  )`;
}

function activeJobWhere() {
  return [
    "j.status = 'open'",
    "j.admin_status = 'approved'",
    "j.deleted_at IS NULL",
    "c.status = 'active'",
    "(j.application_deadline IS NULL OR j.application_deadline > NOW())",
  ];
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
  // Normalise the work-mode triple so the row always lands with a
  // valid, non-null value. Order of precedence:
  //   1. explicit `work_mode` from the payload (if it's a valid enum)
  //   2. legacy `is_remote=true`  → 'remote'
  //   3. default                    → 'onsite'
  //
  // The DB column also defaults to 'onsite', but we set it here too
  // so the SAME default is visible in the returned row without a
  // re-select.
  const wm = ['onsite', 'hybrid', 'remote'].includes(String(data.work_mode))
    ? String(data.work_mode)
    : (data.is_remote ? 'remote' : 'onsite');
  // Keep `is_remote` in sync with `work_mode` so filters that still
  // read the boolean (older code paths, recommended-for-user
  // scoring) stay consistent.
  const isRemoteFlag = wm === 'remote' ? 1 : 0;

  const [res] = await db.getPool().execute(
    `INSERT INTO jobs
      (company_id, posted_by_user_id, category_id, title, slug, description, responsibilities, requirements, benefits,
       job_type, experience_level, location, country, is_remote, work_mode, is_global_remote,
       salary_min, salary_max, salary_currency, salary_period,
       skills_tags, application_deadline, vacancies, status, is_featured, admin_status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
    [
      data.company_id, data.posted_by_user_id || null, data.category_id || null,
      data.title, slug, data.description, data.responsibilities || null, data.requirements || null, data.benefits || null,
      data.job_type, data.experience_level, data.location || null, data.country || null,
      isRemoteFlag, wm, data.is_global_remote ? 1 : 0,
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

/**
 * Similar / recommended jobs for the Job Detail page's "Recommended
 * Jobs for You" rail. Scored against the anchor job (same category +
 * skill overlap + experience-level match) and optionally re-ranked
 * with a candidate context (their skills add to the score; their
 * applied jobs are excluded).
 *
 * Always excludes:
 *   - the anchor job itself
 *   - expired jobs (application_deadline in the past)
 *   - closed / archived / unapproved postings
 *   - when `candidate_user_id` is supplied: jobs the candidate has
 *     already applied to
 *
 * Returns rows in the same shape as `listPublic()` so the SPA can
 * pipe them through the existing `toJobCardShape` adapter.
 */
async function findSimilar(anchorJobId, { candidate_user_id, limit = 6 } = {}) {
  // Pull the anchor's category + skill tags + experience level so we
  // can build a score expression based on overlap.
  const anchor = await db.queryOne(
    `SELECT id, category_id, skills_tags, experience_level FROM jobs WHERE id = ? LIMIT 1`,
    [anchorJobId]
  );
  if (!anchor) return [];

  const skillList = String(anchor.skills_tags || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .slice(0, 10);

  // Score expression — params bound in the SELECT clause must come
  // before WHERE params in the final params array (see §36 docs note
  // on placeholder ordering for the recommended query).
  const scoreParts = ['0'];
  const scoreParams = [];

  if (anchor.category_id) {
    scoreParts.push(`(CASE WHEN j.category_id = ? THEN 6 ELSE 0 END)`);
    scoreParams.push(anchor.category_id);
  }
  if (anchor.experience_level) {
    scoreParts.push(`(CASE WHEN j.experience_level = ? THEN 3 ELSE 0 END)`);
    scoreParams.push(anchor.experience_level);
  }
  for (const sk of skillList) {
    scoreParts.push(`(CASE WHEN j.skills_tags LIKE ? THEN 2 ELSE 0 END)`);
    scoreParams.push(`%${sk}%`);
  }

  // If we have a candidate context, also boost rows that match their
  // own skill set so the rail feels personalised, not just "more from
  // this category".
  if (candidate_user_id) {
    const candSkills = await db.query(
      `SELECT s.name FROM candidate_skills cs INNER JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_user_id = ? LIMIT 10`,
      [candidate_user_id]
    );
    for (const s of candSkills) {
      scoreParts.push(`(CASE WHEN j.skills_tags LIKE ? THEN 1 ELSE 0 END)`);
      scoreParams.push(`%${s.name}%`);
    }
  }

  // WHERE clause — `activeJobWhere()` covers status / moderation /
  // soft-delete / company-active / expiry. We only have to add the
  // "don't return the anchor row itself" constraint here.
  const where = [...activeJobWhere(), "j.id <> ?"];
  const whereParams = [anchorJobId];

  if (candidate_user_id) {
    where.push(notHasActiveApplicationFragment());
    whereParams.push(Number(candidate_user_id));
  }

  const params = [...scoreParams, ...whereParams, Number(limit)];

  const rows = await db.query(
    `SELECT ${jobsListSelect()},
            (${scoreParts.join(' + ')}) AS match_score
     FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     LEFT JOIN job_categories cat ON cat.id = j.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY match_score DESC, j.is_featured DESC, j.published_at DESC, j.id DESC
     LIMIT ?`,
    params
  );
  return rows;
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
    'location','country','is_remote','work_mode','is_global_remote',
    'salary_min','salary_max','salary_currency','salary_period','skills_tags',
    'application_deadline','vacancies','status','is_featured','admin_status','closed_at','published_at'];
  // Normalise `work_mode` so it's always a valid enum value when
  // provided. Updating `work_mode` also synchronises `is_remote` to
  // keep the legacy boolean in agreement with the 3-state column.
  const patch = { ...fields };
  if ('work_mode' in patch) {
    patch.work_mode = ['onsite', 'hybrid', 'remote'].includes(String(patch.work_mode))
      ? String(patch.work_mode)
      : 'onsite';
    patch.is_remote = patch.work_mode === 'remote';
  }

  const sets = []; const params = [];
  for (const k of allowed) {
    if (k in patch) {
      let v = patch[k];
      if (k === 'is_remote' || k === 'is_featured' || k === 'is_global_remote') v = v ? 1 : 0;
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

/**
 * Parse a "true-ish" boolean from the query string. Express query
 * params arrive as strings (`'true'` / `'false'` / `'1'` / `'0'`) so a
 * naive `=== true` comparison silently no-ops. Returns `null` when the
 * caller didn't ask for the filter at all so the WHERE-clause builder
 * can distinguish "no filter" from "filter=false".
 */
function parseBoolish(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
}

/**
 * Skills filter — match jobs whose `skills_tags` column contains ANY
 * of the supplied skill tokens (OR), case-insensitively. Accepts:
 *   - "react,node.js, mysql"   (CSV, frontend default)
 *   - ["react", "node.js"]     (array)
 *   - "react"                  (single string)
 * Returns `{ clause, params }`, or `null` when there are no tokens.
 */
function buildSkillsFilter(skills) {
  const list = Array.isArray(skills)
    ? skills
    : (typeof skills === 'string'
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : []);
  if (!list.length) return null;
  // Cap at 10 to keep the OR list bounded — most candidates filter on
  // ≤4 skills in practice.
  const tokens = list.slice(0, 10);
  return {
    clause: `(${tokens.map(() => 'LOWER(j.skills_tags) LIKE ?').join(' OR ')})`,
    params: tokens.map((s) => `%${String(s).toLowerCase()}%`),
  };
}

async function listPublic(filters) {
  const {
    keyword, category, location, job_type, experience_level, salary_min, salary_max,
    remote, work_mode, skills, posted_within_days,
    // `company` is a free-text company-name filter (the new Jobs page
    // search bar binds it to its dedicated "Company" field). `company_id`
    // is the exact-id filter used internally — both can coexist.
    company, company_id, is_featured, page = 1, limit = 10, sort = 'latest',
    // When a candidate is signed in, the route layer threads their user id
    // here so we can hide jobs they've already applied to. Guests pass
    // `undefined` and see the unfiltered list.
    exclude_applied_for_user_id,
  } = filters;

  const where = [...activeJobWhere()];
  const params = [];

  if (exclude_applied_for_user_id) {
    where.push(notHasActiveApplicationFragment());
    params.push(Number(exclude_applied_for_user_id));
  }

  if (keyword) {
    where.push('(LOWER(j.title) LIKE ? OR LOWER(j.description) LIKE ? OR LOWER(j.skills_tags) LIKE ? OR LOWER(c.name) LIKE ?)');
    const k = `%${String(keyword).toLowerCase()}%`;
    params.push(k, k, k, k);
  }
  if (category) {
    if (Number.isInteger(Number(category))) { where.push('j.category_id = ?'); params.push(Number(category)); }
    else { where.push('cat.slug = ?'); params.push(String(category).toLowerCase()); }
  }
  if (location) {
    where.push('(LOWER(j.location) LIKE ? OR LOWER(j.country) LIKE ? OR LOWER(j.city) LIKE ?)');
    const l = `%${String(location).toLowerCase()}%`;
    params.push(l, l, l);
  }
  if (company) {
    // Dedicated company-name filter for the Jobs search bar. The existing
    // `keyword` filter also matches company name (broad OR), so callers
    // can use either; this gives the new search bar a precise field.
    where.push('LOWER(c.name) LIKE ?');
    params.push(`%${String(company).toLowerCase()}%`);
  }
  const skillsFilter = buildSkillsFilter(skills);
  if (skillsFilter) {
    where.push(skillsFilter.clause);
    params.push(...skillsFilter.params);
  }
  if (job_type) { where.push('j.job_type = ?'); params.push(job_type); }
  if (experience_level) { where.push('j.experience_level = ?'); params.push(experience_level); }
  if (salary_min != null && salary_min !== '') {
    where.push('(j.salary_max IS NULL OR j.salary_max >= ?)');
    params.push(Number(salary_min));
  }
  if (salary_max != null && salary_max !== '') {
    where.push('(j.salary_min IS NULL OR j.salary_min <= ?)');
    params.push(Number(salary_max));
  }
  // `work_mode` is the preferred 3-state filter (onsite/hybrid/remote).
  // We keep `remote` (boolean) as a back-compat alias so older clients
  // and the location-based query still work; new UIs should send
  // `work_mode`. Both are normalised here.
  if (work_mode && ['onsite', 'hybrid', 'remote'].includes(String(work_mode))) {
    where.push('j.work_mode = ?');
    params.push(String(work_mode));
  } else {
    const remoteBool = parseBoolish(remote);
    if (remoteBool === true) where.push('j.is_remote = 1');
    if (remoteBool === false) where.push('j.is_remote = 0');
  }
  // Posted-within filter — `posted_within_days` is the canonical name;
  // we honour `posted_within` as a back-compat alias. NULL/0/"" means
  // "any time".
  const postedDays = Number(posted_within_days ?? filters.posted_within);
  if (Number.isFinite(postedDays) && postedDays > 0) {
    where.push('j.published_at >= (NOW() - INTERVAL ? DAY)');
    params.push(postedDays);
  }
  if (company_id) { where.push('j.company_id = ?'); params.push(company_id); }
  if (parseBoolish(is_featured) === true) where.push('j.is_featured = 1');

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

async function listByCompany(company_id, { page = 1, limit = 10, status, exclude_expired = false } = {}) {
  const where = ['j.company_id = ?', 'j.deleted_at IS NULL'];
  const params = [company_id];
  if (status) { where.push('j.status = ?'); params.push(status); }
  // Public-facing callers (company detail page) pass `exclude_expired:
  // true` so candidates never see a closed-deadline role on a company
  // profile. Employer-management callers leave it false so the
  // dashboard still surfaces expired postings for editing.
  if (exclude_expired) {
    where.push('c.status = \'active\'');
    where.push('(j.application_deadline IS NULL OR j.application_deadline > NOW())');
    where.push("j.status = 'open'");
    where.push("j.admin_status = 'approved'");
  }
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
  // Count needs the companies join too so `c.status` resolves when
  // `exclude_expired` is true. Cheap because the company FK is a
  // primary key lookup.
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM jobs j
     INNER JOIN companies c ON c.id = j.company_id
     WHERE ${where.join(' AND ')}`,
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

  // Personalised recommendations always exclude jobs the candidate has
  // already applied to — there's no value in suggesting a role they're
  // already in the pipeline for.
  //
  // IMPORTANT: this query mixes `?` placeholders in BOTH the SELECT
  // (score CASE..LIKE) and the WHERE (NOT EXISTS) clauses. MySQL2 binds
  // positional params in SQL appearance order, so we must collect score
  // params first and the WHERE param last — otherwise the user_id we
  // want to feed NOT EXISTS lands in a SELECT LIKE and the filter
  // silently no-ops.
  const scoreParams = [];
  // Active-jobs predicate + exclude already-applied roles. The
  // recommendations endpoint is candidate-facing so expired postings
  // must never surface here.
  const where = [
    ...activeJobWhere(),
    notHasActiveApplicationFragment(),
  ];
  let scoreParts = ['0'];

  const titles = pref?.desired_titles?.split(',').filter(Boolean) || [];
  for (const t of titles) {
    scoreParts.push(`(CASE WHEN j.title LIKE ? THEN 3 ELSE 0 END)`);
    scoreParams.push(`%${t.trim()}%`);
  }
  for (const sk of skills.slice(0, 8)) {
    scoreParts.push(`(CASE WHEN j.skills_tags LIKE ? THEN 2 ELSE 0 END)`);
    scoreParams.push(`%${sk.name}%`);
  }
  const locations = pref?.preferred_locations?.split(',').filter(Boolean) || [];
  for (const loc of locations) {
    scoreParts.push(`(CASE WHEN j.location LIKE ? THEN 2 ELSE 0 END)`);
    scoreParams.push(`%${loc.trim()}%`);
  }
  if (profile?.open_to_remote) scoreParts.push(`(CASE WHEN j.is_remote = 1 THEN 1 ELSE 0 END)`);
  if (profile?.location) {
    scoreParts.push(`(CASE WHEN j.location LIKE ? THEN 1 ELSE 0 END)`);
    scoreParams.push(`%${profile.location}%`);
  }
  // Final params order = SELECT placeholders first (scoreParams),
  // then WHERE placeholders (NOT EXISTS user_id), then LIMIT.
  const params = [...scoreParams, Number(user_id)];

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
  // Same convention as listPublic — when a candidate id is supplied,
  // hide jobs they've already applied to.
  exclude_applied_for_user_id,
  // Candidate-feed filters mirrored from listPublic so the Jobs page
  // sidebar drives the same shape of query regardless of whether the
  // viewer is a guest (listPublic) or signed in (listLocationBased +
  // ranking).
  job_type, work_mode, remote, salary_min, salary_max, posted_within_days,
}) {
  const where = [...activeJobWhere()];
  const params = [];
  if (exclude_applied_for_user_id) {
    where.push(notHasActiveApplicationFragment());
    params.push(Number(exclude_applied_for_user_id));
  }
  if (role) { where.push('LOWER(j.title) LIKE ?'); params.push(`%${String(role).toLowerCase()}%`); }
  if (experience_level) { where.push('j.experience_level = ?'); params.push(experience_level); }
  if (job_type) { where.push('j.job_type = ?'); params.push(job_type); }
  if (salary_min != null && salary_min !== '') {
    where.push('(j.salary_max IS NULL OR j.salary_max >= ?)');
    params.push(Number(salary_min));
  }
  if (salary_max != null && salary_max !== '') {
    where.push('(j.salary_min IS NULL OR j.salary_min <= ?)');
    params.push(Number(salary_max));
  }
  if (work_mode && ['onsite', 'hybrid', 'remote'].includes(String(work_mode))) {
    where.push('j.work_mode = ?');
    params.push(String(work_mode));
  } else {
    const remoteBool = parseBoolish(remote);
    if (remoteBool === true) where.push('j.is_remote = 1');
    if (remoteBool === false) where.push('j.is_remote = 0');
  }
  const postedDays = Number(posted_within_days);
  if (Number.isFinite(postedDays) && postedDays > 0) {
    where.push('j.published_at >= (NOW() - INTERVAL ? DAY)');
    params.push(postedDays);
  }

  const skillsFilter = buildSkillsFilter(skills);
  if (skillsFilter) {
    where.push(skillsFilter.clause);
    params.push(...skillsFilter.params);
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
  findSimilar,
  loadCandidateContext,
  totalCount,
  activeJobWhere,
};
