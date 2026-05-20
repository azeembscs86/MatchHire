'use strict';

/**
 * Meta repository
 * ---------------
 * Reference-data access for `job_categories` and `skills`, plus read/write
 * helpers for the `admin_audit_logs` table (every admin mutation funnels
 * through `writeAuditLog`).
 */

const db = require('../config/database');

async function listCategories() {
  return db.query(
    `SELECT jc.id, jc.name, jc.slug, jc.icon,
            (SELECT COUNT(*) FROM jobs j WHERE j.category_id = jc.id AND j.status = 'open' AND j.deleted_at IS NULL) AS open_jobs
     FROM job_categories jc WHERE jc.is_active = 1 ORDER BY jc.name ASC`
  );
}

async function listSkills() {
  return db.query(
    `SELECT id, name, slug, category FROM skills WHERE is_active = 1 ORDER BY name ASC`
  );
}

/**
 * Fuzzy search the active skills catalogue.
 *
 *   - Empty query falls back to "first N alphabetical" so the picker
 *     shows useful defaults before the user types.
 *   - Otherwise prefix matches outrank substring matches so typing
 *     "rea" surfaces "React.js" before "Clinical Research".
 *
 * @param {string} q       — free-text user query
 * @param {number} limit   — bounded 1..100
 */
async function searchSkills(q, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const term = String(q || '').trim();
  if (!term) {
    return db.query(
      `SELECT id, name, slug, category
       FROM skills WHERE is_active = 1
       ORDER BY name ASC LIMIT ?`,
      [safeLimit]
    );
  }
  const prefix = `${term}%`;
  const middle = `%${term}%`;
  // ORDER BY a two-tier CASE so prefix hits sort first.
  // `match_rank` is used instead of `rank` — the latter is reserved
  // by MySQL 8 (window function).
  return db.query(
    `SELECT id, name, slug, category,
            CASE WHEN name LIKE ? THEN 0 ELSE 1 END AS match_rank
     FROM skills
     WHERE is_active = 1 AND name LIKE ?
     ORDER BY match_rank ASC, name ASC
     LIMIT ?`,
    [prefix, middle, safeLimit]
  );
}

/**
 * Return skills grouped by category. Used by the SkillsPicker's
 * "Browse by category" panel. The result is shaped as an array of
 * `{ category, skills: [...] }` so the frontend can render the
 * groups in iteration order without an extra Object.entries pass.
 */
async function listSkillsGroupedByCategory() {
  const rows = await db.query(
    `SELECT id, name, slug, category
     FROM skills WHERE is_active = 1
     ORDER BY category ASC, name ASC`
  );
  const buckets = new Map();
  for (const r of rows) {
    const cat = r.category || 'Other';
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push({ id: r.id, name: r.name, slug: r.slug });
  }
  return Array.from(buckets.entries()).map(([category, skills]) => ({
    category,
    count: skills.length,
    skills,
  }));
}

/** Return the unique category list with a per-category skill count. */
async function listSkillCategories() {
  return db.query(
    `SELECT COALESCE(category, 'Other') AS category, COUNT(*) AS count
     FROM skills WHERE is_active = 1
     GROUP BY category
     ORDER BY category ASC`
  );
}

/**
 * Case-insensitive lookup by skill name. Used by the "custom skill"
 * branch on POST /candidates/skills so a free-text entry like
 * "react.js" matches an existing "React.js" instead of creating a
 * dupe.
 */
async function findSkillByName(name) {
  if (!name) return null;
  return db.queryOne(
    `SELECT id, name, slug, category FROM skills
     WHERE LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1`,
    [String(name).trim()]
  );
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Insert (or, on a slug collision, return the existing row's id) a
 * user-submitted skill. The slug is the unique key — re-inserting
 * "React.js" twice yields the same row.
 *
 * `category` is optional; when missing we record 'User Submitted' so
 * an admin can re-categorise later.
 */
async function createOrFindSkill({ name, category = null }) {
  const cleanName = String(name).trim();
  if (!cleanName) throw new Error('skill name required');
  const slug = slugify(cleanName) || `custom-${Date.now()}`;
  await db.getPool().execute(
    `INSERT IGNORE INTO skills (name, slug, category, is_active)
     VALUES (?, ?, ?, 1)`,
    [cleanName, slug, category || 'User Submitted']
  );
  return db.queryOne(
    `SELECT id, name, slug, category FROM skills WHERE slug = ? LIMIT 1`,
    [slug]
  );
}

async function listAuditLogs({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.description, al.created_at,
            al.ip_address, u.full_name AS admin_name, u.email AS admin_email
     FROM admin_audit_logs al
     LEFT JOIN users u ON u.id = al.admin_user_id
     ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(`SELECT COUNT(*) AS total FROM admin_audit_logs`);
  return { rows, total: Number(countRow?.total || 0) };
}

async function writeAuditLog({ admin_user_id, action, entity_type, entity_id, description, meta = null, ip_address = null, user_agent = null }) {
  await db.getPool().execute(
    `INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, description, meta, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [admin_user_id || null, action, entity_type || null, entity_id || null, description || null, meta ? JSON.stringify(meta) : null, ip_address, user_agent]
  );
}

module.exports = {
  listCategories,
  listSkills,
  searchSkills,
  listSkillsGroupedByCategory,
  listSkillCategories,
  findSkillByName,
  createOrFindSkill,
  listAuditLogs,
  writeAuditLog,
};
