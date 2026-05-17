'use strict';

module.exports = {
  name: '014_create_interviews',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS interviews (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        application_id BIGINT UNSIGNED NOT NULL,
        job_id BIGINT UNSIGNED NOT NULL,
        company_id BIGINT UNSIGNED NOT NULL,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        employer_user_id BIGINT UNSIGNED NULL,
        scheduled_at DATETIME NOT NULL,
        duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
        mode ENUM('onsite','phone','video','assessment') NOT NULL DEFAULT 'video',
        location VARCHAR(255) NULL,
        meeting_url VARCHAR(500) NULL,
        notes TEXT NULL,
        status ENUM('scheduled','completed','cancelled','no_show','rescheduled') NOT NULL DEFAULT 'scheduled',
        feedback TEXT NULL,
        rating TINYINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_interviews_application (application_id),
        KEY idx_interviews_candidate (candidate_user_id),
        KEY idx_interviews_company (company_id),
        KEY idx_interviews_scheduled (scheduled_at),
        CONSTRAINT fk_interviews_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_interviews_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_interviews_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_interviews_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_interviews_employer FOREIGN KEY (employer_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS interviews;`);
  },
};
