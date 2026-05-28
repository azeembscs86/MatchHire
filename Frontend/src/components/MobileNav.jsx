/**
 * MobileNav
 *
 * Hamburger-triggered slide-in drawer that surfaces the primary
 * nav and the auth/account actions on small screens. Owns ONLY
 * the open/close state + the drawer chrome — the link list,
 * dashboard dropdown, favourites button and auth buttons are
 * passed down so the desktop and mobile surfaces stay in lock-
 * step (no duplicated menu definition).
 *
 * Accessibility:
 *   - role="dialog" + aria-modal so screen readers announce it
 *     as an overlay.
 *   - Body scroll locked while open.
 *   - Escape closes; clicking the dimmed overlay closes.
 *   - The button toggle carries aria-expanded + aria-controls.
 *
 * Visibility is purely CSS-controlled (`.mobile-nav-toggle` /
 * `.mobile-drawer` only render past their breakpoint). The
 * component itself always mounts so the toggle's state survives
 * a resize without React having to re-mount.
 */
import { useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';

export default function MobileNav({
  open,
  onClose,
  onOpen,
  primaryLinks,
  isAuthenticated,
  user,
  dashboardLinks = [],
  onSignIn,
  onSignUp,
  onSignOut,
}) {
  // Close on Escape and lock body scroll while open. Both effects
  // need to clean up on close so the page is fully usable again
  // even if the drawer is dismissed via an outside click.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        data-testid="mobile-nav-toggle"
        onClick={() => (open ? onClose?.() : onOpen?.())}
      >
        {/* Two-line "hamburger" → "x" via CSS transforms. We render
            the same three lines and class-flip handles the morph. */}
        <span className={`hamburger${open ? ' is-open' : ''}`} aria-hidden="true">
          <i /><i /><i />
        </span>
      </button>

      <div
        className={`mobile-drawer-overlay${open ? ' is-open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        aria-hidden={!open}
      >
        <aside
          id="mobile-drawer"
          className={`mobile-drawer${open ? ' is-open' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          data-testid="mobile-drawer"
        >
          <header className="mobile-drawer-head">
            <span className="mobile-drawer-eyebrow">Menu</span>
            <button
              type="button"
              className="mobile-drawer-close"
              onClick={onClose}
              aria-label="Close menu"
            >×</button>
          </header>

          {isAuthenticated && user && (
            <div className="mobile-drawer-user">
              <div className="mobile-drawer-user-name">
                Hi, {(user.full_name || user.email || '').split(' ')[0]}
              </div>
              <div className="mobile-drawer-user-meta">{user.email}</div>
            </div>
          )}

          <nav>
            <ul className="mobile-drawer-list">
              {primaryLinks.map((l) => (
                <li key={l.key || l.to}>
                  <NavLink
                    to={l.to}
                    end={l.end}
                    onClick={onClose}
                    className={({ isActive }) => `mobile-drawer-link${isActive ? ' is-active' : ''}`}
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
              {/*
               * Favourites / Saved jobs intentionally NOT in the
               * mobile drawer — candidates reach them through the
               * Candidate Hub dashboard sidebar (♥ Favourites,
               * ⌘ Saved Jobs rows), matching the desktop nav.
               */}
              {/*
               * Role-specific dashboard links live below the
               * primary list. The dashboard surface itself owns
               * its sidebar, so we just expose the top-level
               * destinations the dropdown would otherwise show.
               */}
              {dashboardLinks.length > 0 && (
                <li className="mobile-drawer-section">Dashboard</li>
              )}
              {dashboardLinks.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    onClick={onClose}
                    className={({ isActive }) => `mobile-drawer-link${isActive ? ' is-active' : ''}`}
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mobile-drawer-actions">
            {isAuthenticated ? (
              <button
                className="btn btn-ghost"
                onClick={() => { onSignOut?.(); onClose?.(); }}
                style={{ width: '100%' }}
              >Sign out</button>
            ) : (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => { onSignIn?.(); onClose?.(); }}
                  style={{ width: '100%' }}
                >Sign in</button>
                <button
                  className="btn btn-coral"
                  onClick={() => { onSignUp?.(); onClose?.(); }}
                  style={{ width: '100%' }}
                >Join free</button>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
