'use strict';

module.exports = {
  name: '008_create_candidate_skills',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS candidate_skills (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        candidate_user_id BIGINT UNSIGNED NOT NULL,
        skill_id INT UNSIGNED NOT NULL,
        proficiency ENUM('beginner','intermediate','advanced','expert') NOT NULL DEFAULT 'intermediate',
        years_experience DECIMAL(4,1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_candidate_skill (candidate_user_id, skill_id),
        KEY idx_candidate_skills_skill (skill_id),
        CONSTRAINT fk_candidate_skills_user FOREIGN KEY (candidate_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_candidate_skills_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS candidate_skills;`);
  },
};
