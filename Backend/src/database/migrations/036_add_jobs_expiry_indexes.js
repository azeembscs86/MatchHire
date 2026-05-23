'use strict';

/**
 * 036 — Index `(status, application_deadline)` on `jobs`
 * ------------------------------------------------------
 * Every candidate / public job listing query now filters on the
 * "still-active, not-expired" predicate composed by
 * `job.repository#activeJobWhere()`:
 *
 *   j.status = 'open'
 *   AND (j.application_deadline IS NULL OR j.application_deadline > NOW())
 *
 * A composite index on (status, application_deadline) lets MySQL use
 * the index for the equality on status AND the range on the deadline,
 * which is the hottest predicate for the Jobs feed, Home rails, and
 * recommended-jobs endpoints. We also add a standalone index on
 * `application_deadline` so the deadline-only sort paths (Closing
 * soon / Closing today) don't fall back to a table scan.
 *
 * Idempotent: guarded by an information_schema lookup so re-running
 * migrations against a DB that already has the index is a no-op.
 */

module.exports = {
  name: '036_add_jobs_expiry_indexes',

  async up(conn) {
    async function indexExists(name) {
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'jobs' AND index_name = ?
         LIMIT 1`,
        [name]
      );
      return rows.length > 0;
    }

    if (!(await indexExists('idx_jobs_status_deadline'))) {
      await conn.query(
        `CREATE INDEX idx_jobs_status_deadline ON jobs (status, application_deadline)`
      );
    }
    if (!(await indexExists('idx_jobs_application_deadline'))) {
      await conn.query(
        `CREATE INDEX idx_jobs_application_deadline ON jobs (application_deadline)`
      );
    }
  },

  async down(conn) {
    async function indexExists(name) {
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'jobs' AND index_name = ?
         LIMIT 1`,
        [name]
      );
      return rows.length > 0;
    }

    if (await indexExists('idx_jobs_status_deadline')) {
      await conn.query(`DROP INDEX idx_jobs_status_deadline ON jobs`);
    }
    if (await indexExists('idx_jobs_application_deadline')) {
      await conn.query(`DROP INDEX idx_jobs_application_deadline ON jobs`);
    }
  },
};
