'use strict';

module.exports = {
  name: '013_create_notifications',
  async up(conn) {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        type VARCHAR(80) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message VARCHAR(1000) NULL,
        data JSON NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        read_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_notifications_user_read (user_id, is_read),
        KEY idx_notifications_created (created_at),
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },
  async down(conn) {
    await conn.query(`DROP TABLE IF EXISTS notifications;`);
  },
};
