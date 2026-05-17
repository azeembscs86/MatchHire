'use strict';

/**
 * User repository
 * ---------------
 * MySQL-only data access for the `users` table (no business logic).
 *
 * Backing table: `users`
 *   - email is unique
 *   - password_hash is bcrypt
 *   - role is one of (candidate, employer, admin, super_admin)
 *   - status is one of (active, inactive, suspended, pending)
 *   - soft-deletion uses `deleted_at`
 */

const db = require('../config/database');

async function findByEmail(email) {
  return db.queryOne(
    `SELECT id, full_name, email, phone, password_hash, role, status, email_verified_at, avatar_url, created_at, last_login_at
     FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
    [email]
  );
}

async function findById(id) {
  return db.queryOne(
    `SELECT id, full_name, email, phone, role, status, email_verified_at, avatar_url, created_at, last_login_at
     FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
}

async function create({ full_name, email, phone = null, password_hash, role, avatar_url = null }, conn = null) {
  const exec = conn ? conn.execute.bind(conn) : (sql, params) => db.getPool().execute(sql, params);
  const [res] = await exec(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status, email_verified_at)
     VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
    [full_name, email, phone, password_hash, role]
  );
  return res.insertId;
}

async function updateById(id, fields) {
  const allowed = ['full_name', 'phone', 'avatar_url', 'status'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); params.push(fields[k]); }
  }
  if (!sets.length) return false;
  params.push(id);
  const [res] = await db.getPool().execute(
    `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return res.affectedRows > 0;
}

async function updatePassword(id, password_hash) {
  await db.getPool().execute('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
}

async function setStatus(id, status) {
  await db.getPool().execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
}

async function touchLogin(id) {
  await db.getPool().execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
}

async function emailExists(email) {
  const row = await db.queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return !!row;
}

async function listWithFilters({ keyword, role, status, page = 1, limit = 10 }) {
  const where = ['u.deleted_at IS NULL'];
  const params = [];
  if (keyword) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (status) { where.push('u.status = ?'); params.push(status); }
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.created_at, u.last_login_at
     FROM users u WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM users u WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows, total: Number(countRow?.total || 0) };
}

async function countByRole() {
  return db.query(`SELECT role, COUNT(*) AS count FROM users WHERE deleted_at IS NULL GROUP BY role`);
}

module.exports = {
  findByEmail,
  findById,
  create,
  updateById,
  updatePassword,
  setStatus,
  touchLogin,
  emailExists,
  listWithFilters,
  countByRole,
};
