'use strict';

/**
 * 028 — Auth-flow columns on `users`
 * ----------------------------------
 * Adds two small columns the new auth surface needs:
 *
 *   - password_changed_at  DATETIME NULL
 *       Stamped every time the password is updated (reset or change).
 *       Drives stale-session invalidation and the "When did I last
 *       rotate?" widget on the security settings page.
 *
 *   - remember_me_enabled  TINYINT(1) NOT NULL DEFAULT 0
 *       Last "Remember me" preference the user submitted at login.
 *       Used as the default for the next login attempt (frontend
 *       reads it via /auth/me) and as a hint when the backend
 *       decides the refresh-token TTL.
 *
 * `last_login_at` is already on the `users` table from 002, so this
 * migration does not touch it. `refresh_token_hash` is intentionally
 * NOT added — refresh tokens live in the dedicated `refresh_tokens`
 * table so the system can handle multiple devices + rotation +
 * targeted revocation. A single column on `users` would force
 * single-session-only auth, which would be a regression.
 *
 * Idempotent: checks `information_schema.columns` before adding so
 * `npm run migrate` is safe to re-run.
 */

module.exports = {
  name: '028_add_users_auth_columns',

  async up(conn) {
    const [cols] = await conn.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users'`
    );
    const names = new Set(cols.map((r) => String(r.name || r.NAME || r.column_name).toLowerCase()));

    if (!names.has('password_changed_at')) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL AFTER last_login_at`
      );
    }
    if (!names.has('remember_me_enabled')) {
      await conn.query(
        `ALTER TABLE users ADD COLUMN remember_me_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER password_changed_at`
      );
    }
  },

  async down(conn) {
    // Use safeDrop pattern so partial rollbacks don't error if one of
    // the columns was never created.
    const safeDrop = async (sql) => {
      try { await conn.query(sql); } catch (_) { /* column absent — ignore */ }
    };
    await safeDrop(`ALTER TABLE users DROP COLUMN remember_me_enabled`);
    await safeDrop(`ALTER TABLE users DROP COLUMN password_changed_at`);
  },
};
