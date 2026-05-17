'use strict';

module.exports = {
  name: '007_create_candidate_profiles',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        headline VARCHAR(190) NULL,
        summary TEXT NULL,
        current_title VARCHAR(150) NULL,
        years_experience DECIMAL(4,1) NOT NULL DEFAULT 0,
        location VARCHAR(190) NULL,
        country VARCHAR(80) NULL,
        open_to_remote TINYINT(1) NOT NULL DEFAULT 1,
        expected_salary_min DECIMAL(12,2) NULL,
        expected_salary_max DECIMAL(12,2) NULL,
        salary_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        availability ENUM('immediate','two_weeks','one_month','negotiable','not_looking') NOT NULL DEFAULT 'negotiable',
        resume_url VARCHAR(500) NULL,
        portfolio_url VARCHAR(500) NULL,
        linkedin_url VARCHAR(500) NULL,
        github_url VARCHAR(500) NULL,
        education TEXT NULL,
        experience TEXT NULL,
        languages VARCHAR(255) NULL,
        profile_strength TINYINT UNSIGNED NOT NULL DEFAULT 0,
        is_public TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_candidate_profiles_user (user_id),
        KEY idx_candidate_profiles_location (location),
        KEY idx_candidate_profiles_remote (open_to_remote),
        CONSTRAINT fk_candidate_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS candidate_profiles;`);
  },
};
