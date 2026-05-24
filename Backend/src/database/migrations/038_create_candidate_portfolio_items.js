'use strict';

/**
 * 038 — `candidate_portfolio_items` table
 * ---------------------------------------
 * Universal "Work Portfolio & Achievements" surface — a single
 * table that holds every flavour of work evidence a candidate can
 * publish on their profile, regardless of profession (project,
 * achievement, certificate, work sample, case study, training,
 * research, field experience, volunteer work, portfolio link,
 * publication, award).
 *
 * Why one polymorphic table rather than one table per type
 * --------------------------------------------------------
 * Every type shares 90% of its shape (title, description, role,
 * dates, attachments, visibility). The differences sit in
 * free-text or array fields the UI can render uniformly. A single
 * table keeps the candidate API surface and the company-view
 * render path simple — one query lists everything ordered by
 * (is_current DESC, end_date DESC).
 *
 * Visibility is per-row:
 *   - public          → anyone viewing the candidate profile
 *   - companies_only  → logged-in companies only (default)
 *   - private         → the candidate themselves only
 *
 * Idempotent: guarded by an information_schema lookup.
 */

module.exports = {
  name: '038_create_candidate_portfolio_items',

  async up(conn) {
    const [rows] = await conn.query(
      `SELECT 1 AS exists_flag FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'candidate_portfolio_items'
       LIMIT 1`
    );
    if (rows.length) return;

    await conn.query(`
      CREATE TABLE candidate_portfolio_items (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(200) NOT NULL,
        /*
         * Free-text type so the enum can grow without a schema
         * migration. Validators clamp the API surface to the
         * canonical list (project, achievement, certificate,
         * work_sample, case_study, training, research,
         * field_experience, volunteer, portfolio_link,
         * publication, award).
         */
        item_type VARCHAR(40) NOT NULL DEFAULT 'project',
        category VARCHAR(120) NULL,
        role_responsibility VARCHAR(200) NULL,
        /*
         * JSON arrays of strings — skills and tools used on this
         * item. Stored as JSON so the API can return them
         * structured, and the matching layer can later mine them
         * as a second skill source without parsing CSV.
         */
        skills_used JSON NULL,
        tools_used JSON NULL,
        description TEXT NULL,
        impact TEXT NULL,
        /* Storage path of an uploaded proof file. Empty until the
           upload endpoint ships; external_link covers the
           "GitHub / Behance / publication URL" case meanwhile. */
        proof_file_url VARCHAR(500) NULL,
        external_link VARCHAR(500) NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        is_current TINYINT(1) NOT NULL DEFAULT 0,
        visibility ENUM('public', 'companies_only', 'private') NOT NULL DEFAULT 'companies_only',
        /* Per-item completeness (0..100) — recomputed on every
           write. Drives the portfolio strength meter on the
           profile editor without a round-trip per card. */
        completeness_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_portfolio_candidate (candidate_user_id, is_current, end_date),
        KEY idx_portfolio_type (item_type),
        KEY idx_portfolio_visibility (visibility),
        CONSTRAINT fk_portfolio_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS candidate_portfolio_items`);
  },
};
