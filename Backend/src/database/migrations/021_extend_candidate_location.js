'use strict';

/**
 * Extend `candidate_profiles` with the location fields used by the
 * match engine alongside the existing `location`/`country` strings.
 */
module.exports = {
  name: '021_extend_candidate_location',
  async up(conn) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM candidate_profiles`);
    const names = new Set(cols.map((c) => c.Field));

    if (!names.has('city')) {
      await conn.query(`ALTER TABLE candidate_profiles ADD COLUMN city VARCHAR(140) NULL AFTER location`);
    }
    if (!names.has('timezone')) {
      await conn.query(`ALTER TABLE candidate_profiles ADD COLUMN timezone VARCHAR(64) NULL AFTER country`);
    }
    if (!names.has('country_id')) {
      await conn.query(`ALTER TABLE candidate_profiles ADD COLUMN country_id INT UNSIGNED NULL AFTER country`);
      await conn.query(`ALTER TABLE candidate_profiles ADD CONSTRAINT fk_cp_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL ON UPDATE CASCADE`);
    }
  },
  async down(conn) {
    const safe = async (sql) => { try { await conn.query(sql); } catch (_) { /* noop */ } };
    await safe(`ALTER TABLE candidate_profiles DROP FOREIGN KEY fk_cp_country`);
    await safe(`ALTER TABLE candidate_profiles DROP COLUMN country_id`);
    await safe(`ALTER TABLE candidate_profiles DROP COLUMN timezone`);
    await safe(`ALTER TABLE candidate_profiles DROP COLUMN city`);
  },
};
