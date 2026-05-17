'use strict';

/**
 * application_match_results
 *
 * One row per application, persisted by `apply-and-validate`. Lets
 * employers see WHY an application reached them (or why a borderline
 * one didn't) and lets admins audit the match engine.
 *
 * `decision` is the policy applied at apply-time, not the eventual
 * hiring decision - `applications.status` owns that lifecycle.
 *
 *   accepted - score >= threshold; application created
 *   rejected - hard mismatch (missing required skill / location /
 *              level); application NOT created, candidate sees the
 *              rejection reason
 *   below_threshold - score under the soft threshold; application
 *              created with `status='reviewing'` so the employer can
 *              still see it but it's flagged in the funnel
 */
module.exports = {
  name: '026_create_application_match_results',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS application_match_results (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        application_id BIGINT UNSIGNED NULL,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        match_score TINYINT UNSIGNED NOT NULL,
        decision ENUM('accepted','rejected','below_threshold') NOT NULL,
        reasons JSON NULL,
        missing JSON NULL,
        rejection_message VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_amr_application (application_id),
        KEY idx_amr_candidate (candidate_user_id),
        KEY idx_amr_job (job_id),
        KEY idx_amr_decision (decision),
        CONSTRAINT fk_amr_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_amr_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_amr_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    // Extend applications with match_score so list endpoints don't have to JOIN.
    const [cols] = await conn.query(`SHOW COLUMNS FROM applications`);
    if (!cols.some((c) => c.Field === 'match_score')) {
      await conn.query(`ALTER TABLE applications ADD COLUMN match_score TINYINT UNSIGNED NULL AFTER status`);
    }
  },
  async down(conn) {
    try { await conn.query(`ALTER TABLE applications DROP COLUMN match_score`); } catch (_) { /* noop */ }
    await conn.query(`DROP TABLE IF EXISTS application_match_results;`);
  },
};
