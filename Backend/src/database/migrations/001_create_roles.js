'use strict';

module.exports = {
  name: '001_create_roles',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL,
        description VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_roles_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS roles;`);
  },
};
