'use strict';

/**
 * MySQL connection layer
 * ----------------------
 * Owns the shared `mysql2/promise` connection pool and exposes a small,
 * intentionally narrow surface:
 *
 *   query(sql, params)       - parameterised SELECT (non-prepared, supports
 *                              LIMIT/OFFSET reliably on MySQL 8)
 *   queryOne(sql, params)    - first row or null
 *   execute(sql, params)     - prepared statement (INSERT/UPDATE/DELETE)
 *   transaction(handler)     - BEGIN/COMMIT/ROLLBACK wrapper
 *   ping() / close()         - health + graceful shutdown
 *
 * All consumers (repositories) pass parameters through `?` placeholders -
 * never concatenate user input into the SQL string.
 */

const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

let pool = null;

function createPool(options = {}) {
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: options.database === null ? undefined : (options.database || config.db.name),
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
    multipleStatements: false,
    dateStrings: false,
    timezone: 'Z',
    decimalNumbers: true,
  });
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function execute(sql, params = []) {
  return getPool().execute(sql, params);
}

async function transaction(handler) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await handler(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* noop */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function ping() {
  try {
    const conn = await getPool().getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (err) {
    logger.error('Database ping failed', { error: err.message });
    return false;
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  createPool,
  query,
  queryOne,
  execute,
  transaction,
  ping,
  close,
};
