'use strict';

/**
 * 029 — Candidate profile image column
 * ------------------------------------
 * Adds a dedicated `profile_image` column on `candidate_profiles`
 * that stores the relative storage path (e.g. `profile-images/<hex>.jpg`)
 * of the uploaded image. The frontend never sees the raw path; it
 * receives a short-lived signed URL produced by `storage.signUrl()`.
 *
 * `users.avatar_url` already exists from migration 002 and is kept
 * in sync as a denormalised convenience — most read paths
 * (dashboard, navigation, header) already select `u.avatar_url` so
 * mirroring the value there means existing UI surfaces light up
 * automatically.
 *
 * Idempotent: checks information_schema.columns before adding so
 * `npm run migrate` is safe to re-run.
 */

module.exports = {
  name: '029_add_profile_image',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'candidate_profiles'`
    );
    const names = new Set(cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase()));
    if (!names.has('profile_image')) {
      await conn.query(
        `ALTER TABLE candidate_profiles ADD COLUMN profile_image VARCHAR(500) NULL AFTER resume_url`
      );
    }
  },

  async down(conn) {
    try { await conn.query(`ALTER TABLE candidate_profiles DROP COLUMN profile_image`); }
    catch (_) { /* column absent — ignore */ }
  },
};
