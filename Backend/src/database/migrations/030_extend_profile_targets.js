'use strict';

/**
 * 030 — Candidate profile target fields
 * -------------------------------------
 * Extends `candidate_profiles` with three columns that power the
 * richer "What you're looking for" + relocation sections on the
 * profile page:
 *
 *   - `desired_role`       VARCHAR(190) NULL — distinct from
 *                          `current_title`; this is the role the
 *                          candidate is HUNTING for, not the one
 *                          they currently hold.
 *   - `work_preference`    ENUM('remote','hybrid','onsite') NULL
 *                          — preferred work mode for matching.
 *   - `relocation_scope`   ENUM('anywhere','region','remote_only') NULL
 *                          — finer-grained replacement for the
 *                          boolean `open_to_remote`. The boolean
 *                          column is KEPT for backward compatibility:
 *                          existing services keep reading it; the
 *                          profile-update service writes both based
 *                          on `relocation_scope` so consumers stay in
 *                          sync without a migration of read code.
 *
 * Idempotent: checks information_schema.columns before adding so
 * `npm run migrate` is safe to re-run.
 */

module.exports = {
  name: '030_extend_profile_targets',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'candidate_profiles'`
    );
    const names = new Set(
      cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase())
    );

    if (!names.has('desired_role')) {
      await conn.query(
        `ALTER TABLE candidate_profiles
           ADD COLUMN desired_role VARCHAR(190) NULL AFTER current_title`
      );
    }

    if (!names.has('work_preference')) {
      await conn.query(
        `ALTER TABLE candidate_profiles
           ADD COLUMN work_preference ENUM('remote','hybrid','onsite') NULL
           AFTER open_to_remote`
      );
    }

    if (!names.has('relocation_scope')) {
      await conn.query(
        `ALTER TABLE candidate_profiles
           ADD COLUMN relocation_scope ENUM('anywhere','region','remote_only') NULL
           AFTER work_preference`
      );
    }
  },

  async down(conn) {
    for (const col of ['relocation_scope', 'work_preference', 'desired_role']) {
      try { await conn.query(`ALTER TABLE candidate_profiles DROP COLUMN ${col}`); }
      catch (_) { /* absent — ignore */ }
    }
  },
};
