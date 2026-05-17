'use strict';

/**
 * resume_parsed_data
 *
 * Structured output of `resume.service.parse(file)`. The candidate
 * reviews the parsed fields on the frontend and confirms them, at
 * which point the chosen fields are merged into `candidate_profiles`
 * via `/profile/confirm-resume-data`. Keeping the raw extraction here
 * lets us re-run parsing without re-uploading the file, and lets us
 * diff against later versions of the profile.
 */
module.exports = {
  name: '025_create_resume_parsed_data',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS resume_parsed_data (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        resume_id BIGINT UNSIGNED NOT NULL,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        full_name VARCHAR(190) NULL,
        email VARCHAR(190) NULL,
        phone VARCHAR(60) NULL,
        location VARCHAR(190) NULL,
        country VARCHAR(80) NULL,
        city VARCHAR(140) NULL,
        job_title VARCHAR(190) NULL,
        summary TEXT NULL,
        skills JSON NULL,
        experience JSON NULL,
        education JSON NULL,
        certifications JSON NULL,
        linkedin_url VARCHAR(500) NULL,
        github_url VARCHAR(500) NULL,
        portfolio_url VARCHAR(500) NULL,
        raw_text MEDIUMTEXT NULL,
        confidence DECIMAL(5,2) NULL,
        confirmed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_rpd_resume (resume_id),
        KEY idx_rpd_candidate (candidate_user_id),
        CONSTRAINT fk_rpd_resume FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_rpd_candidate FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) { await conn.query(`DROP TABLE IF EXISTS resume_parsed_data;`); },
};
