'use strict';

/**
 * 039 — Backfill `jobs.work_mode`
 * --------------------------------
 * Migration 020 added the `work_mode` ENUM('onsite','hybrid','remote')
 * column with default 'onsite' and tried to seed existing rows
 * (CASE WHEN is_remote = 1 THEN 'remote' ELSE 'onsite' END). However:
 *
 *   - The ENUM column technically can't hold NULL, but bulk-inserted
 *     rows that bypassed the application layer can land with an
 *     empty-string value on some MySQL configurations.
 *   - The legacy `is_remote=true` path is now folded into
 *     `work_mode='remote'`, so we re-run the upgrade to catch any
 *     drift the app layer hasn't yet fixed.
 *
 * Two passes:
 *   1. Set work_mode='onsite' for any row where the column is empty,
 *      not in the canonical set, or NULL (defensive).
 *   2. Re-align work_mode with is_remote where they disagree — older
 *      records that were toggled is_remote=true after the migration
 *      can otherwise show "Onsite" on the card.
 *
 * Idempotent.
 */

module.exports = {
  name: '039_backfill_jobs_work_mode',

  async up(conn) {
    // Defensive: rows whose work_mode is empty / not in the canonical
    // set get clamped to 'onsite' (the spec default).
    await conn.query(
      `UPDATE jobs
       SET work_mode = 'onsite'
       WHERE work_mode IS NULL
          OR work_mode = ''
          OR work_mode NOT IN ('onsite', 'hybrid', 'remote')`
    );
    // is_remote=1 rows that somehow still say 'onsite' get realigned
    // to 'remote' so the card badge matches the boolean filter.
    await conn.query(
      `UPDATE jobs
       SET work_mode = 'remote'
       WHERE is_remote = 1 AND work_mode = 'onsite'`
    );
  },

  async down(_conn) {
    // No-op — we don't want to clear valid values on a rollback.
  },
};
