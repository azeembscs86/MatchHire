/**
 * AuthModal
 *
 * Overlay used by every entry point that needs the user to be signed
 * in or signed up. Open/close state is driven by AuthModalContext, so
 * any component anywhere in the tree can pop the modal without
 * threading callbacks through.
 *
 * The modal closes on Escape and on overlay click; the inner card
 * stops propagation so clicks inside don't dismiss it.
 *
 * Form submission is stubbed — calls `alert(...)` and closes. Hook
 * this up to your real auth backend (OAuth, email magic link, etc.)
 * by replacing `handleSubmit` and persisting the session somewhere
 * sensible (likely an AuthContext alongside this one).
 */
import { useEffect, useState } from 'react';
import { useAuthModal } from '../context/AuthModalContext.jsx';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
  </svg>
);

function SignIn({ onSwitch, onSubmit }) {
  return (
    <>
      <h2>Welcome back.</h2>
      <p>Sign in to continue your search or hiring.</p>
      <button className="google-btn" onClick={onSubmit}><GoogleIcon />Continue with Google</button>
      <div className="divider">or with email</div>
      <div className="form-field"><label>Email</label><input type="email" placeholder="you@email.com" /></div>
      <div className="form-field"><label>Password</label><input type="password" placeholder="••••••••" /></div>
      <button className="btn btn-coral" onClick={onSubmit}>Sign in →</button>
      <div className="form-foot">
        New to MatchHire? <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>Create free account</a>
      </div>
    </>
  );
}

function SignUp({ onSubmit }) {
  const [role, setRole] = useState('hiring');
  return (
    <>
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
      <button className="google-btn" onClick={onSubmit}><GoogleIcon />Continue with Google</button>
      <div className="divider">or with email</div>
      <div className="form-field"><label>Full name</label><input placeholder="Jane Doe" /></div>
      <div className="form-field"><label>Email · we'll send a verification link</label><input type="email" placeholder="you@email.com" /></div>
      <div className="form-field"><label>Password · 8+ characters</label><input type="password" placeholder="••••••••" /></div>
      <button className="btn btn-coral" onClick={onSubmit}>Create account →</button>
      <div className="form-foot">
        By creating an account, you agree to our <a href="#">Terms</a> &amp; <a href="#">Privacy</a>
      </div>
    </>
  );
}

export default function AuthModal() {
  const { open, mode, closeAuth, switchTab } = useAuthModal();

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') closeAuth(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeAuth]);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    alert('Demo only — wire up to a real auth backend.');
    closeAuth();
  };

  return (
    <div
      className={`modal-overlay${open ? ' open' : ''}`}
      onClick={(e) => { if (e.target.id === 'auth-modal') closeAuth(); }}
      id="auth-modal"
    >
      <div className="modal">
        <button className="modal-close" onClick={closeAuth}>×</button>
        <div className="modal-art">
          <div className="modal-art-content">
            <div className="logo" style={{ marginBottom: 32 }}>
              <div className="logo-mark" style={{ background: 'var(--coral)' }}>H</div>
              <div className="logo-text" style={{ color: 'var(--bone)' }}>
                Hire<em style={{ color: 'var(--bone)', fontStyle: 'italic' }}>loom</em>
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
            >Sign in</button>
            <button
              className={`modal-tab${mode === 'signup' ? ' active' : ''}`}
              onClick={() => switchTab('signup')}
            >Create account</button>
          </div>

          <div id="auth-content">
            {mode === 'signin'
              ? <SignIn onSwitch={() => switchTab('signup')} onSubmit={handleSubmit} />
              : <SignUp onSubmit={handleSubmit} />}
          </div>
        </div>
      </div>
    </div>
  );
}
