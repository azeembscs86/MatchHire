'use strict';

/**
 * Extend `jobs` with the global-job fields used by location-based
 * discovery and the match engine.
 *
 *   city            - human-readable city (separate from the
 *                     existing free-text `location`)
 *   timezone        - IANA timezone (e.g. "America/Los_Angeles")
 *   work_mode       - onsite | hybrid | remote (orthogonal to
 *                     `is_remote`; "hybrid" is its own value)
 *   is_global_remote- the role accepts candidates from any country.
 *                     Set automatically by the seed/employer flow
 *                     when work_mode='remote' and country is null.
 *   country_id      - optional FK so location queries can join the
 *                     countries reference table.
 */
module.exports = {
  name: '020_extend_jobs_location',
  async up(conn) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM jobs`);
    const names = new Set(cols.map((c) => c.Field));

    if (!names.has('city')) {
      await conn.query(`ALTER TABLE jobs ADD COLUMN city VARCHAR(140) NULL AFTER location`);
    }
    if (!names.has('timezone')) {
      await conn.query(`ALTER TABLE jobs ADD COLUMN timezone VARCHAR(64) NULL AFTER country`);
    }
    if (!names.has('work_mode')) {
      await conn.query(`ALTER TABLE jobs ADD COLUMN work_mode ENUM('onsite','hybrid','remote') NOT NULL DEFAULT 'onsite' AFTER is_remote`);
      await conn.query(`UPDATE jobs SET work_mode = CASE WHEN is_remote = 1 THEN 'remote' ELSE 'onsite' END`);
    }
    if (!names.has('is_global_remote')) {
      await conn.query(`ALTER TABLE jobs ADD COLUMN is_global_remote TINYINT(1) NOT NULL DEFAULT 0 AFTER work_mode`);
      await conn.query(`UPDATE jobs SET is_global_remote = 1 WHERE is_remote = 1 AND (country IS NULL OR country = '' OR country = 'Global')`);
    }
    if (!names.has('country_id')) {
      await conn.query(`ALTER TABLE jobs ADD COLUMN country_id INT UNSIGNED NULL AFTER country`);
      await conn.query(`ALTER TABLE jobs ADD CONSTRAINT fk_jobs_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL ON UPDATE CASCADE`);
      await conn.query(`ALTER TABLE jobs ADD INDEX idx_jobs_country_id (country_id)`);
    }

    // Helpful composite index for the "city first, then country, then global remote" query.
    const [idx] = await conn.query(`SHOW INDEX FROM jobs WHERE Key_name = 'idx_jobs_loc_lookup'`);
    if (idx.length === 0) {
      await conn.query(`ALTER TABLE jobs ADD INDEX idx_jobs_loc_lookup (country, city, work_mode, is_global_remote)`);
    }
  },
  async down(conn) {
    const safeDrop = async (sql) => { try { await conn.query(sql); } catch (_) { /* noop */ } };
    await safeDrop(`ALTER TABLE jobs DROP INDEX idx_jobs_loc_lookup`);
    await safeDrop(`ALTER TABLE jobs DROP FOREIGN KEY fk_jobs_country`);
    await safeDrop(`ALTER TABLE jobs DROP INDEX idx_jobs_country_id`);
    await safeDrop(`ALTER TABLE jobs DROP COLUMN country_id`);
    await safeDrop(`ALTER TABLE jobs DROP COLUMN is_global_remote`);
    await safeDrop(`ALTER TABLE jobs DROP COLUMN work_mode`);
    await safeDrop(`ALTER TABLE jobs DROP COLUMN timezone`);
    await safeDrop(`ALTER TABLE jobs DROP COLUMN city`);
  },
};
