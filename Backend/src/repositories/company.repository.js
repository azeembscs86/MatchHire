'use strict';

/**
 * Company repository
 * ------------------
 * Data access for `companies`. Generates unique slugs at insert time
 * (`uniqueSlug`) and exposes both the public listing variants (only
 * `status='active'`, joined with open-job counts) and the admin variants
 * (includes pending verification rows).
 */

const db = require('../config/database');

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let i = 1;
  while (true) {
    const row = await db.queryOne('SELECT id FROM companies WHERE slug = ? LIMIT 1', [slug]);
    if (!row) return slug;
    i += 1;
    slug = `${slugify(base)}-${i}`;
    if (i > 100) return `${slugify(base)}-${Date.now()}`;
  }
}

async function create(data, conn = null) {
  const exec = conn ? conn.execute.bind(conn) : (sql, params) => db.getPool().execute(sql, params);
  const slug = await uniqueSlug(data.name);
  const [res] = await exec(
    `INSERT INTO companies (owner_user_id, name, slug, tagline, description, industry, size, website, logo_url, cover_url, location, country, founded_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.owner_user_id || null, data.name, slug, data.tagline || null, data.description || null,
      data.industry || null, data.size || null, data.website || null, data.logo_url || null,
      data.cover_url || null, data.location || null, data.country || null, data.founded_year || null,
    ]
  );
  return { id: res.insertId, slug };
}

async function findById(id) {
  return db.queryOne(
    `SELECT * FROM companies WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

async function findByOwner(user_id) {
  return db.queryOne(
    `SELECT c.* FROM companies c
     LEFT JOIN employer_profiles ep ON ep.company_id = c.id AND ep.user_id = ?
     WHERE (c.owner_user_id = ? OR ep.user_id = ?) AND c.deleted_at IS NULL
     ORDER BY c.id ASC LIMIT 1`,
    [user_id, user_id, user_id]
  );
}

async function updateById(id, fields) {
  const allowed = ['name','tagline','description','industry','size','website','logo_url','cover_url','location','country','founded_year','verification_status','is_featured','status'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); params.push(fields[k]); }
  }
  if (!sets.length) return false;
  params.push(id);
  const [res] = await db.getPool().execute(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, params);
  return res.affectedRows > 0;
}

async function listPublic({ keyword, industry, location, is_featured, page = 1, limit = 10 }) {
  const where = ["c.status = 'active'", 'c.deleted_at IS NULL'];
  const params = [];
  if (keyword) { where.push('(c.name LIKE ? OR c.tagline LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (industry) { where.push('c.industry LIKE ?'); params.push(`%${industry}%`); }
  if (location) { where.push('(c.location LIKE ? OR c.country LIKE ?)'); params.push(`%${location}%`, `%${location}%`); }
  if (is_featured === true) where.push('c.is_featured = 1');
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT c.id, c.name, c.slug, c.tagline, c.description, c.industry, c.size,
            c.website, c.logo_url, c.location, c.country, c.is_featured, c.verification_status,
            (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id
              AND j.status = 'open' AND j.deleted_at IS NULL AND j.admin_status = 'approved'
              AND (j.application_deadline IS NULL OR j.application_deadline > NOW())) AS open_jobs
     FROM companies c
     WHERE ${where.join(' AND ')}
     ORDER BY c.is_featured DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM companies c WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function publicDetail(id) {
  const row = await db.queryOne(
    `SELECT c.id, c.name, c.slug, c.tagline, c.description, c.industry, c.size,
            c.website, c.logo_url, c.cover_url, c.location, c.country, c.founded_year,
            c.is_featured, c.verification_status,
            (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id
              AND j.status = 'open' AND j.deleted_at IS NULL AND j.admin_status = 'approved'
              AND (j.application_deadline IS NULL OR j.application_deadline > NOW())) AS open_jobs
     FROM companies c
     WHERE c.id = ? AND c.status = 'active' AND c.deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return row;
}

async function listPending({ page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT id, name, slug, industry, location, country, owner_user_id, created_at, verification_status
     FROM companies WHERE verification_status = 'pending' AND deleted_at IS NULL
     ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM companies WHERE verification_status = 'pending' AND deleted_at IS NULL`
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function updateVerification(id, status) {
  await db.getPool().execute(
    `UPDATE companies SET verification_status = ? WHERE id = ?`,
    [status, id]
  );
}

async function totalCount() {
  const row = await db.queryOne(`SELECT COUNT(*) AS total FROM companies WHERE deleted_at IS NULL`);
  return Number(row?.total || 0);
}

module.exports = {
  create,
  findById,
  findByOwner,
  updateById,
  listPublic,
  publicDetail,
  listPending,
  updateVerification,
  totalCount,
};
