/**
 * VerifyEmail
 *
 * Lands on `/verify-email/:token` after the user clicks the link
 * from their inbox. Posts the token to `/auth/verify-email`, then
 * shows a clear success / failure state.  On success we surface a
 * "Sign in" CTA that opens the auth modal directly.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { authApi } from '../api/index.js';
import { useAuthModal } from '../context/AuthModalContext.jsx';

export default function VerifyEmail() {
  const { token } = useParams();
  const { openAuth } = useAuthModal();
  const [state, setState] = useState({ loading: true, ok: false, error: null, email: null });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setState({ loading: false, ok: false, error: { message: 'Missing token' } });
        return;
      }
      try {
        const data = await authApi.verifyEmail(token);
        if (cancelled) return;
        setState({ loading: false, ok: true, error: null, email: data?.user?.email || null });
      } catch (err) {
        if (cancelled) return;
        setState({ loading: false, ok: false, error: err });
      }
    }
    run();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <section className="view active">
      <div className="container" style={{ maxWidth: 560, padding: '64px 24px 80px', textAlign: 'center' }}>
        {state.loading && <p className="muted">Verifying your email…</p>}

        {!state.loading && state.ok && (
          <>
            <div style={{ fontSize: 64, marginBottom: 12 }}>✓</div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 16 }}>★ Email verified</span>
            <h1 className="display">You're <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>in</span>.</h1>
            <p className="muted" style={{ marginTop: 14, marginBottom: 24 }}>
              {state.email
                ? `Your account ${state.email} is active.`
                : 'Your account is active.'}{' '}
              Sign in to finish setting up your profile.
            </p>
            <button className="btn btn-coral" type="button" onClick={() => openAuth('signin')}>
              Sign in →
            </button>
            <p style={{ marginTop: 16 }}>
              <Link to="/" className="muted" style={{ fontSize: 13 }}>Back home</Link>
            </p>
          </>
        )}

        {!state.loading && !state.ok && (
          <>
            <div style={{ fontSize: 64, marginBottom: 12, color: 'var(--coral)' }}>!</div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 16 }}>★ Verification failed</span>
            <h1 className="display">This link isn't <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>valid</span>.</h1>
            <p className="muted" style={{ marginTop: 14, marginBottom: 24 }}>
              {state.error?.message || 'The link may have expired or already been used.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-coral" type="button" onClick={() => openAuth('signup')}>Create a new account</button>
              <Link to="/" className="btn btn-ghost">Back home</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
