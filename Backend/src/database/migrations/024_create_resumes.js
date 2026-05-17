'use strict';

/**
 * resumes
 *
 * Metadata for resume files uploaded by candidates. The actual file
 * lives on disk under `storage/resumes/<random>.<ext>` (or in S3 if
 * the storage service is swapped). Downloads are served through a
 * short-lived HMAC-signed URL, never directly.
 *
 * One candidate can keep multiple resumes; `is_primary` flags the one
 * that's auto-attached to applications.
 */
module.exports = {
  name: '024_create_resumes',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        storage_path VARCHAR(500) NOT NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        parse_status ENUM('pending','parsing','parsed','failed') NOT NULL DEFAULT 'pending',
        parse_error VARCHAR(500) NULL,
        uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_resumes_candidate (candidate_user_id),
        KEY idx_resumes_primary (candidate_user_id, is_primary),
        CONSTRAINT fk_resumes_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS resumes;`); },
};
