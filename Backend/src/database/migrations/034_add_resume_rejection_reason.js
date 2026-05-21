'use strict';

/**
 * 034 — Resume rejection_reason column
 * ------------------------------------
 * Adds an optional `rejection_reason` column to `resumes` so the new
 * "Reject parsed data" candidate action can record WHY the user
 * dismissed the parser's output. The resume file stays uploaded
 * (this isn't a delete) — only the parsed-preview accept/apply
 * flow is short-circuited.
 *
 * Idempotent — guarded on information_schema.columns.
 */

module.exports = {
  name: '034_add_resume_rejection_reason',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'resumes'`
    );
    const names = new Set(
      cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase())
    );
    if (!names.has('rejection_reason')) {
      await conn.query(
        `ALTER TABLE resumes
           ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER parse_error`
      );
    }
  },

  async down(conn) {
    try { await conn.query(`ALTER TABLE resumes DROP COLUMN rejection_reason`); }
    catch (_) { /* absent — ignore */ }
  },
};
