'use strict';

module.exports = {
  name: '011_create_favorites',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_favorites_user_job (user_id, job_id),
        KEY idx_favorites_job (job_id),
        CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_favorites_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS favorites;`);
  },
};
