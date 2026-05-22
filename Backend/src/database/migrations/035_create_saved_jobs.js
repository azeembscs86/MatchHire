'use strict';

/**
 * 035 — `saved_jobs` table (candidate "save for later" surface)
 * ------------------------------------------------------------
 * Distinct from `favorites`. Conceptually:
 *
 *   favorites  → I LIKE this job (no expiry, no apply intent)
 *   saved_jobs → I PLAN TO APPLY (expires when the job's
 *                application_deadline passes)
 *
 * The two surfaces are kept separate per product spec — the
 * candidate dashboard renders them as different sections with
 * different actions ("Remove from favourites" vs "Apply now" on
 * a saved-for-later row).
 *
 * `expires_at` is denormalised from `jobs.application_deadline`
 * at save-time. We derive it server-side (not from the client)
 * so a tampered request can't extend the window. Reads filter
 * by `expires_at IS NULL OR expires_at > NOW()` so expired
 * saves drop out of the active list automatically.
 *
 * Idempotent: guarded by an information_schema lookup.
 */

module.exports = {
  name: '035_create_saved_jobs',

  async up(conn) {
    const [rows] = await conn.query(
      `SELECT 1 AS exists_flag FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'saved_jobs' LIMIT 1`
    );
    if (rows.length) return;

    await conn.query(`
      CREATE TABLE saved_jobs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        /*
         * Mirrors jobs.application_deadline at the moment of save.
         * NULL means the job has no deadline (treat as never-expires).
         * On read we compare against NOW() so expired saves disappear
         * from the active list without needing a cron sweep.
         */
        expires_at DATETIME NULL,
        /*
         * 'active' is the default; an admin tool could later flip a
         * row to 'archived' without deleting it. Today the candidate
         * delete path simply removes the row.
         */
        status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        /*
         * Prevents duplicate saves of the same job by the same
         * candidate — the service's add() path treats a duplicate
         * INSERT as a no-op (ON DUPLICATE KEY UPDATE updated_at).
         */
        UNIQUE KEY uq_saved_candidate_job (candidate_user_id, job_id),
        KEY idx_saved_candidate (candidate_user_id),
        KEY idx_saved_job (job_id),
        KEY idx_saved_expires (expires_at),
        CONSTRAINT fk_saved_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_saved_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS saved_jobs`);
  },
};
