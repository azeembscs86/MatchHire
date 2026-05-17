'use strict';

module.exports = {
  name: '009_create_employer_profiles',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS employer_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        company_id BIGINT UNSIGNED NULL,
        designation VARCHAR(120) NULL,
        department VARCHAR(120) NULL,
        phone VARCHAR(30) NULL,
        is_primary_contact TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_employer_profiles_user (user_id),
        KEY idx_employer_profiles_company (company_id),
        CONSTRAINT fk_employer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_employer_profiles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS employer_profiles;`);
  },
};
