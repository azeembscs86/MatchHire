'use strict';

module.exports = {
  name: '003_create_companies',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        owner_user_id BIGINT UNSIGNED NULL,
        name VARCHAR(190) NOT NULL,
        slug VARCHAR(200) NOT NULL,
        tagline VARCHAR(255) NULL,
        description TEXT NULL,
        industry VARCHAR(120) NULL,
        size VARCHAR(50) NULL,
        website VARCHAR(255) NULL,
        logo_url VARCHAR(500) NULL,
        cover_url VARCHAR(500) NULL,
        location VARCHAR(190) NULL,
        country VARCHAR(80) NULL,
        founded_year SMALLINT UNSIGNED NULL,
        verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
        is_featured TINYINT(1) NOT NULL DEFAULT 0,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_companies_slug (slug),
        KEY idx_companies_owner (owner_user_id),
        KEY idx_companies_status (status),
        KEY idx_companies_verification (verification_status),
        CONSTRAINT fk_companies_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS companies;`);
  },
};
