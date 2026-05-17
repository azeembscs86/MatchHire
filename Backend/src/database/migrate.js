'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: false,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    logger.info(`Database ensured: ${config.db.name}`);
  } finally {
    await conn.end();
  }
}

async function getConnection() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    multipleStatements: false,
  });
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(190) NOT NULL,
      batch INT UNSIGNED NOT NULL,
      ran_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migrations_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

function loadMigrations() {
  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => {
      const mod = require(path.join(dir, f));
      return { file: f, ...mod };
    });
}

async function runUp() {
  await ensureDatabase();
  const conn = await getConnection();
  try {
    await ensureMigrationsTable(conn);
    const [rows] = await conn.query('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r) => r.name));
    const migrations = loadMigrations();

    const [batchRow] = await conn.query('SELECT COALESCE(MAX(batch), 0) AS b FROM _migrations');
    const nextBatch = (batchRow[0]?.b || 0) + 1;

    let count = 0;
    for (const m of migrations) {
      if (applied.has(m.name)) {
        logger.info(`SKIP  ${m.name} (already applied)`);
        continue;
      }
      logger.info(`UP    ${m.name}`);
      await m.up(conn);
      await conn.execute('INSERT INTO _migrations (name, batch) VALUES (?, ?)', [m.name, nextBatch]);
      count += 1;
    }
    logger.info(`Migrations finished. Applied ${count} new migrations.`);
  } finally {
    await conn.end();
  }
}

async function runDown() {
  const conn = await getConnection();
  try {
    await ensureMigrationsTable(conn);
    const [batchRow] = await conn.query('SELECT MAX(batch) AS b FROM _migrations');
    const lastBatch = batchRow[0]?.b;
    if (!lastBatch) {
      logger.info('No migrations to rollback.');
      return;
    }
    const [rows] = await conn.query('SELECT name FROM _migrations WHERE batch = ? ORDER BY id DESC', [lastBatch]);
    const migrations = loadMigrations();
    const byName = new Map(migrations.map((m) => [m.name, m]));
    for (const r of rows) {
      const m = byName.get(r.name);
      if (!m) {
        logger.warn(`Migration file missing for ${r.name}, skipping rollback.`);
        continue;
      }
      logger.info(`DOWN  ${m.name}`);
      try { await m.down(conn); } catch (err) { logger.error(`DOWN failed for ${m.name}: ${err.message}`); throw err; }
      await conn.execute('DELETE FROM _migrations WHERE name = ?', [m.name]);
    }
    logger.info(`Rolled back batch ${lastBatch} (${rows.length} migrations).`);
  } finally {
    await conn.end();
  }
}

async function main() {
  const cmd = (process.argv[2] || 'up').toLowerCase();
  try {
    if (cmd === 'up') {
      await runUp();
    } else if (cmd === 'rollback' || cmd === 'down') {
      await runDown();
    } else {
      console.error(`Unknown command: ${cmd}. Use "up" or "rollback".`);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    logger.error('Migration failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runUp, runDown };
