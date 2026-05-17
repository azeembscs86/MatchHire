/**
 * AuthModal
 *
 * Overlay used wherever the user needs to sign in or sign up. Form
 * submission goes through `AuthContext` -> `authApi` -> the MatchHire
 * backend.  On success the modal closes and the rest of the tree
 * re-renders against the authenticated session.
 *
 * Validation messages from the backend (HTTP 422 with `Errors: [...]`)
 * are surfaced inline so the user can fix the offending field.
 *
 * Open/close state remains owned by AuthModalContext so any part of
 * the tree can pop the modal without prop-drilling a callback.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthModal } from '../context/AuthModalContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi } from '../api/index.js';

function FormError({ error }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 10 }}>
      <strong>{error.message}</strong>
      {Array.isArray(error.errors) && error.errors.length > 0 && (
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          {error.errors.map((e, i) => (
            <li key={i}>{e.field ? <code>{e.field}</code> : null} {e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignIn({ onSwitch, onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  const [resending, setResending] = useState(false);

  // Backend returns this exact message when the account is `pending`.
  // Treat it specially so we can offer the user a one-click resend
  // without making them navigate elsewhere.
  const needsVerification = error?.message?.includes('verify your email');

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setResendStatus(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email.trim()) return;
    setResending(true);
    setResendStatus(null);
    try {
      await authApi.resendVerification(email.trim());
      setResendStatus({ ok: true, text: 'If the account exists and is unverified, a fresh link is on its way.' });
    } catch {
      setResendStatus({ ok: false, text: 'Could not resend right now. Try again in a moment.' });
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Welcome back.</h2>
      <p>Sign in to continue your search or hiring.</p>
      <FormError error={error} />
      {needsVerification && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--bone)', fontSize: 13 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={resending}
            onClick={handleResend}
            style={{ padding: '6px 10px', fontSize: 13 }}
          >
            {resending ? 'Resending…' : 'Resend verification email'}
          </button>
          {resendStatus && (
            <div style={{ marginTop: 6, color: resendStatus.ok ? '#0f5132' : '#b3361b' }}>{resendStatus.text}</div>
          )}
        </div>
      )}
      <div className="form-field">
        <label>Email</label>
        <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="form-field">
        <label>Password</label>
        <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      <button className="btn btn-coral" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in →'}
      </button>
      <div className="form-foot">
        New to MatchHire? <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>Create free account</a>
      </div>
    </form>
  );
}

function SignUp({ onClose }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('hunting');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isEmployer = role === 'hiring';

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await register(
        isEmployer ? 'employer' : 'candidate',
        isEmployer
          ? {
              full_name: fullName,
              email: email.trim(),
              password,
              company: { name: companyName || `${fullName}'s Company` },
            }
          : { full_name: fullName, email: email.trim(), password }
      );

      onClose();
      // New accounts always require verification - send the user to
      // the verify-pending screen and pass the dev URL through state.
      if (result?.requiresVerification) {
        navigate('/verify-email', {
          state: { email: email.trim(), verificationUrl: result.verificationUrl },
          replace: false,
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Join MatchHire.</h2>
      <p>Tell us how you'll use the platform.</p>
      <div className="role-select">
        <button
          className={`role-card ${role === 'hiring' ? 'selected' : ''}`}
          onClick={() => setRole('hiring')}
          type="button"
        >
          <span className="ricon">★</span><strong>I'm hiring</strong><span>Post jobs, find candidates</span>
        </button>
        <button
          className={`role-card ${role === 'hunting' ? 'selected' : ''}`}
          onClick={() => setRole('hunting')}
          type="button"
        >
          <span className="ricon">→</span><strong>I'm job hunting</strong><span>Find roles, build profile</span>
        </button>
      </div>
      <FormError error={error} />
      <div className="form-field">
        <label>Full name</label>
        <input required placeholder="Jane Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </div>
      {isEmployer && (
        <div className="form-field">
          <label>Company name</label>
          <input required placeholder="Acme Technologies" value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="organization" />
        </div>
      )}
      <div className="form-field">
        <label>Email · we'll send a verification link</label>
        <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="form-field">
        <label>Password · 8+ characters, letters and numbers</label>
        <input type="password" required minLength={8} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </div>
      <button className="btn btn-coral" type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account →'}
      </button>
      <div className="form-foot">
        By creating an account, you agree to our <a href="#">Terms</a> &amp; <a href="#">Privacy</a>
      </div>
    </form>
  );
}

export default function AuthModal() {
  const { open, mode, closeAuth, switchTab } = useAuthModal();

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closeAuth(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeAuth]);

  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}`}
      onClick={(e) => { if (e.target.id === 'auth-modal') closeAuth(); }}
      id="auth-modal"
    >
      <div className="modal">
        <button className="modal-close" onClick={closeAuth} aria-label="Close">×</button>
        <div className="modal-art">
          <div className="modal-art-content">
            <div className="logo" style={{ marginBottom: 32 }}>
              <div className="logo-mark" style={{ background: 'var(--coral)' }}>M</div>
              <div className="logo-text" style={{ color: 'var(--bone)' }}>
                Match<em style={{ color: 'var(--bone)', fontStyle: 'italic' }}>Hire</em>
              </div>
            </div>
            <h2 className="display">Where careers find their <em style={{ fontStyle: 'italic', color: 'var(--coral)' }}>calling</em>.</h2>
            <p>Join 240,000+ engineers, designers and product folk landing roles they actually love.</p>
          </div>
          <div className="modal-quote">
            "Found my staff role at Linear in 11 days through MatchHire. Fastest, cleanest job hunt I've ever done."
            <span>— Maya R · Staff Engineer</span>
          </div>
        </div>

        <div className="modal-form">
          <div className="modal-tabs">
            <button
              className={`modal-tab${mode === 'signin' ? ' active' : ''}`}
              onClick={() => switchTab('signin')}
              type="button"
            >Sign in</button>
            <button
              className={`modal-tab${mode === 'signup' ? ' active' : ''}`}
              onClick={() => switchTab('signup')}
              type="button"
            >Create account</button>
          </div>

          <div id="auth-content">
            {mode === 'signin'
              ? <SignIn onSwitch={() => switchTab('signup')} onClose={closeAuth} />
              : <SignUp onClose={closeAuth} />}
          </div>
        </div>
      </div>
    </div>
  );
}
