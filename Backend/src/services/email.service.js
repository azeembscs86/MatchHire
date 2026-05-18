'use strict';

/**
 * Email service
 * -------------
 * Single abstraction every part of the app uses to "send" emails.
 * Today it only logs to stdout and returns the verification URL so
 * dev/demo flows can complete without an SMTP server.
 *
 * To wire a real provider (nodemailer + SMTP, SendGrid, Resend, ...)
 * replace the body of `send()` with the provider call and keep the
 * signature. Every call site already passes the resolved URL/text so
 * nothing else has to change.
 *
 * Templates are intentionally inline strings, not a full templating
 * engine. The set is small (verification, password reset, application
 * status); adding a templating layer (mjml / handlebars) is easy when
 * the catalogue grows.
 */

const logger = require('../utils/logger');
const config = require('../config/env');

const FRONT_END_BASE = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

async function send({ to, subject, text, html }) {
  // PROD HOOK: replace with real provider (nodemailer transport, etc).
  logger.info('email.send (dev console)', { to, subject });
  if (text) logger.info(`  text: ${text.split('\n').slice(0, 2).join(' | ')}`);
  if (!config.isProduction) {
    // Loud log so it's easy to copy the link from the terminal during dev.
    process.stdout.write(`\n=== MAIL ===\nTo:      ${to}\nSubject: ${subject}\n${text || ''}\n=== /MAIL ===\n\n`);
  }
  return { ok: true, deliveredAt: new Date(), html: !!html };
}

/**
 * Verification email - returns the URL so the API can include it in dev.
 *
 * This function is also invoked directly by the email queue's worker.
 * The producer side (auth.service.issueEmailVerification) routes
 * through `emailQueue.add('send-verification', ...)` first, which
 * either pushes to Redis or falls back to this function inline.
 */
async function sendVerificationEmail({ user, token }) {
  const url = `${FRONT_END_BASE}/verify-email/${token}`;
  await send({
    to: user.email,
    subject: 'Verify your MatchHire account',
    text: [
      `Hi ${user.full_name || 'there'},`,
      '',
      'Welcome to MatchHire! Verify your email to activate your account:',
      url,
      '',
      'This link expires in 24 hours.',
      'If you did not create this account, ignore this message.',
      '',
      '— The MatchHire team',
    ].join('\n'),
  });
  return { url };
}

/** Notify a candidate that their application was accepted/rejected by the match engine. */
async function sendApplicationDecision({ user, job, decision, message }) {
  await send({
    to: user.email,
    subject: decision === 'accepted'
      ? `Your application to ${job.company_name || job.title} was received`
      : `Application update: ${job.title}`,
    text: [
      `Hi ${user.full_name || 'there'},`,
      '',
      decision === 'accepted'
        ? `We forwarded your application for "${job.title}" to ${job.company_name || 'the employer'}.`
        : `We weren't able to forward your application for "${job.title}". ${message || ''}`,
      '',
      '— MatchHire',
    ].join('\n'),
  });
}

module.exports = {
  send,
  sendVerificationEmail,
  sendApplicationDecision,
};
