/**
 * CandidateDashSidebar
 *
 * Reusable sidebar shared by the candidate dashboard overview
 * page (DashboardCandidate.jsx) and every dashboard sub-route
 * wrapped in CandidateDashboardLayout (/favorites, /saved-jobs,
 * /profile, /preferences). Single source of truth so the
 * sidebar reads identically on every dashboard tab.
 *
 * Active state is computed from the current URL via NavLink so a
 * deep-link to e.g. /favorites highlights the Favourites row
 * without the parent having to pass an `active` prop.
 *
 * Counter badges (applications, favourites, interviews) are
 * optional — pass them when known and the row renders the
 * badge; omit and the row stays clean.
 */
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '··';
}

/**
 * Avatar with image -> initials fallback. Identical behaviour to
 * the previous inline component in DashboardCandidate; lifted
 * here so the sidebar component is fully self-contained.
 */
function DashAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  const url = user?.avatar_url;
  const showImg = !!url && !failed;
  return (
    <div
      className={`dash-side-avatar${showImg ? '' : ' lg-1'}`}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {!showImg && initials(user?.full_name)}
      {showImg && (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}

/**
 * NavLink row inside the dashboard nav. NavLink applies the
 * `active` class when the URL matches; we also accept a
 * `match` array of additional paths that should highlight this
 * row (e.g. the Profile row stays active on /profile/review).
 */
function NavRow({ to, icon, label, badge, match }) {
  const { pathname } = useLocation();
  const additional = (match || []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
  return (
    <li>
      <NavLink
        to={to}
        end
        className={({ isActive }) => (isActive || additional ? 'active' : undefined)}
      >
        <span className="ic" aria-hidden="true">{icon}</span> {label}
        {badge != null && <span className="badge">{badge}</span>}
      </NavLink>
    </li>
  );
}

export default function CandidateDashSidebar({
  user,
  appsTotal,
  favoritesTotal,
  interviewsTotal,
  onSignOut,
}) {
  return (
    <aside className="dash-sidebar" data-testid="candidate-dash-sidebar">
      <div className="dash-side-head">
        <div className="dash-side-role">Candidate · Pro plan</div>
        <div className="dash-side-name">
          <DashAvatar user={user} />
          {user?.full_name?.split(' ')[0] || 'You'}
        </div>
      </div>
      <ul className="dash-nav">
        <NavRow to="/dashboard/candidate" icon="●" label="Overview" />
        {/*
         * "My Applications" still lives as an inline section on
         * the Overview page (no dedicated route yet) — keep the
         * row visible but inert so the navigation reads complete.
         * When the dedicated route ships, swap this for a NavRow.
         */}
        <li>
          <a>
            <span className="ic" aria-hidden="true">▤</span> My Applications
            {appsTotal != null && <span className="badge">{appsTotal}</span>}
          </a>
        </li>
        <NavRow to="/favorites" icon="♥" label="Favourites" badge={favoritesTotal} />
        <NavRow to="/saved-jobs" icon="⌘" label="Saved for Later" />
        <li>
          <Link to="/jobs">
            <span className="ic" aria-hidden="true">★</span> Job Matches
          </Link>
        </li>
        <NavRow to="/profile" icon="⚙" label="Edit Profile" match={['/profile/review']} />
        <NavRow to="/preferences" icon="⚙" label="Job Preferences" />
        <li>
          <a>
            <span className="ic" aria-hidden="true">☎</span> Interviews
            {interviewsTotal != null && <span className="badge">{interviewsTotal}</span>}
          </a>
        </li>
        <div className="dash-nav-section">Account</div>
        <li><a><span className="ic" aria-hidden="true">⚙</span> Settings</a></li>
        <li>
          <a onClick={onSignOut} style={{ cursor: 'pointer' }}>
            <span className="ic" aria-hidden="true">⤓</span> Sign out
          </a>
        </li>
      </ul>
    </aside>
  );
}
