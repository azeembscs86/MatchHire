'use strict';

/**
 * Environment loader
 * ------------------
 * Loads `.env.${NODE_ENV}` first, then `.env`. Variables already exported in
 * the parent process always win. Exposes a single typed `config` object so
 * the rest of the app never touches `process.env` directly.
 *
 * The `required(name, fallback)` helper logs a warning rather than throwing
 * to keep local-dev frictionless; production deployments are expected to
 * always provide JWT_SECRET / DB_PASSWORD / etc.
 */

const path = require('node:path');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'local';
const envFile = `.env.${NODE_ENV}`;

dotenv.config({ path: path.resolve(process.cwd(), envFile) });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    console.warn(`[env] Missing required env var: ${name}`);
    return '';
  }
  return v;
}

function num(name, fallback) {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: num('PORT', 3500),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  db: {
    host: required('DB_HOST', 'localhost'),
    port: num('DB_PORT', 3306),
    name: required('DB_NAME', 'matchhire'),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD || '',
    connectionLimit: num('DB_CONNECTION_LIMIT', 10),
  },

  jwt: {
    secret: required('JWT_SECRET', 'dev-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  redis: {
    host: required('REDIS_HOST', 'localhost'),
    port: num('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: num('REDIS_DB', 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'matchhire:',
  },

  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: num('RATE_LIMIT_MAX', 300),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
