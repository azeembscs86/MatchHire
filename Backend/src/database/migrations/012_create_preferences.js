'use strict';

module.exports = {
  name: '012_create_preferences',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS preferences (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        desired_titles VARCHAR(500) NULL,
        preferred_locations VARCHAR(500) NULL,
        preferred_job_types VARCHAR(200) NULL,
        preferred_categories VARCHAR(500) NULL,
        remote_only TINYINT(1) NOT NULL DEFAULT 0,
        salary_min DECIMAL(12,2) NULL,
        salary_max DECIMAL(12,2) NULL,
        salary_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        notify_email TINYINT(1) NOT NULL DEFAULT 1,
        notify_push TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_preferences_user (user_id),
        CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS preferences;`);
  },
};
