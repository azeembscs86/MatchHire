'use strict';

module.exports = {
  name: '016_create_password_reset_tokens',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_password_reset_token_hash (token_hash),
        KEY idx_password_reset_user (user_id),
        KEY idx_password_reset_expires (expires_at),
        CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS password_reset_tokens;`);
  },
};
