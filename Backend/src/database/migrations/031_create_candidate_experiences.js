'use strict';

/**
 * 031 — candidate_experiences table
 * ---------------------------------
 * Normalises candidate work history. Previously:
 *   - `candidate_profiles.experience` carried a single free-text blob
 *   - `resume_parsed_data.experience` carried JSON extracted by the
 *     resume parser
 *
 * Neither path supports CRUD from the Profile page. This table is the
 * source of truth going forward:
 *
 *   id                BIGINT UNSIGNED  PK
 *   candidate_user_id BIGINT UNSIGNED  FK→users(id), indexed
 *   company           VARCHAR(190)     NOT NULL
 *   title             VARCHAR(190)     NOT NULL
 *   start_date        DATE             NOT NULL  (YYYY-MM-01 acceptable)
 *   end_date          DATE             NULL      (NULL when is_current=1)
 *   is_current        TINYINT(1)       DEFAULT 0
 *   description       TEXT             NULL
 *   sort_order        INT UNSIGNED     DEFAULT 0 (lower = newer on read)
 *   created_at        DATETIME         DEFAULT CURRENT_TIMESTAMP
 *   updated_at        DATETIME         ON UPDATE CURRENT_TIMESTAMP
 *
 * Reads sort by sort_order ASC, end_date DESC (NULLs first), so the
 * "current role" naturally floats to the top.
 *
 * The Review page + completion scorer will prefer rows from this
 * table; if it is empty, they fall back to the legacy parsed-resume
 * experience JSON so existing accounts keep working.
 *
 * Idempotent: checks information_schema before creating.
 */

module.exports = {
  name: '031_create_candidate_experiences',

  async up(conn) {
    const [tbls] = await conn.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'candidate_experiences'`
    );
    const exists = tbls.some(
      (r) => String(r.name || r.NAME || r.table_name).toLowerCase() === 'candidate_experiences'
    );
    if (exists) return;

    await conn.query(`
      CREATE TABLE candidate_experiences (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        company VARCHAR(190) NOT NULL,
        title VARCHAR(190) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        is_current TINYINT(1) NOT NULL DEFAULT 0,
        description TEXT NULL,
        sort_order INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_cand_exp_user (candidate_user_id),
        INDEX idx_cand_exp_user_current (candidate_user_id, is_current),
        CONSTRAINT fk_cand_exp_user
          FOREIGN KEY (candidate_user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },

  async down(conn) {
    try { await conn.query(`DROP TABLE IF EXISTS candidate_experiences`); }
    catch (_) { /* absent — ignore */ }
  },
};
