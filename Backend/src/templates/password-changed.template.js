'use strict';

/**
 * Password-changed confirmation email
 * -----------------------------------
 * Sent automatically after a successful password reset or password
 * change. Acts as an out-of-band trip-wire: if the legitimate owner
 * didn't trigger the change, they see this notification immediately
 * and can lock the account through support.
 *
 * No links / CTAs — by design. A clickable "It wasn't me" button in
 * this email is a classic phishing vector. We instead point at the
 * support email so the user can reach a human.
 */

const config = require('../config/env');
const { renderLayout, buildPlainText, esc } = require('./_layout');

/**
 * @param {object} data
 * @param {string} [data.name]   - recipient display name
 * @param {string} [data.ip]     - request IP (optional, for audit detail)
 * @param {string} [data.when]   - human-readable timestamp (defaults to "just now")
 * @returns {{ subject: string, html: string, text: string }}
 */
function build(data = {}) {
  const name = esc(data.name || 'there');
  const appName = esc(config.mail.appName);
  const support = esc(config.mail.supportEmail);
  const when = esc(data.when || 'just now');
  const ip = data.ip ? esc(data.ip) : null;

  const subject = `Your ${config.mail.appName} password was changed`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      The password on your ${appName} account was changed <strong>${when}</strong>${ip ? ` from <strong>${ip}</strong>` : ''}.
      All of your active sessions on other devices have been signed out
      as a precaution.
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      If this was you, no further action is needed.
    </p>
    <p style="margin:0 0 6px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      <strong>If it wasn't you</strong>, contact us immediately at
      <a href="mailto:${support}" style="color:#E85D3C; text-decoration:underline;">${support}</a>
      so we can secure the account.
    </p>
  `;

  const html = renderLayout({
    preheader: `Your ${appName} password was changed ${data.when || 'just now'}.`,
    heading: 'Password changed',
    bodyHtml,
    footerNote: `We send this notice whenever your password changes so you have an audit trail. Reply to this email if anything looks off.`,
  });

  return { subject, html, text: buildPlainText(html) };
}

module.exports = { build };
