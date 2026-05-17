'use strict';

module.exports = {
  name: '002_create_users',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(190) NOT NULL,
        phone VARCHAR(30) NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('candidate','employer','admin','super_admin') NOT NULL DEFAULT 'candidate',
        status ENUM('active','inactive','suspended','pending') NOT NULL DEFAULT 'active',
        email_verified_at DATETIME NULL,
        last_login_at DATETIME NULL,
        avatar_url VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        KEY idx_users_role (role),
        KEY idx_users_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS users;`);
  },
};
