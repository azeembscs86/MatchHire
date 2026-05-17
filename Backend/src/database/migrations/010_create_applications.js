'use strict';

module.exports = {
  name: '010_create_applications',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        job_id BIGINT UNSIGNED NOT NULL,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        company_id BIGINT UNSIGNED NOT NULL,
        cover_letter TEXT NULL,
        resume_url VARCHAR(500) NULL,
        expected_salary DECIMAL(12,2) NULL,
        status ENUM('applied','reviewing','shortlisted','interview','offered','hired','rejected','withdrawn') NOT NULL DEFAULT 'applied',
        rejection_reason VARCHAR(500) NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_applications_job_candidate (job_id, candidate_user_id),
        KEY idx_applications_candidate (candidate_user_id),
        KEY idx_applications_company (company_id),
        KEY idx_applications_status (status),
        CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_applications_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_applications_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS applications;`);
  },
};
