'use strict';

/**
 * Extend `preferences` with `job_scope` so candidates can declare
 * which geographic slice of jobs to surface. Values:
 *
 *   local         - same city only
 *   country       - same country
 *   global_remote - global remote roles only
 *   hybrid        - city + country + global remote (the default)
 */
module.exports = {
  name: '022_extend_preferences_job_scope',
  async up(conn) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM preferences`);
    if (!cols.some((c) => c.Field === 'job_scope')) {
      await conn.query(`ALTER TABLE preferences ADD COLUMN job_scope ENUM('local','country','global_remote','hybrid') NOT NULL DEFAULT 'hybrid' AFTER preferred_categories`);
    }
  },
  async down(conn) {
    try { await conn.query(`ALTER TABLE preferences DROP COLUMN job_scope`); } catch (_) { /* noop */ }
  },
};
