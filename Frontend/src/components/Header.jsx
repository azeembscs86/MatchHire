/**
 * Header
 *
 * Sticky primary navigation that hosts the brand, route links, a
 * favorites shortcut, the dashboard dropdown, and the auth buttons.
 *
 * `NavLink` is preferred over `Link` here so React Router applies
 * the `.active` class automatically — the same hook the design
 * system uses to render the coral underline dot.
 *
 * The favorites count is read live from FavoritesContext, so saving
 * or unsaving anywhere on the site updates this badge in place.
 */
import { NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import DashboardDropdown from './DashboardDropdown.jsx';
import { useAuthModal } from '../context/AuthModalContext.jsx';
import { useFavorites } from '../context/FavoritesContext.jsx';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/jobs', label: 'Jobs' },
  { to: '/companies', label: 'Companies' },
  { to: '/candidates', label: 'Candidates' },
  { to: '/profile', label: 'My Profile' },
  { to: '/preferences', label: 'Preferences' },
  { to: '/employer-onboarding', label: 'For Employers' },
];

export default function Header() {
  const { openAuth } = useAuthModal();
  const { count } = useFavorites();
  const navigate = useNavigate();

  return (
    <header className="main-nav">
      <div className="container nav-inner">
        <Logo />
        <nav>
          <ul className="nav-menu">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-actions">
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
          <DashboardDropdown />
          <button className="btn btn-ghost" onClick={() => openAuth('signin')}>Sign in</button>
          <button className="btn btn-coral" onClick={() => openAuth('signup')}>Join free</button>
        </div>
      </div>
    </header>
  );
}
