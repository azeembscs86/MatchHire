/**
 * PasswordInput
 *
 * Reusable password field with a show/hide eye toggle. Used on the
 * sign-in tab, the sign-up tab, the reset-password page, and the
 * change-password form on Profile (when present).
 *
 * Accessibility:
 *   - The toggle button has an explicit aria-label ("Show password"
 *     / "Hide password") that flips with state, and uses
 *     aria-pressed so screen readers announce the toggled state.
 *   - The button is rendered inside the input wrapper but is a
 *     standalone control — clicking it doesn't submit the form.
 *
 * Security:
 *   - The component never persists the typed value anywhere; the
 *     parent owns state.
 */
import { useState } from 'react';

function EyeIcon({ off }) {
  if (off) {
    // Eye with strike-through ("hidden")
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  // Open eye ("shown")
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••',
  required = true,
  minLength,
  autoComplete = 'current-password',
  id,
  ariaLabel,
  testId,
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        data-testid={testId}
        style={{ paddingRight: 42, width: '100%' }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 0,
          padding: 6,
          cursor: 'pointer',
          color: 'var(--muted, #6b6b6b)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EyeIcon off={!show} />
      </button>
    </div>
  );
}
