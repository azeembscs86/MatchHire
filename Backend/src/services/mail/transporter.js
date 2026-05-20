'use strict';

/**
 * Nodemailer transporter (singleton)
 * ----------------------------------
 * One reusable SMTP transporter for the whole process. Lazily created
 * on first use so a missing/invalid SMTP config does not crash the
 * boot path; the first `getTransporter()` call surfaces the error
 * cleanly to the caller, which is centrally handled by the mail
 * service's retry loop.
 *
 * Design choices:
 *   - Connection pooling enabled (`pool: true`) so concurrent sends
 *     reuse TCP/TLS sessions. Gmail throttles aggressively otherwise.
 *   - `verify()` is invoked once on first use and the result is
 *     cached on the transporter for fast reconnects. Successive calls
 *     re-verify only after `VERIFY_AFTER_MS` of inactivity.
 *   - Hot-reset hook (`resetTransporter`) lets ops tests rotate
 *     credentials without restarting the process.
 *
 * Migrating to AWS SES / SendGrid / Resend later:
 *   - Implement the new provider as a different transport (e.g.
 *     `nodemailer-ses-transport` or @aws-sdk/client-sesv2) inside
 *     `createTransporter()` behind a `config.mail.provider` flag.
 *   - The rest of the codebase only talks to `mail.service.sendMail`
 *     so callers don't change.
 */

const nodemailer = require('nodemailer');

const { getMailConfig, validateMailConfig } = require('../../config/mail.config');
const logger = require('../../utils/logger');

let _transporter = null;
let _verifiedAt = 0;
const VERIFY_AFTER_MS = 10 * 60 * 1000; // re-verify after 10m of idle

/**
 * Create a fresh nodemailer transporter from the validated mail config.
 * Throws synchronously if the config is missing required fields so the
 * caller's catch + retry logic gets a clear error.
 */
function createTransporter() {
  const { ok, missing } = validateMailConfig();
  if (!ok) {
    const err = new Error(`Mail config invalid - missing: ${missing.join(', ')}`);
    err.code = 'MAIL_CONFIG_INVALID';
    throw err;
  }
  const cfg = getMailConfig();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
}

/**
 * Return the singleton transporter, creating + verifying it on demand.
 * If verification fails the transporter is reset so the next call gets
 * a fresh attempt instead of cached failure.
 */
async function getTransporter() {
  if (!_transporter) {
    _transporter = createTransporter();
    logger.info('mail.transporter created', {
      host: getMailConfig().host,
      port: getMailConfig().port,
      secure: getMailConfig().secure,
    });
  }
  const now = Date.now();
  if (now - _verifiedAt > VERIFY_AFTER_MS) {
    try {
      await _transporter.verify();
      _verifiedAt = now;
      logger.info('mail.transporter verified');
    } catch (err) {
      logger.error('mail.transporter verify failed', { error: err.message, code: err.code });
      // Reset so subsequent attempts rebuild the transport from scratch.
      resetTransporter();
      throw err;
    }
  }
  return _transporter;
}

/**
 * Drop the cached transporter (next `getTransporter()` rebuilds it).
 * Use after credential rotation or as part of a graceful shutdown.
 */
function resetTransporter() {
  try {
    if (_transporter && typeof _transporter.close === 'function') _transporter.close();
  } catch (err) {
    logger.warn('mail.transporter close error', { error: err.message });
  }
  _transporter = null;
  _verifiedAt = 0;
}

module.exports = {
  getTransporter,
  resetTransporter,
};
