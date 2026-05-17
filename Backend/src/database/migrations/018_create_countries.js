'use strict';

/**
 * countries: ISO 3166-1 reference table used for location-based job
 * discovery and the candidate location picker. Seeded with the top
 * markets MatchHire serves; the full ISO list can be loaded later.
 */
module.exports = {
  name: '018_create_countries',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        code CHAR(2) NOT NULL,
        name VARCHAR(120) NOT NULL,
        continent VARCHAR(40) NULL,
        currency VARCHAR(8) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_countries_code (code),
        KEY idx_countries_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS countries;`); },
};
