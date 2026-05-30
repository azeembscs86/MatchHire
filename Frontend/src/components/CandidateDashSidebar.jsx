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
import { NavLink, useLocation } from 'react-router-dom';

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
  withdrawnTotal,
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
        {/*
         * Sidebar items match the candidate-dashboard spec exactly:
         * Overview, My Applications, Saved Jobs, Favourites,
         * Withdrawn Applications, Messages, Notifications, Settings,
         * Logout. Profile and Preferences are intentionally NOT in
         * the sidebar — they live as standalone pages reached from
         * the top header / inline CTAs.
         *
         * Counter logic: the applications badge reflects the ACTIVE
         * pipeline (withdrawn rows excluded server-side via the
         * Applications page filter). The withdrawn badge counts the
         * terminal-pull-out rows separately so a candidate sees
         * both totals at a glance.
         */}
        <NavRow to="/dashboard/candidate" icon="●" label="Overview" />
        <NavRow
          to="/dashboard/candidate/applications"
          icon="▤"
          label="My Applications"
          badge={appsTotal}
        />
        <NavRow to="/saved-jobs" icon="⌘" label="Saved Jobs" />
        <NavRow to="/favorites" icon="♥" label="Favourites" badge={favoritesTotal} />
        {/*
         * Withdrawn Applications is a sibling tab to My Applications.
         * Active applications live in the main Applications tab;
         * withdrawals get their own surface so the active pipeline
         * stays uncluttered and the candidate keeps a permanent
         * record of every withdrawal (with Reapply / View Job
         * affordances).
         */}
        <NavRow
          to="/dashboard/candidate/withdrawn"
          icon="↶"
          label="Withdrawn Applications"
          badge={withdrawnTotal}
        />
        <NavRow to="/dashboard/candidate/messages" icon="✉" label="Messages" />
        <NavRow to="/dashboard/candidate/notifications" icon="◉" label="Notifications" />
        <NavRow to="/dashboard/candidate/settings" icon="⚙" label="Settings" />
        <li>
          <a onClick={onSignOut} style={{ cursor: 'pointer' }} data-testid="candidate-sidebar-signout">
            <span className="ic" aria-hidden="true">⤓</span> Logout
          </a>
        </li>
      </ul>
    </aside>
  );
}
