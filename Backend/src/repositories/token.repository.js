'use strict';

/**
 * Token repository
 * ----------------
 * Owns rows in `refresh_tokens` and `password_reset_tokens`.
 *
 * Stored values are SHA-256 hashes - the plaintext token is only ever
 * returned to the user once. Both tables index `token_hash` for O(1) lookup
 * and `expires_at` for periodic cleanup.
 */

const db = require('../config/database');

async function saveRefreshToken({ user_id, token_hash, expires_at, ip_address = null, user_agent = null }) {
  const [res] = await db.getPool().execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, token_hash, expires_at, ip_address, user_agent]
  );
  return res.insertId;
}

async function findRefreshTokenByHash(token_hash) {
  return db.queryOne(
    `SELECT id, user_id, token_hash, expires_at, revoked_at FROM refresh_tokens
     WHERE token_hash = ? LIMIT 1`,
    [token_hash]
  );
}

async function revokeRefreshToken(id, replaced_by_id = null) {
  await db.getPool().execute(
    `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_id = ? WHERE id = ? AND revoked_at IS NULL`,
    [replaced_by_id, id]
  );
}

async function revokeAllForUser(user_id) {
  await db.getPool().execute(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`,
    [user_id]
  );
}

async function savePasswordResetToken({ user_id, token_hash, expires_at }) {
  const [res] = await db.getPool().execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [user_id, token_hash, expires_at]
  );
  return res.insertId;
}

async function findPasswordResetByHash(token_hash) {
  return db.queryOne(
    `SELECT id, user_id, token_hash, expires_at, used_at FROM password_reset_tokens
     WHERE token_hash = ? LIMIT 1`,
    [token_hash]
  );
}

async function consumePasswordReset(id) {
  await db.getPool().execute(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL`,
    [id]
  );
}

module.exports = {
  saveRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllForUser,
  savePasswordResetToken,
  findPasswordResetByHash,
  consumePasswordReset,
};
