'use strict';

/**
 * Mail service (public surface)
 * -----------------------------
 * Single facade for every part of the app that needs to send an email.
 * Callers use:
 *
 *   await mail.sendMail({ to, subject, html, text })
 *   await mail.sendWelcomeEmail(to, { name, dashboardUrl })
 *   await mail.sendOTPEmail(to, { code, name, purpose, expiresInMinutes })
 *
 * Responsibilities:
 *   - Build the final nodemailer payload (from address, headers, multipart)
 *   - Retry transient SMTP failures with exponential backoff
 *   - Surface a uniform `{ ok, messageId, attempts, error? }` result
 *   - Provide a `dispatch()` seam so a Redis/BullMQ queue can be slotted in
 *     later without changing any caller (see "Future scalability" below).
 *
 * Future scalability — add BullMQ without changing callers:
 *   1. `npm i bullmq ioredis` (ioredis is already used elsewhere).
 *   2. Create `src/queues/mail.queue.js` with `add(payload)` producing
 *      a `mail:send` job and a worker that calls `_executeSend(payload)`.
 *   3. Flip the `MAIL_QUEUE_ENABLED=true` env flag. The `dispatch()`
 *      below routes through the queue when enabled and falls back to
 *      inline send when Redis is down. No call site changes.
 *
 * Failure isolation:
 *   - Templated calls (welcome, OTP) NEVER throw — they return
 *     `{ ok: false, error }` so signup / auth flows continue even if
 *     SMTP is misconfigured. The error is logged with full context.
 *   - The generic `sendMail()` rethrows after exhausting retries so
 *     calling code can decide how to react (e.g. test endpoints).
 */

const { getTransporter } = require('./transporter');
const { getMailConfig } = require('../../config/mail.config');
const config = require('../../config/env');
const logger = require('../../utils/logger');

const welcomeTemplate = require('../../templates/welcome.template');
const otpTemplate = require('../../templates/otp.template');
const passwordResetTemplate = require('../../templates/password-reset.template');
const passwordChangedTemplate = require('../../templates/password-changed.template');

/* ============================================================================
 * Helpers
 * ========================================================================== */

/** Sleep for `ms` milliseconds. */
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/**
 * Classify SMTP errors as retryable (transient) vs fatal so we don't
 * burn retries on 5xx-style "rejected recipient" responses.
 */
function isRetryable(err) {
  if (!err) return false;
  const code = err.code || '';
  const responseCode = err.responseCode || 0;
  // Transient: connection, timeout, greylisting, 4xx SMTP responses.
  if (['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'EAI_AGAIN', 'EDNS'].includes(code)) return true;
  if (responseCode >= 400 && responseCode < 500) return true;
  return false;
}

/**
 * Mask an email address for log lines so PII doesn't end up in stdout.
 * "alice@example.com" -> "a***e@example.com"
 */
function maskEmail(addr) {
  if (!addr) return '';
  const s = String(addr);
  const at = s.indexOf('@');
  if (at < 2) return s.replace(/^./, '*');
  const name = s.slice(0, at);
  const domain = s.slice(at);
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}${domain}`;
}

/* ============================================================================
 * Core send (with retry)
 * ========================================================================== */

/**
 * Actually push the message through nodemailer. Separated from the
 * retry loop so a future BullMQ worker can call this directly.
 */
async function _executeSend(payload) {
  const transporter = await getTransporter();
  const cfg = getMailConfig();
  const info = await transporter.sendMail({
    from: payload.from || cfg.from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    replyTo: payload.replyTo,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    attachments: payload.attachments,
    headers: {
      'X-Mailer': `${cfg.appName} Mailer`,
      ...(payload.headers || {}),
    },
  });
  return info;
}

/**
 * Queue dispatch seam. Today it executes inline; when BullMQ is wired
 * in, this is the one place that routes through the queue. Returns the
 * same `info` object so callers see no behavioural change.
 */
async function dispatch(payload) {
  // Future: if (process.env.MAIL_QUEUE_ENABLED === 'true') return mailQueue.add(payload);
  return _executeSend(payload);
}

/**
 * Send an email with retry + exponential backoff on transient failures.
 *
 * @param {object} payload                  - nodemailer-shaped payload
 * @param {string|string[]} payload.to      - recipient(s)
 * @param {string} payload.subject
 * @param {string} [payload.html]
 * @param {string} [payload.text]
 * @returns {Promise<{ok: true, messageId: string, attempts: number, accepted: string[], rejected: string[]}>}
 * @throws when all retries are exhausted (the LAST error is rethrown).
 */
async function sendMail(payload) {
  const cfg = getMailConfig();
  const maxRetries = Math.max(1, Number(cfg.maxRetries) || 3);
  const baseMs = Math.max(100, Number(cfg.retryBaseMs) || 1000);

  if (!payload || !payload.to) throw new Error('sendMail: `to` is required');
  if (!payload.subject) throw new Error('sendMail: `subject` is required');
  if (!payload.html && !payload.text) throw new Error('sendMail: provide `html` or `text`');

  const recipientForLog = Array.isArray(payload.to) ? payload.to.map(maskEmail).join(',') : maskEmail(payload.to);
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();
    try {
      logger.info('mail.send attempt', { to: recipientForLog, subject: payload.subject, attempt, maxRetries });
      const info = await dispatch(payload);
      const tookMs = Date.now() - startedAt;
      logger.info('mail.send ok', {
        to: recipientForLog,
        subject: payload.subject,
        attempt,
        tookMs,
        messageId: info.messageId,
        accepted: info.accepted?.length || 0,
        rejected: info.rejected?.length || 0,
      });
      return {
        ok: true,
        messageId: info.messageId,
        attempts: attempt,
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        envelope: info.envelope || null,
      };
    } catch (err) {
      lastErr = err;
      const tookMs = Date.now() - startedAt;
      const retry = attempt < maxRetries && isRetryable(err);
      logger.error('mail.send failed', {
        to: recipientForLog,
        subject: payload.subject,
        attempt,
        tookMs,
        code: err.code,
        responseCode: err.responseCode,
        message: err.message,
        willRetry: retry,
      });
      if (!retry) break;
      // Exponential backoff: 1s, 2s, 4s, ...
      await delay(baseMs * Math.pow(2, attempt - 1));
    }
  }
  // Exhausted retries — surface the last error to the caller.
  const wrapped = new Error(`Mail send failed after retries: ${lastErr?.message || 'unknown error'}`);
  wrapped.cause = lastErr;
  wrapped.code = lastErr?.code || 'MAIL_SEND_FAILED';
  throw wrapped;
}

/* ============================================================================
 * Templated wrappers — never throw, always return a status object
 * ========================================================================== */

/**
 * Send the OTP email. Wraps `sendMail` with the OTP template and
 * absorbs any failure so the calling auth flow can persist the code
 * and proceed (the user can request a resend if delivery fails).
 *
 * @param {string} to                    - recipient
 * @param {object} data
 * @param {string} data.code             - the OTP (caller-generated)
 * @param {string} [data.name]           - recipient display name
 * @param {string} [data.purpose]        - "verify your email" | "sign in" | "reset your password"
 * @param {number} [data.expiresInMinutes]
 */
async function sendOTPEmail(to, data) {
  try {
    const built = otpTemplate.build(data);
    return await sendMail({ to, ...built });
  } catch (err) {
    logger.error('mail.sendOTPEmail failed', { to: maskEmail(to), error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Send the Welcome email. Same fail-soft contract as sendOTPEmail.
 *
 * @param {string} to
 * @param {object} data
 * @param {string} [data.name]
 * @param {string} [data.dashboardUrl]
 */
async function sendWelcomeEmail(to, data) {
  try {
    const built = welcomeTemplate.build(data);
    return await sendMail({ to, ...built });
  } catch (err) {
    logger.error('mail.sendWelcomeEmail failed', { to: maskEmail(to), error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Send the password-reset email (link to /reset-password/:token).
 * Fail-soft: never throws so the forgot-password endpoint can return
 * its generic success envelope even if SMTP is briefly down.
 *
 * @param {string} to
 * @param {object} data
 * @param {string} data.resetUrl
 * @param {string} [data.name]
 * @param {number} [data.expiresInMinutes]
 */
async function sendPasswordResetEmail(to, data) {
  try {
    const built = passwordResetTemplate.build(data);
    return await sendMail({ to, ...built });
  } catch (err) {
    logger.error('mail.sendPasswordResetEmail failed', { to: maskEmail(to), error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Send the "your password was changed" confirmation email after a
 * successful reset or change. Acts as an out-of-band trip-wire for
 * the legitimate account owner.
 *
 * @param {string} to
 * @param {object} data
 * @param {string} [data.name]
 * @param {string} [data.ip]
 * @param {string} [data.when]
 */
async function sendPasswordChangedEmail(to, data) {
  try {
    const built = passwordChangedTemplate.build(data);
    return await sendMail({ to, ...built });
  } catch (err) {
    logger.error('mail.sendPasswordChangedEmail failed', { to: maskEmail(to), error: err.message });
    return { ok: false, error: err.message };
  }
}

/* ============================================================================
 * Diagnostics — used by the test endpoint
 * ========================================================================== */

/**
 * Verify the transporter without sending a message. Returns
 * `{ ok: true }` on success, `{ ok: false, error }` on failure.
 * Safe to expose to admins (no PII in the response).
 */
async function verifyConnection() {
  try {
    const t = await getTransporter();
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
}

module.exports = {
  sendMail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  verifyConnection,
  // Exposed for tests + future queue worker. Don't call from app code.
  _executeSend,
  dispatch,
};
