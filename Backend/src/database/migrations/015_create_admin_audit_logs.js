'use strict';

module.exports = {
  name: '015_create_admin_audit_logs',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        admin_user_id BIGINT UNSIGNED NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(80) NULL,
        entity_id BIGINT UNSIGNED NULL,
        description VARCHAR(500) NULL,
        meta JSON NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_audit_admin (admin_user_id),
        KEY idx_audit_entity (entity_type, entity_id),
        KEY idx_audit_created (created_at),
        CONSTRAINT fk_audit_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS admin_audit_logs;`);
  },
};
