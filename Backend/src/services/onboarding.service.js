'use strict';

/**
 * Onboarding service
 * ------------------
 * Backs the 7-step Candidate Onboarding Wizard. The wizard's per-step
 * data (basic info, skills, experiences, preferences, resume) is
 * persisted through the existing profile endpoints — this service
 * only manages the WIZARD'S OWN state:
 *
 *   - `onboarding_step`          current step index (0..6)
 *   - `onboarding_completed_at`  set when user finishes step 6
 *
 * Read endpoint also bundles the existing profile-completion
 * breakdown so the wizard's progress bar and "n of 7 sections
 * complete" indicator can render from a single round-trip.
 *
 * Step indices match the wizard layout (do not reorder without
 * touching `OnboardingWizard.jsx`):
 *
 *     0 = Basic Information
 *     1 = Resume Upload
 *     2 = Skills & Expertise
 *     3 = Work Experience
 *     4 = Education
 *     5 = Job Preferences
 *     6 = Review & Complete Profile
 */

const db = require('../config/database');
const candidateRepo = require('../repositories/candidate.repository');
const AppError = require('../utils/AppError');

const TOTAL_STEPS = 7;
const FINAL_STEP_INDEX = 6;

/**
 * Read the wizard state for a candidate. Returns a synthesised row
 * even when no candidate_profiles row exists yet so the wizard can
 * always render its first screen.
 */
async function getState(user_id) {
  const profile = await candidateRepo.findProfileByUserId(user_id);
  const completion = await candidateRepo.computeCompletionBreakdown(user_id);
  const step = Number(profile?.onboarding_step || 0);
  const completedAt = profile?.onboarding_completed_at || null;
  return {
    current_step: Math.min(FINAL_STEP_INDEX, Math.max(0, step)),
    total_steps: TOTAL_STEPS,
    is_completed: !!completedAt,
    completed_at: completedAt,
    profile_strength: Number(profile?.profile_strength || 0),
    completion,
  };
}

/**
 * Advance the wizard to a new step (or mark it complete).
 *
 * @param {number} user_id
 * @param {object} payload
 * @param {number} payload.step       new current step (0..6)
 * @param {boolean} [payload.complete] true on the final "Complete profile" click
 */
async function advance(user_id, payload = {}) {
  const step = Math.min(FINAL_STEP_INDEX, Math.max(0, Number(payload.step || 0)));
  /*
   * Ensure a candidate_profiles row exists — the wizard may be hit
   * very early, immediately after registration. We use a direct
   * INSERT IGNORE here instead of upsertProfile() because that
   * helper's empty-fields path emits an INSERT without an
   * ON DUPLICATE KEY UPDATE clause, which throws on existing rows.
   * INSERT IGNORE is the right primitive: create-if-absent, no-op
   * otherwise, no error either way.
   */
  await db.getPool().execute(
    `INSERT IGNORE INTO candidate_profiles (user_id) VALUES (?)`,
    [user_id]
  );

  if (payload.complete) {
    // Set the completion timestamp ONCE — re-completing keeps the
    // original timestamp so analytics ("time-to-first-complete")
    // stay stable.
    await db.getPool().execute(
      `UPDATE candidate_profiles
         SET onboarding_step = ?, onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
       WHERE user_id = ?`,
      [step, user_id]
    );
  } else {
    await db.getPool().execute(
      `UPDATE candidate_profiles SET onboarding_step = ? WHERE user_id = ?`,
      [step, user_id]
    );
  }

  return getState(user_id);
}

/**
 * Reset the wizard (used by admin tools / tests / "Restart onboarding"
 * action on the profile page). Wipes both columns; profile data is
 * untouched.
 */
async function reset(user_id) {
  await db.getPool().execute(
    `UPDATE candidate_profiles
       SET onboarding_step = 0, onboarding_completed_at = NULL
     WHERE user_id = ?`,
    [user_id]
  );
  return getState(user_id);
}

module.exports = {
  getState,
  advance,
  reset,
  TOTAL_STEPS,
  FINAL_STEP_INDEX,
};
