'use strict';

/**
 * 032 — Extend the `preferences` table with the full preferences-page
 * field set.
 *
 * The original `preferences` table (migration 012 + the 022 extension)
 * only covered the matching-engine essentials: desired_titles,
 * preferred_locations/job_types/categories, salary range, scope,
 * notify_email/push. Everything else on the SPA's Preferences page
 * (priorities ranking, match weights, deal breakers, work-mode
 * multi-select, company stages, comp benefits, three location
 * toggles, four detailed notification toggles, email digest frequency,
 * minimum match score floor) lived in the UI only — clicking the
 * chips lit them up visually but the values never reached the
 * server.
 *
 * This migration closes that gap. 16 new columns / types chosen to
 * minimise overhead:
 *
 *   - JSON columns for true structured data (priorities order,
 *     match_weights map, deal_breakers list).
 *   - VARCHAR(CSV) columns for small string sets (work_modes,
 *     experience_levels, compensation_benefits, company_stages) —
 *     matches the pattern already in use for `desired_titles` etc.
 *     and avoids over-engineering small <10-item enums.
 *   - TINYINT(1) booleans with sensible defaults so existing rows
 *     stay valid (the upsertPreferences code path is unchanged for
 *     the legacy fields).
 *   - ENUM('real_time','daily','weekly','off') for email frequency.
 *
 * Idempotent: each ALTER is gated on an information_schema.columns
 * check so re-running `npm run migrate` is safe.
 */

module.exports = {
  name: '032_extend_preferences_full',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'preferences'`
    );
    const names = new Set(
      cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase())
    );

    /** Add a column only if missing — keeps the migration idempotent. */
    async function addIfMissing(col, ddl) {
      if (names.has(col.toLowerCase())) return;
      await conn.query(`ALTER TABLE preferences ADD COLUMN ${ddl}`);
    }

    // ---- Structured JSON columns ----
    // `priorities`         ordered list of priority ids (max 8)
    // `match_weights`      { compensation: 85, skills: 95, ... }
    // `deal_breakers`      string[] of free-text deal breakers
    await addIfMissing('priorities', 'priorities JSON NULL AFTER preferred_categories');
    await addIfMissing('match_weights', 'match_weights JSON NULL');
    await addIfMissing('deal_breakers', 'deal_breakers JSON NULL');

    // ---- CSV-string columns (small enumerable sets) ----
    // Stored as comma-joined strings to match the existing pattern
    // for desired_titles / preferred_locations / etc.
    await addIfMissing('experience_levels', "experience_levels VARCHAR(200) NULL");
    await addIfMissing('compensation_benefits', "compensation_benefits VARCHAR(500) NULL");
    await addIfMissing('work_modes', "work_modes VARCHAR(80) NULL");
    await addIfMissing('company_stages', "company_stages VARCHAR(200) NULL");

    // ---- Location toggles ----
    await addIfMissing('relocate_open', "relocate_open TINYINT(1) NOT NULL DEFAULT 0");
    await addIfMissing('visa_sponsorship_needed', "visa_sponsorship_needed TINYINT(1) NOT NULL DEFAULT 0");
    await addIfMissing('timezone_overlap_required', "timezone_overlap_required TINYINT(1) NOT NULL DEFAULT 0");

    // ---- Email digest + match-score floor ----
    await addIfMissing(
      'email_frequency',
      "email_frequency ENUM('real_time','daily','weekly','off') NOT NULL DEFAULT 'daily'"
    );
    await addIfMissing(
      'minimum_match_score',
      'minimum_match_score TINYINT UNSIGNED NOT NULL DEFAULT 70'
    );

    // ---- Four detailed notification toggles ----
    await addIfMissing('recruiter_messages', "recruiter_messages TINYINT(1) NOT NULL DEFAULT 1");
    await addIfMissing('interview_reminders', "interview_reminders TINYINT(1) NOT NULL DEFAULT 1");
    await addIfMissing('weekly_profile_insights', "weekly_profile_insights TINYINT(1) NOT NULL DEFAULT 1");
    await addIfMissing('salary_trend_alerts', "salary_trend_alerts TINYINT(1) NOT NULL DEFAULT 0");
  },

  async down(conn) {
    // Drop columns in reverse order of add. Each DROP is wrapped so
    // an absent column doesn't fail the rollback.
    const drops = [
      'salary_trend_alerts', 'weekly_profile_insights', 'interview_reminders', 'recruiter_messages',
      'minimum_match_score', 'email_frequency',
      'timezone_overlap_required', 'visa_sponsorship_needed', 'relocate_open',
      'company_stages', 'work_modes', 'compensation_benefits', 'experience_levels',
      'deal_breakers', 'match_weights', 'priorities',
    ];
    for (const col of drops) {
      try { await conn.query(`ALTER TABLE preferences DROP COLUMN ${col}`); }
      catch (_) { /* column already absent — ignore */ }
    }
  },
};
