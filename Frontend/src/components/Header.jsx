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
 * Below the 900px breakpoint the inline nav + action cluster
 * collapse into a hamburger that opens MobileNav — a slide-in
 * drawer carrying the same nav links + role-aware dashboard
 * shortcuts + signed-in/signed-out actions, so no destination is
 * ever stranded behind a hidden menu on mobile.
 */
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import DashboardDropdown from './DashboardDropdown.jsx';
import MobileNav from './MobileNav.jsx';
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

/**
 * Map the authenticated user's role to the dashboard shortcut
 * links surfaced inside the mobile drawer. Mirrors the
 * DashboardDropdown options so the two surfaces stay in sync.
 */
function dashboardLinksFor(role) {
  if (role === 'candidate') return [{ to: '/dashboard/candidate', label: 'Candidate Hub' }];
  if (role === 'employer')  return [{ to: '/dashboard/company',   label: 'Company Hub' }];
  if (role === 'admin' || role === 'super_admin') {
    return [
      { to: '/dashboard/candidate', label: 'Candidate Hub' },
      { to: '/dashboard/company',   label: 'Company Hub' },
      { to: '/dashboard/admin',     label: 'Admin Console' },
    ];
  }
  return [];
}

export default function Header() {
  const { openAuth } = useAuthModal();
  const { count } = useFavorites();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [nav, setNav] = useState({ primary: FALLBACK_PRIMARY, dashboard: null });
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const primaryLinks = nav.primary || FALLBACK_PRIMARY;

  return (
    <header className="main-nav">
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-desktop">
          <ul className="nav-menu">
            {primaryLinks.map((l) => (
              <li key={l.key || l.to}>
                <NavLink to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-actions nav-actions-desktop">
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

        <MobileNav
          open={mobileOpen}
          onOpen={() => setMobileOpen(true)}
          onClose={() => setMobileOpen(false)}
          primaryLinks={primaryLinks}
          isAuthenticated={isAuthenticated}
          user={user}
          favoritesCount={count}
          dashboardLinks={isAuthenticated ? dashboardLinksFor(user?.role) : []}
          onSignIn={() => openAuth('signin')}
          onSignUp={() => openAuth('signup')}
          onSignOut={handleLogout}
        />
      </div>
    </header>
  );
}
