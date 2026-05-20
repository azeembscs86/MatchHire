/**
 * Forgot Password page.
 *
 * Renders an email-only form that calls `POST /auth/forgot-password`.
 * The backend's response is the same regardless of whether the email
 * matches an account (anti-enumeration), so the UI never reveals
 * that either. We just acknowledge submission and tell the user to
 * check their inbox.
 *
 * In non-production the backend echoes the reset URL back on the
 * `Data` block (`reset_url`); we render a small dev-only "Open reset
 * link" affordance when it's present so the SPA flow can be
 * exercised end-to-end without an inbox.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/index.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await authApi.forgotPassword(email.trim());
      setResult(data || {});
    } catch (err) {
      // The endpoint returns 200 even for unknown emails, so this
      // branch is almost only validation (422) or rate-limit (429).
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view active">
      <div className="container" style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px' }}>
        <div style={{
          background: 'var(--paper, #ffffff)', border: '1px solid var(--line, #ede7da)',
          borderRadius: 16, padding: '32px 28px', boxShadow: '0 2px 8px rgba(26,26,26,0.04)',
        }}>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, marginBottom: 8 }}>
            Forgot your password?
          </h1>
          <p style={{ color: 'var(--muted, #6b6b6b)', marginBottom: 22, fontSize: 14, lineHeight: 1.55 }}>
            Enter the email on your account. If it matches, we'll send a
            reset link that's valid for <strong>15 minutes</strong>.
          </p>

          {result ? (
            <>
              <div role="status" style={{
                padding: '14px 14px', borderRadius: 10, background: '#e6f4ea',
                color: '#0f5132', fontSize: 14, lineHeight: 1.55, marginBottom: 18,
              }}>
                If this email exists, password reset instructions have been sent.
                Check your inbox (and spam folder).
              </div>
              {result.reset_url && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, background: '#fff7e6',
                  border: '1px dashed #d6b066', fontSize: 12, lineHeight: 1.5, marginBottom: 18,
                }}>
                  <strong>Dev mode</strong> — backend returned the reset link directly:<br />
                  <a href={result.reset_url} style={{ color: 'var(--coral, #E85D3C)', wordBreak: 'break-all' }}>
                    {result.reset_url}
                  </a>
                </div>
              )}
              <Link to="/" style={{ color: 'var(--coral, #E85D3C)', fontWeight: 500 }}>
                ← Back to home
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div role="alert" style={{
                  padding: '10px 12px', borderRadius: 8, background: '#fde9e3',
                  color: '#b3361b', fontSize: 13, marginBottom: 14,
                }}>
                  {error.message || 'Could not start the reset flow. Try again in a moment.'}
                </div>
              )}
              <div className="form-field">
                <label htmlFor="fp-email">Email</label>
                <input
                  id="fp-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                className="btn btn-coral"
                type="submit"
                disabled={submitting || !email.trim()}
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              >
                {submitting ? 'Sending…' : 'Send reset link →'}
              </button>
              <div style={{ marginTop: 18, fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>
                Remember it after all? <Link to="/" style={{ color: 'var(--coral, #E85D3C)' }}>Back to home</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
