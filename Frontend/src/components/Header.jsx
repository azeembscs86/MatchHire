/**
 * Header
 *
 * Sticky primary navigation. The link list and action buttons are
 * driven by `/public/navigation`, which the backend tailors to the
 * caller's role:
 *
 *   - Anonymous:      Home, Jobs, Companies, Candidates
 *   - Candidate:      + My Profile, Preferences + Candidate Hub dropdown
 *                      (Favourites lives in the dashboard sidebar,
 *                      not in the header)
 *   - Employer:       same as anonymous + Company Hub dropdown
 *   - Admin/SuperAdm: same as anonymous + Admin dashboard dropdown
 *
 * Role-specific destinations (Company Profile, Job Postings, Admin
 * Console) are surfaced via the DashboardDropdown, not the primary
 * nav, so the marketplace links read the same across every role.
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
import { useAuth } from '../context/AuthContext.jsx';
import { publicApi } from '../api/index.js';

const FALLBACK_PRIMARY = [
  { key: 'home', label: 'Home', to: '/', end: true },
  { key: 'jobs', label: 'Jobs', to: '/jobs' },
  { key: 'companies', label: 'Companies', to: '/companies' },
  { key: 'candidates', label: 'Candidates', to: '/candidates' },
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
          {/*
           * Favourites is reached from the candidate dashboard
           * sidebar (♥ Favourites row), not from the top header
           * — the heart button was removed so the header reads
           * as marketplace navigation rather than a personal
           * shortcut bar.
           */}
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
          dashboardLinks={isAuthenticated ? dashboardLinksFor(user?.role) : []}
          onSignIn={() => openAuth('signin')}
          onSignUp={() => openAuth('signup')}
          onSignOut={handleLogout}
        />
      </div>
    </header>
  );
}
