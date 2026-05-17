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
  listAuditLogs,
  writeAuditLog,
};
