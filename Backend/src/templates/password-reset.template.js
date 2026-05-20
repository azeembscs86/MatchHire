'use strict';

/**
 * Password reset email template
 * -----------------------------
 * Sent from `auth.service.forgotPassword()` when a user requests a
 * reset. The link points at the SPA's `/reset-password/:token` page,
 * which then POSTs to `/auth/reset-password` after the user picks a
 * new password.
 *
 * Security:
 *   - The token in the URL is the plaintext (caller-owned); the
 *     server only stores its SHA-256 hash.
 *   - The token expires after 15 minutes (per product spec) and is
 *     single-use. Old tokens for the same user are revoked when a
 *     new request comes in.
 */

const config = require('../config/env');
const { renderLayout, buildPlainText, esc } = require('./_layout');

/**
 * @param {object} data
 * @param {string} data.resetUrl          - absolute URL the user clicks to land on the reset page
 * @param {string} [data.name]            - recipient display name
 * @param {number} [data.expiresInMinutes] - integer minutes the link is valid for (default 15)
 * @returns {{ subject: string, html: string, text: string }}
 */
function build(data = {}) {
  const name = esc(data.name || 'there');
  const appName = esc(config.mail.appName);
  const expires = Number.isFinite(Number(data.expiresInMinutes)) ? Number(data.expiresInMinutes) : 15;
  const resetUrl = data.resetUrl || `${config.mail.appUrl}/reset-password`;

  const subject = `Reset your ${config.mail.appName} password`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Someone asked to reset the password on your ${appName} account. Click the
      button below to choose a new one — the link expires in
      <strong>${expires} minute${expires === 1 ? '' : 's'}</strong>.
    </p>
    <p style="margin:0 0 22px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      If you didn't request this, you can safely ignore this email. Your
      password won't change unless you click the link and set a new one.
    </p>
    <p style="margin:18px 0 0 0; font-size:12px; line-height:1.55; color:#6B6B6B; word-break: break-all;">
      Trouble with the button? Paste this URL into your browser:<br>
      <span style="color:#3D3D3D;">${esc(resetUrl)}</span>
    </p>
  `;

  const html = renderLayout({
    preheader: `Reset your ${appName} password. This link expires in ${expires} minutes.`,
    heading: 'Reset your password',
    bodyHtml,
    ctaLabel: 'Choose a new password',
    ctaUrl: resetUrl,
    footerNote: 'For your security, never share this reset link. We will never ask you for it over chat or phone.',
  });

  return { subject, html, text: buildPlainText(html) };
}

module.exports = { build };
