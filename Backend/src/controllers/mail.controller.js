'use strict';

/**
 * Mail controller
 * ---------------
 * Thin HTTP boundary for the `/api/v1/mail/*` test endpoints. All
 * business logic (transporter, retries, templates) lives in
 * `services/mail/mail.service.js`; this file only translates HTTP
 * requests into service calls and re-shapes failures into the
 * standard MatchHire envelope.
 *
 * Failure contract for the test endpoint matches the spec verbatim:
 *
 *   { Response: { responseCode: 0, status: "Failed", message: "Unable to Send Email" } }
 *
 * (Other failure paths — e.g. Joi 422s — keep their canonical
 * envelopes from `response.helper`.)
 */

const mail = require('../services/mail/mail.service');
const response = require('../utils/response.helper');
const logger = require('../utils/logger');

/**
 * Build the spec-compliant "Email Sent Successfully" envelope.
 * `data` is omitted by the spec, so we return an empty object.
 */
function sentOk(res, info, message = 'Email Sent Successfully') {
  return res.status(200).json({
    Response: { responseCode: 1, status: 'Success', message },
    Data: {
      messageId: info?.messageId || null,
      attempts: info?.attempts || 1,
      accepted: info?.accepted || [],
      rejected: info?.rejected || [],
    },
  });
}

/**
 * Build the spec-compliant "Unable to Send Email" envelope.
 * Logs the full error server-side; the response stays generic so we
 * don't leak SMTP details to API callers.
 */
function sentFailed(res, err, message = 'Unable to Send Email') {
  logger.error('mail.controller send failed', {
    code: err?.code,
    message: err?.message,
    cause: err?.cause?.message,
  });
  return res.status(502).json({
    Response: { responseCode: 0, status: 'Failed', message },
    Data: null,
  });
}

/**
 * POST /api/v1/mail/send-test
 *
 * Body: `{ email, template?, name?, code?, purpose?, expiresInMinutes? }`
 *
 * The `template` selector is optional (defaults to plain). QA can pass
 * `template: 'otp'` or `template: 'welcome'` to send the real template
 * instead of the plain smoke message — handy for previewing.
 */
exports.sendTest = async (req, res) => {
  const { email, template, name, code, purpose, expiresInMinutes } = req.body;
  try {
    let info;
    if (template === 'otp') {
      const data = {
        code: code || String(Math.floor(100000 + Math.random() * 900000)),
        name: name || undefined,
        purpose: purpose || 'verify your email',
        expiresInMinutes: expiresInMinutes || 10,
      };
      info = await mail.sendOTPEmail(email, data);
    } else if (template === 'welcome') {
      info = await mail.sendWelcomeEmail(email, { name: name || undefined });
    } else {
      info = await mail.sendMail({
        to: email,
        subject: 'MatchHire SMTP smoke test',
        text: 'Hi there — this is a delivery smoke test from the MatchHire mail service. If you can read this, SMTP is wired correctly.',
        html: '<p>Hi there — this is a delivery smoke test from the <strong>MatchHire</strong> mail service. If you can read this, SMTP is wired correctly.</p>',
      });
    }
    if (info && info.ok === false) return sentFailed(res, new Error(info.error));
    return sentOk(res, info);
  } catch (err) {
    return sentFailed(res, err);
  }
};

/**
 * POST /api/v1/mail/send-otp
 *
 * Production-style OTP send. `code` MUST come from the caller — this
 * endpoint never generates one (so OTP storage / hashing / expiry
 * stay owned by the auth service).
 */
exports.sendOtp = async (req, res) => {
  const { email, code, name, purpose, expiresInMinutes } = req.body;
  const info = await mail.sendOTPEmail(email, { code, name, purpose, expiresInMinutes });
  if (info && info.ok === false) return sentFailed(res, new Error(info.error));
  return sentOk(res, info, 'OTP email queued for delivery');
};

/**
 * POST /api/v1/mail/send-welcome
 */
exports.sendWelcome = async (req, res) => {
  const { email, name, dashboardUrl } = req.body;
  const info = await mail.sendWelcomeEmail(email, { name, dashboardUrl });
  if (info && info.ok === false) return sentFailed(res, new Error(info.error));
  return sentOk(res, info, 'Welcome email queued for delivery');
};

/**
 * GET /api/v1/mail/verify
 *
 * Diagnostic endpoint — verifies the SMTP transporter without sending
 * a real message. Returns the standard success envelope on a healthy
 * connection.
 */
exports.verify = async (_req, res) => {
  const result = await mail.verifyConnection();
  if (!result.ok) return response.error(res, 'SMTP connection failed', 503, { code: result.code, error: result.error });
  return response.success(res, { smtp: 'ok' }, 'SMTP connection verified');
};
