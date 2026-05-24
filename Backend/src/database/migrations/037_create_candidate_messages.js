'use strict';

/**
 * 037 — `candidate_messages` table
 * --------------------------------
 * Stores professional candidate-to-candidate messages sent through
 * the "Similar Professionals" surface on the Candidates page. The
 * sender is the logged-in candidate; the recipient is one of the
 * candidates surfaced in their similarity feed (`/candidates/
 * similar`).
 *
 * Content gating happens at the SERVICE layer
 * (`candidate.service#sendMessage`) — this table only stores rows
 * that passed validation. The persisted row is useful for:
 *
 *   - showing a sent / received history later (read_at column)
 *   - rate-limiting future spam (audit query)
 *   - powering an inbox surface when the UI gets built
 *
 * Each row carries a snapshot of the similarity score at send-time
 * so we keep a record even if the candidates' profiles drift later.
 *
 * Idempotent: guarded by an information_schema lookup.
 */

module.exports = {
  name: '037_create_candidate_messages',

  async up(conn) {
    const [rows] = await conn.query(
      `SELECT 1 AS exists_flag FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'candidate_messages'
       LIMIT 1`
    );
    if (rows.length) return;

    await conn.query(`
      CREATE TABLE candidate_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        sender_user_id BIGINT UNSIGNED NOT NULL,
        recipient_user_id BIGINT UNSIGNED NOT NULL,
        subject VARCHAR(200) NULL,
        body TEXT NOT NULL,
        similarity_score DECIMAL(5,2) NULL,
        read_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_msg_recipient (recipient_user_id, created_at),
        KEY idx_msg_sender (sender_user_id, created_at),
        CONSTRAINT fk_msg_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_msg_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS candidate_messages`);
  },
};
