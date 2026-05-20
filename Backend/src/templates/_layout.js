'use strict';

/**
 * Shared HTML email layout
 * ------------------------
 * Tiny string-template engine — intentionally NOT mjml/handlebars. Every
 * email in `src/templates/*.template.js` calls `renderLayout({ ... })` to
 * inherit the same outer shell (preheader, header bar, branded footer,
 * unsubscribe stub) so individual templates only worry about their own
 * body content.
 *
 * Why no templating library?
 *   - We have a small fixed catalogue (OTP, welcome, verification,
 *     password reset, application status). String templates are cheap,
 *     readable, and have zero attack surface.
 *   - Plain text fallback is built in (`buildPlainText`) so multipart
 *     emails always include both parts — improves deliverability and
 *     accessibility.
 *
 * If the catalogue grows past ~15 templates with shared partials, swap
 * the body of `renderLayout()` to mjml or handlebars and keep this
 * module's signature unchanged.
 */

const config = require('../config/env');

/**
 * HTML-escape a string for safe interpolation into the template.
 * Never trust caller-supplied content — always wrap dynamic values with
 * `esc()` before injecting them.
 */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert simple HTML to a readable plain-text fallback for multipart
 * emails. Used by templates that don't want to write a hand-crafted
 * plaintext branch.
 */
function buildPlainText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Render the shared email shell around a body fragment.
 *
 * @param {object} opts
 * @param {string} opts.preheader     - hidden preview text (shown by Gmail/iOS in the inbox list)
 * @param {string} opts.heading       - top-of-card heading
 * @param {string} opts.bodyHtml      - the body fragment for THIS specific template
 * @param {string} [opts.ctaLabel]    - optional primary CTA button text
 * @param {string} [opts.ctaUrl]      - optional primary CTA button href
 * @param {string} [opts.footerNote]  - small print under the signature
 */
function renderLayout({ preheader, heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const appName = esc(config.mail.appName);
  const appUrl = esc(config.mail.appUrl);
  const support = esc(config.mail.supportEmail);
  const year = new Date().getUTCFullYear();

  const cta = ctaLabel && ctaUrl
    ? `
      <tr>
        <td align="center" style="padding: 8px 0 28px 0;">
          <a href="${esc(ctaUrl)}" target="_blank" rel="noopener"
             style="display:inline-block; padding:14px 28px; background:#E85D3C; color:#ffffff;
                    font-family:'Helvetica Neue',Arial,sans-serif; font-size:15px; font-weight:600;
                    text-decoration:none; border-radius:8px;">${esc(ctaLabel)}</a>
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(heading)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 24px 16px !important; }
      .card { padding: 28px 22px !important; }
      .heading { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#F5F0E6; font-family:'Helvetica Neue',Arial,sans-serif; color:#1A1A1A;">
  <!-- preheader (hidden) -->
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
    ${esc(preheader || '')}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F0E6;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:600px; max-width:600px; padding:32px 0;">
          <!-- header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${appUrl}" target="_blank" rel="noopener"
                 style="display:inline-block; font-family:'Helvetica Neue',Arial,sans-serif; font-size:20px;
                        font-weight:700; color:#1A1A1A; text-decoration:none; letter-spacing:-.01em;">
                ${appName}
              </a>
            </td>
          </tr>
          <!-- card -->
          <tr>
            <td class="card" style="background:#ffffff; border-radius:16px; padding:36px 40px;
                                   border:1px solid #EDE7DA; box-shadow:0 2px 8px rgba(26,26,26,0.04);">
              <h1 class="heading" style="margin:0 0 18px 0; font-family:'Helvetica Neue',Arial,sans-serif;
                                          font-size:26px; font-weight:600; color:#1A1A1A; line-height:1.2;">
                ${esc(heading)}
              </h1>
              ${bodyHtml}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${cta}
              </table>
              ${footerNote ? `<p style="margin:18px 0 0 0; font-size:12px; color:#6B6B6B; line-height:1.55;">${esc(footerNote)}</p>` : ''}
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td align="center" style="padding:28px 16px 8px 16px; font-family:'Helvetica Neue',Arial,sans-serif;
                                       font-size:12px; color:#6B6B6B; line-height:1.6;">
              Sent by <strong>${appName}</strong> ·
              <a href="${appUrl}" target="_blank" rel="noopener" style="color:#6B6B6B; text-decoration:underline;">${appUrl}</a><br>
              Questions? Email <a href="mailto:${support}" style="color:#6B6B6B; text-decoration:underline;">${support}</a><br>
              © ${year} ${appName}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  renderLayout,
  buildPlainText,
  esc,
};
