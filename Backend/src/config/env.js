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

  // Public, absolute origin of THIS API as the browser sees it. Used to
  // build absolute URLs (profile images, signed download links) that
  // need to work when the SPA is served from a different origin
  // (Vite at :5173 in dev, CDN host in prod) than the API.
  //
  //   dev      : defaults to http://localhost:${port}
  //   staging  : API_PUBLIC_URL=https://staging-api.matchhire.example.com
  //   prod     : API_PUBLIC_URL=https://api.matchhire.example.com
  apiPublicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${num('PORT', 3500)}`).replace(/\/$/, ''),

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

  // AI recommendation provider. Defaults to the local rule-based generator;
  // set AI_PROVIDER=openai + AI_API_KEY=... to enable a remote provider once
  // implemented in `services/ai.service.js`.
  ai: {
    provider: (process.env.AI_PROVIDER || 'rule_based').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
  },

  // Gmail SMTP (nodemailer). Use a Gmail **App Password** (16 chars, no symbols)
  // generated at https://myaccount.google.com/apppasswords after enabling
  // 2-Step Verification. Plain Gmail account passwords will be rejected by
  // smtp.gmail.com. See `services/mail/transporter.js`.
  mail: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: num('SMTP_PORT', 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    // Operational tuning (each has a safe default).
    maxRetries: num('MAIL_MAX_RETRIES', 3),
    retryBaseMs: num('MAIL_RETRY_BASE_MS', 1000),
    appName: process.env.MAIL_APP_NAME || 'MatchHire',
    appUrl: process.env.MAIL_APP_URL || 'https://matchhire.com',
    supportEmail: process.env.MAIL_SUPPORT_EMAIL || 'support@matchhire.com',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
