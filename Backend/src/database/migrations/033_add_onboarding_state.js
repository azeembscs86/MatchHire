'use strict';

/**
 * 033 — Candidate onboarding state
 * --------------------------------
 * Adds two columns to `candidate_profiles` so the new 7-step
 * Onboarding Wizard can persist progress and let the user resume
 * later (or skip the wizard entirely and pick up from the profile
 * editor).
 *
 *   onboarding_step          TINYINT UNSIGNED, 0..6
 *                            0 = Basic Information
 *                            1 = Resume Upload
 *                            2 = Skills & Expertise
 *                            3 = Work Experience
 *                            4 = Education
 *                            5 = Job Preferences
 *                            6 = Review & Complete Profile
 *
 *   onboarding_completed_at  DATETIME NULL — set when the user clicks
 *                            "Complete profile" on step 6. NULL means
 *                            the wizard is still in progress.
 *
 * Both columns are nullable / have safe defaults so existing rows
 * keep working unchanged. The auth flow itself is untouched.
 *
 * Idempotent: each column is guarded by an information_schema
 * lookup so `npm run migrate` can be re-run safely.
 */

module.exports = {
  name: '033_add_onboarding_state',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'candidate_profiles'`
    );
    const names = new Set(
      cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase())
    );
    if (!names.has('onboarding_step')) {
      await conn.query(
        `ALTER TABLE candidate_profiles
           ADD COLUMN onboarding_step TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER profile_strength`
      );
    }
    if (!names.has('onboarding_completed_at')) {
      await conn.query(
        `ALTER TABLE candidate_profiles
           ADD COLUMN onboarding_completed_at DATETIME NULL AFTER onboarding_step`
      );
    }
  },

  async down(conn) {
    try { await conn.query(`ALTER TABLE candidate_profiles DROP COLUMN onboarding_completed_at`); }
    catch (_) { /* absent */ }
    try { await conn.query(`ALTER TABLE candidate_profiles DROP COLUMN onboarding_step`); }
    catch (_) { /* absent */ }
  },
};
