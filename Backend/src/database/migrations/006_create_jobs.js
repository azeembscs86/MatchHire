'use strict';

module.exports = {
  name: '006_create_jobs',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id BIGINT UNSIGNED NOT NULL,
        posted_by_user_id BIGINT UNSIGNED NULL,
        category_id INT UNSIGNED NULL,
        title VARCHAR(200) NOT NULL,
        slug VARCHAR(220) NULL,
        description TEXT NOT NULL,
        responsibilities TEXT NULL,
        requirements TEXT NULL,
        benefits TEXT NULL,
        job_type ENUM('full_time','part_time','contract','internship','temporary','freelance') NOT NULL DEFAULT 'full_time',
        experience_level ENUM('entry','junior','mid','senior','lead','executive') NOT NULL DEFAULT 'mid',
        location VARCHAR(190) NULL,
        country VARCHAR(80) NULL,
        is_remote TINYINT(1) NOT NULL DEFAULT 0,
        salary_min DECIMAL(12,2) NULL,
        salary_max DECIMAL(12,2) NULL,
        salary_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        salary_period ENUM('hour','day','month','year') NOT NULL DEFAULT 'year',
        skills_tags VARCHAR(1000) NULL,
        application_deadline DATE NULL,
        vacancies INT UNSIGNED NOT NULL DEFAULT 1,
        views_count INT UNSIGNED NOT NULL DEFAULT 0,
        applications_count INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('draft','open','closed','archived','rejected') NOT NULL DEFAULT 'open',
        is_featured TINYINT(1) NOT NULL DEFAULT 0,
        admin_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
        published_at DATETIME NULL,
        closed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_jobs_company (company_id),
        KEY idx_jobs_category (category_id),
        KEY idx_jobs_status (status),
        KEY idx_jobs_job_type (job_type),
        KEY idx_jobs_location (location),
        KEY idx_jobs_remote (is_remote),
        KEY idx_jobs_featured (is_featured),
        FULLTEXT KEY ft_jobs_search (title, description, skills_tags),
        CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_jobs_user FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT fk_jobs_category FOREIGN KEY (category_id) REFERENCES job_categories(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS jobs;`);
  },
};
