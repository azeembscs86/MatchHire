/**
 * Header
 *
 * Sticky primary navigation. The link list and action buttons are
 * driven by `/public/navigation`, which the backend tailors to the
 * caller's role:
 *
 *   - Anonymous:      Home, Jobs, Companies, Candidates, For Employers
 *   - Candidate:      + My Profile, Preferences, Favorites
 *   - Employer:       + Company Profile, Job Postings
 *   - Admin/SuperAdm: + Admin Console
 *
 * We refetch the menu whenever the authenticated user changes so the
 * header swaps between guest and signed-in modes immediately after
 * login/logout - no full reload needed.
 *
 * The favorites count + dashboard dropdown sit alongside the action
 * buttons. We hide both when the user is anonymous since they only
 * make sense for an authenticated role.
 */
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import DashboardDropdown from './DashboardDropdown.jsx';
import { useAuthModal } from '../context/AuthModalContext.jsx';
import { useFavorites } from '../context/FavoritesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { publicApi } from '../api/index.js';

const FALLBACK_PRIMARY = [
  { key: 'home', label: 'Home', to: '/', end: true },
  { key: 'jobs', label: 'Jobs', to: '/jobs' },
  { key: 'companies', label: 'Companies', to: '/companies' },
  { key: 'candidates', label: 'Candidates', to: '/candidates' },
  { key: 'employer-onboarding', label: 'For Employers', to: '/employer-onboarding' },
];

export default function Header() {
  const { openAuth } = useAuthModal();
  const { count } = useFavorites();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [nav, setNav] = useState({ primary: FALLBACK_PRIMARY, dashboard: null });

  // Refetch the menu whenever the auth state flips. The API layer
  // attaches the bearer token automatically so this single call
  // returns the right links for the current role.
  useEffect(() => {
    let cancelled = false;
    publicApi.navigation()
      .then((data) => { if (!cancelled && data?.primary) setNav(data); })
      .catch(() => { /* fall back to the static menu defined above */ });
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <header className="main-nav">
      <div className="container nav-inner">
        <Logo />
        <nav>
          <ul className="nav-menu">
            {(nav.primary || FALLBACK_PRIMARY).map((l) => (
              <li key={l.key || l.to}>
                <NavLink to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-actions">
          {isAuthenticated && user?.role === 'candidate' && (
            <button
              className="dash-trigger"
              onClick={() => navigate('/favorites')}
              title="Saved jobs"
              style={{ padding: '8px 12px' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16, color: 'var(--coral)' }}>
                <path d="M12.1 18.55 12 18.65l-.11-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.86C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3" />
              </svg>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: 'var(--coral)', fontWeight: 600 }}>{count}</span>
            </button>
          )}
          {isAuthenticated && <DashboardDropdown role={user?.role} />}
          {isAuthenticated ? (
            <>
              <span className="muted" style={{ fontSize: 13, marginRight: 4 }} title={user?.email}>
                Hi, {(user?.full_name || user?.email || '').split(' ')[0]}
              </span>
              <button className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => openAuth('signin')}>Sign in</button>
              <button className="btn btn-coral" onClick={() => openAuth('signup')}>Join free</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
