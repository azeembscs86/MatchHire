'use strict';

/**
 * OTP email template
 * ------------------
 * Single-use verification / login code. The OTP is rendered as a large,
 * mono-spaced block so users can read it at a glance on phones and copy
 * it without dragging through unrelated text.
 *
 * Security notes:
 *   - The TEMPLATE does not generate the code — the caller does and passes
 *     it in. This keeps OTP generation in the auth service where storage,
 *     hashing, and expiry are owned.
 *   - The expiry duration is displayed verbatim in the body so the user
 *     knows how long they have before it stops working.
 */

const config = require('../config/env');
const { renderLayout, buildPlainText, esc } = require('./_layout');

/**
 * Build the OTP email payload.
 *
 * @param {object} data
 * @param {string} data.code         - one-time code (e.g. "284 913")
 * @param {string} [data.name]       - optional recipient name for greeting
 * @param {string} [data.purpose]    - "verify your email" | "sign in" | "reset your password"
 * @param {number} [data.expiresInMinutes] - integer minutes the code is valid for (default 10)
 * @returns {{ subject: string, html: string, text: string }}
 */
function build(data = {}) {
  const code = esc(data.code || '------');
  const name = esc(data.name || 'there');
  const purpose = esc(data.purpose || 'verify your email');
  const expires = Number.isFinite(Number(data.expiresInMinutes)) ? Number(data.expiresInMinutes) : 10;
  const appName = esc(config.mail.appName);

  const subject = `Your ${appName} verification code: ${data.code}`;

  const bodyHtml = `
    <p style="margin:0 0 14px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Hi ${name},
    </p>
    <p style="margin:0 0 22px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Use the code below to ${purpose} on ${appName}. It expires in
      <strong>${expires} minute${expires === 1 ? '' : 's'}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:6px 0 24px 0;">
      <tr>
        <td align="center" style="background:#F5F0E6; border:1px solid #EDE7DA; border-radius:12px;
                                   padding:22px 16px;">
          <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
                      font-size:34px; font-weight:700; letter-spacing:.18em; color:#1A1A1A;">
            ${code}
          </div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 12px 0; font-size:13px; line-height:1.6; color:#6B6B6B;">
      For your security, never share this code with anyone — ${appName} staff will
      never ask for it.
    </p>
  `;

  const html = renderLayout({
    preheader: `Your ${appName} code is ${data.code}. It expires in ${expires} minutes.`,
    heading: `Your verification code`,
    bodyHtml,
    footerNote: `If you didn't request this code, you can safely ignore this email — the code will expire on its own and your account remains secure.`,
  });

  return {
    subject,
    html,
    text: buildPlainText(html),
  };
}

module.exports = { build };
