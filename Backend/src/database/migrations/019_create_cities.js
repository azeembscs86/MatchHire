'use strict';

/**
 * cities: per-country city reference used by the location filter on
 * jobs and by the candidate profile picker. `latitude`/`longitude`
 * are present so we can compute distance-weighted match scores in the
 * future (kept nullable since not every record has coordinates).
 */
module.exports = {
  name: '019_create_cities',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        country_id INT UNSIGNED NOT NULL,
        name VARCHAR(140) NOT NULL,
        slug VARCHAR(160) NOT NULL,
        timezone VARCHAR(64) NULL,
        latitude DECIMAL(9,6) NULL,
        longitude DECIMAL(9,6) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_cities_country_slug (country_id, slug),
        KEY idx_cities_country (country_id),
        KEY idx_cities_name (name),
        CONSTRAINT fk_cities_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS cities;`); },
};
