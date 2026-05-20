'use strict';

/**
 * Mail config + startup validation
 * --------------------------------
 * Surfaces the validated SMTP configuration the mail service consumes and
 * exposes `assertMailConfig()` for the process entrypoint to call once on
 * boot. Validation is intentionally non-fatal in non-production so local
 * development without SMTP creds still boots — the mail service then
 * surfaces a clear error per send attempt instead of crashing the API.
 *
 * Required env (production):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 *
 * Optional:
 *   SMTP_SECURE          true|false (default false → STARTTLS on 587)
 *   MAIL_MAX_RETRIES     3
 *   MAIL_RETRY_BASE_MS   1000
 *   MAIL_APP_NAME        used in default email subjects + branding
 *   MAIL_APP_URL         absolute base for links in templates
 *   MAIL_SUPPORT_EMAIL   support address shown in footers
 *
 * Gmail-specific notes:
 *   - Use App Passwords (https://myaccount.google.com/apppasswords).
 *     Regular Gmail account passwords are rejected since May 2022.
 *   - Port 587 + SMTP_SECURE=false → STARTTLS (recommended).
 *     Port 465 + SMTP_SECURE=true  → implicit TLS (also supported).
 *   - Gmail's free SMTP limit is ~500 messages / 24h for personal
 *     accounts; migrate to SES/SendGrid before you hit that ceiling.
 */

const config = require('./env');
const logger = require('../utils/logger');

const REQUIRED_KEYS = Object.freeze(['host', 'port', 'user', 'pass', 'from']);

/**
 * Returns the typed mail config block. Read-only — never mutate.
 */
function getMailConfig() {
  return config.mail;
}

/**
 * Returns `{ ok: boolean, missing: string[], warnings: string[] }` describing
 * the health of the SMTP config. Does NOT throw — callers decide how strict
 * they want to be (server.js logs + exits in prod; tests just inspect).
 */
function validateMailConfig() {
  const mail = config.mail || {};
  const missing = [];
  for (const key of REQUIRED_KEYS) {
    const raw = mail[key];
    if (raw === undefined || raw === null || raw === '') missing.push(key);
  }

  const warnings = [];
  if (mail.host === 'smtp.gmail.com' && mail.pass && mail.pass.replace(/\s+/g, '').length !== 16) {
    warnings.push('SMTP_PASS does not look like a Gmail App Password (expected 16 chars without spaces). Gmail will reject account passwords.');
  }
  if (mail.port === 465 && !mail.secure) {
    warnings.push('SMTP_PORT=465 expects SMTP_SECURE=true (implicit TLS).');
  }
  if (mail.port === 587 && mail.secure) {
    warnings.push('SMTP_PORT=587 expects SMTP_SECURE=false (STARTTLS).');
  }
  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Boot-time assertion. In production, missing required vars cause a hard
 * exit (process.exit(1)) — the API has no business booting if it claims
 * to send transactional email and can't. In other envs we log loudly and
 * keep going so local dev without SMTP still works.
 */
function assertMailConfig() {
  const { ok, missing, warnings } = validateMailConfig();
  if (!ok) {
    const msg = `Mail config invalid — missing required env vars: ${missing.map((k) => mapKeyToEnv(k)).join(', ')}`;
    if (config.isProduction) {
      logger.error(msg);
      process.exit(1);
    }
    logger.warn(`${msg} (continuing in ${config.nodeEnv}; send attempts will fail until configured)`);
  } else {
    logger.info('Mail config OK', {
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      from: config.mail.from,
    });
  }
  for (const w of warnings) logger.warn(`mail.config: ${w}`);
  return ok;
}

function mapKeyToEnv(k) {
  switch (k) {
    case 'host': return 'SMTP_HOST';
    case 'port': return 'SMTP_PORT';
    case 'user': return 'SMTP_USER';
    case 'pass': return 'SMTP_PASS';
    case 'from': return 'MAIL_FROM';
    default: return k.toUpperCase();
  }
}

module.exports = {
  getMailConfig,
  validateMailConfig,
  assertMailConfig,
};
