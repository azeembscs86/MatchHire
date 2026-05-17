/**
 * VerifyPending
 *
 * Shown right after a successful registration, before email
 * verification. The signup flow navigates here and passes the verify
 * URL (dev only) + email through router state so the user can copy
 * the link if they don't want to dig through their inbox.
 *
 * Includes a "resend verification email" action that hits
 * `/auth/resend-verification-email`. The backend never reveals
 * whether the email exists; we mirror that vagueness in the success
 * copy.
 */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authApi } from '../api/index.js';

export default function VerifyPending() {
  const { state } = useLocation();
  const email = state?.email || null;
  const devUrl = state?.verificationUrl || null;
  const [resendStatus, setResendStatus] = useState(null);
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!email) return;
    setResending(true);
    setResendStatus(null);
    try {
      await authApi.resendVerification(email);
      setResendStatus({ ok: true });
    } catch {
      setResendStatus({ ok: false });
    } finally {
      setResending(false);
    }
  }

  return (
    <section className="view active">
      <div className="container" style={{ maxWidth: 580, padding: '64px 24px 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✉</div>
        <span className="eyebrow" style={{ display: 'block', marginBottom: 16 }}>★ One last step</span>
        <h1 className="display">Verify your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>email</span>.</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          We sent a confirmation link{email ? <> to <strong style={{ color: 'var(--ink)' }}>{email}</strong></> : ''}.
          Click it to activate your account, then come back to sign in.
        </p>

        {devUrl && (
          <div
            style={{
              marginTop: 24, padding: 16, borderRadius: 12,
              background: 'var(--bone)', border: '1px solid #e2e0db',
              fontSize: 13, textAlign: 'left',
            }}
          >
            <strong style={{ color: 'var(--coral)', display: 'block', marginBottom: 6 }}>
              Dev-mode verification URL
            </strong>
            <p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
              The local backend logs the link to the console and surfaces it here so you can click through without an SMTP server.
            </p>
            <a href={devUrl} style={{ wordBreak: 'break-all', color: 'var(--coral)' }}>{devUrl}</a>
          </div>
        )}

        <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!email || resending}
            onClick={handleResend}
          >
            {resending ? 'Resending…' : 'Resend verification email'}
          </button>
          <Link to="/" className="btn btn-coral">Back home</Link>
        </div>

        {resendStatus && (
          <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
            {resendStatus.ok
              ? 'If an unverified account exists for this email, a fresh link is on its way.'
              : 'We could not send the email. Try again in a moment.'}
          </p>
        )}

        <p className="muted" style={{ marginTop: 32, fontSize: 12 }}>
          Wrong inbox? Just sign up again with a different email.
        </p>
      </div>
    </section>
  );
}
