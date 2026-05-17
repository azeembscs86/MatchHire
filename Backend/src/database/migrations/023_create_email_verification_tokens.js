'use strict';

/**
 * email_verification_tokens
 *
 * Single-use, hashed verification tokens for the email-verification
 * flow. Mirrors `password_reset_tokens` so the helper code can reuse
 * the same SHA-256 hashing utility. A row is created on
 * `/auth/register` and consumed by `/auth/verify-email/:token`. After
 * consumption the user's `email_verified_at` is set and `status` is
 * flipped from `pending` to `active`.
 */
module.exports = {
  name: '023_create_email_verification_tokens',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        sent_to VARCHAR(190) NULL,
        ip_address VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_evt_token_hash (token_hash),
        KEY idx_evt_user (user_id),
        KEY idx_evt_expires (expires_at),
        CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS email_verification_tokens;`); },
};
