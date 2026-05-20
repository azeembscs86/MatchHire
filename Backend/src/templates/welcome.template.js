'use strict';

/**
 * Welcome email template
 * ----------------------
 * Sent the first time a candidate or employer successfully verifies their
 * account. Builds both HTML + plaintext using the shared shell so every
 * outbound mail has the same branding.
 *
 * Caller passes a small data object; this module is pure (no I/O, no
 * imports beyond the layout helper) so it's trivial to snapshot-test.
 */

const config = require('../config/env');
const { renderLayout, buildPlainText, esc } = require('./_layout');

/**
 * Build the welcome email payload.
 *
 * @param {object} data
 * @param {string} data.name        - recipient display name (used in greeting)
 * @param {string} [data.dashboardUrl] - absolute URL to land them on after login
 * @returns {{ subject: string, html: string, text: string }}
 */
function build(data = {}) {
  const name = esc(data.name || 'there');
  const appName = esc(config.mail.appName);
  const dashboardUrl = data.dashboardUrl || `${config.mail.appUrl}/dashboard/candidate`;

  const subject = `Welcome to ${config.mail.appName} — your account is ready`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Your ${appName} account is now active. We curate roles for people who care
      about craft — no spam, no recruiter noise, just opportunities matched to
      who you actually are.
    </p>
    <p style="margin:0 0 22px 0; font-size:15px; line-height:1.6; color:#3D3D3D;">
      Three things to do next:
    </p>
    <ol style="margin:0 0 22px 18px; padding:0; font-size:15px; line-height:1.7; color:#3D3D3D;">
      <li>Add your skills — that's what powers the match score on every job.</li>
      <li>Set your job preferences (titles, locations, salary band, scope).</li>
      <li>Upload a resume so employers can read the long form when you apply.</li>
    </ol>
  `;

  const html = renderLayout({
    preheader: `Welcome to ${config.mail.appName}. Complete your profile to unlock personalised matches.`,
    heading: `Welcome to ${config.mail.appName}, ${data.name || 'there'} 👋`,
    bodyHtml,
    ctaLabel: 'Complete your profile',
    ctaUrl: dashboardUrl,
    footerNote: 'You\'re receiving this because you just created an account. If that wasn\'t you, reply to this email and we\'ll lock the account immediately.',
  });

  return {
    subject,
    html,
    text: buildPlainText(html),
  };
}

module.exports = { build };
