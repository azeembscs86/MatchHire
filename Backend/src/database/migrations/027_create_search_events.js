'use strict';

/**
 * search_events
 *
 * Captures every front-end search interaction the analytics endpoint
 * forwards: keyword, scope, applied filters, result count, clicked
 * record, whether it converted to an application, and the calling
 * user (if signed in). Sized for high write volume, light read
 * volume; we add a (user_id, created_at) index for "your recent
 * searches" and a (created_at) index for global trend queries.
 */
module.exports = {
  name: '027_create_search_events',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS search_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NULL,
        index_name VARCHAR(40) NOT NULL,
        keyword VARCHAR(200) NULL,
        country VARCHAR(80) NULL,
        city VARCHAR(120) NULL,
        filters JSON NULL,
        result_count INT UNSIGNED NOT NULL DEFAULT 0,
        clicked_id BIGINT UNSIGNED NULL,
        converted_application_id BIGINT UNSIGNED NULL,
        no_results TINYINT(1) NOT NULL DEFAULT 0,
        latency_ms INT UNSIGNED NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_se_user_time (user_id, created_at),
        KEY idx_se_created (created_at),
        KEY idx_se_no_results (no_results, created_at),
        KEY idx_se_index_keyword (index_name, keyword),
        CONSTRAINT fk_se_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS search_events;`); },
};
