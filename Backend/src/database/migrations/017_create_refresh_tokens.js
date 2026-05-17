'use strict';

module.exports = {
  name: '017_create_refresh_tokens',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        replaced_by_id BIGINT UNSIGNED NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_refresh_token_hash (token_hash),
        KEY idx_refresh_user (user_id),
        KEY idx_refresh_expires (expires_at),
        CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS refresh_tokens;`);
  },
};
