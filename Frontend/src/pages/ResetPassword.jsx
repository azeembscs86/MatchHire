/**
 * Reset Password page.
 *
 * Mounted at `/reset-password/:token`. On mount it calls
 * `POST /auth/verify-reset-token` to confirm the token is still
 * valid (does NOT consume it). If valid we render the new-password
 * form; if not we show a clear failure message with a link to start
 * a fresh forgot-password flow.
 *
 * After a successful reset:
 *   - the backend revokes all refresh tokens for the user, so the
 *     SPA also clears local tokens defensively (the user has to
 *     sign in again afterwards — that's intentional).
 *   - we redirect to the home page with a one-time success banner
 *     by stashing it in router state.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authApi, tokens } from '../api/index.js';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenReason, setTokenReason] = useState(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Verify the token before showing the form so an expired link
  // surfaces immediately instead of after the user types a password.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!token) { setChecking(false); setTokenValid(false); setTokenReason('missing'); return; }
      try {
        await authApi.verifyResetToken(token);
        if (cancelled) return;
        setTokenValid(true);
      } catch (err) {
        if (cancelled) return;
        // The backend includes `reason` on Data so we can be specific.
        const reason = err.original?.response?.data?.Data?.reason || 'invalid';
        setTokenValid(false);
        setTokenReason(reason);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [token]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const weak = password.length > 0 && (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password));
  const canSubmit = !!password && !mismatch && !weak && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      // Defensive: the backend revoked refresh tokens, so we wipe
      // any local tokens too to force a fresh sign-in.
      tokens.clear();
      navigate('/', {
        replace: true,
        state: { authNotice: 'Password reset. Sign in with your new password.' },
      });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <Shell heading="Reset password">
        <p style={{ color: 'var(--muted, #6b6b6b)' }}>Verifying link…</p>
      </Shell>
    );
  }

  if (!tokenValid) {
    const message = tokenReason === 'expired'
      ? 'This reset link has expired. Request a fresh one and try again.'
      : tokenReason === 'used'
        ? 'This reset link has already been used. Request a new one if you still need to reset your password.'
        : 'This reset link is invalid. Double-check the URL or request a new one.';
    return (
      <Shell heading="Link not usable">
        <div role="alert" style={{
          padding: '12px 14px', borderRadius: 10, background: '#fde9e3',
          color: '#b3361b', fontSize: 14, marginBottom: 18, lineHeight: 1.5,
        }}>{message}</div>
        <Link to="/forgot-password" className="btn btn-coral" style={{ display: 'inline-block' }}>
          Request a new reset link →
        </Link>
      </Shell>
    );
  }

  return (
    <Shell heading="Choose a new password">
      <p style={{ color: 'var(--muted, #6b6b6b)', marginBottom: 18, fontSize: 14, lineHeight: 1.55 }}>
        Pick something you don't use elsewhere. 8+ characters, must include
        letters and at least one number.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 8, background: '#fde9e3',
            color: '#b3361b', fontSize: 13, marginBottom: 14,
          }}>{error.message}</div>
        )}
        <div className="form-field">
          <label htmlFor="rp-password">New password</label>
          <PasswordInput
            id="rp-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            ariaLabel="New password"
          />
          {weak && (
            <small style={{ color: '#b3361b', fontSize: 12 }}>
              Must be at least 8 characters and include both letters and numbers.
            </small>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="rp-confirm">Confirm new password</label>
          <PasswordInput
            id="rp-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            ariaLabel="Confirm new password"
          />
          {mismatch && (
            <small style={{ color: '#b3361b', fontSize: 12 }}>
              Passwords don't match.
            </small>
          )}
        </div>
        <button
          className="btn btn-coral"
          type="submit"
          disabled={!canSubmit}
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        >
          {submitting ? 'Updating…' : 'Update password →'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ heading, children }) {
  return (
    <section className="view active">
      <div className="container" style={{ maxWidth: 480, margin: '64px auto', padding: '0 16px' }}>
        <div style={{
          background: 'var(--paper, #ffffff)', border: '1px solid var(--line, #ede7da)',
          borderRadius: 16, padding: '32px 28px', boxShadow: '0 2px 8px rgba(26,26,26,0.04)',
        }}>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, marginBottom: 12 }}>{heading}</h1>
          {children}
        </div>
      </div>
    </section>
  );
}
