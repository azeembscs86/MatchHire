/**
 * CompanyDashSidebar
 *
 * Employer-facing sidebar mirrored after CandidateDashSidebar. Owns
 * the NavLink wiring + badge counts; the parent layout
 * (CompanyDashboardLayout) supplies the counts via props so the
 * sidebar stays a pure presentational component.
 *
 * Every row is a real NavLink so the active-tab highlight is driven
 * by the URL — clicking a tab navigates, scroll position resets, and
 * the row that matches the current URL lights up. This replaces the
 * inline inert `<a>` tags that previously rendered as dead links on
 * DashboardCompany.jsx.
 */
import { NavLink } from 'react-router-dom';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
}

function NavRow({ to, icon, label, badge, end = false, testId }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => (isActive ? 'active' : undefined)}
        data-testid={testId}
      >
        <span className="ic">{icon}</span> {label}
        {badge != null && badge !== '' && <span className="badge">{badge}</span>}
      </NavLink>
    </li>
  );
}

export default function CompanyDashSidebar({
  user,
  companyName,
  jobsTotal,
  applicantsTotal,
  shortlistedTotal,
  interviewsScheduled,
  onSignOut,
}) {
  const displayName = companyName || user?.full_name || 'Your company';
  return (
    <aside className="dash-sidebar">
      <div className="dash-side-head">
        <div className="dash-side-role">Employer · Growth plan</div>
        <div className="dash-side-name">
          <div className="dash-side-avatar lg-2">{initials(displayName)}</div>
          {displayName}
        </div>
      </div>
      <ul className="dash-nav">
        <NavRow to="/dashboard/company" end icon="●" label="Dashboard" testId="company-tab-dashboard" />
        <NavRow to="/dashboard/company/post-job" icon="+" label="Post a Job" testId="company-tab-post-job" />
        <NavRow to="/dashboard/company/jobs" icon="▤" label="Job Postings" badge={jobsTotal} testId="company-tab-jobs" />
        <NavRow to="/dashboard/company/applications" icon="◉" label="Applicants" badge={applicantsTotal} testId="company-tab-applications" />
        <NavRow to="/dashboard/company/shortlisted" icon="★" label="Shortlists" badge={shortlistedTotal} testId="company-tab-shortlisted" />
        <NavRow to="/dashboard/company/rejected" icon="×" label="Rejected" testId="company-tab-rejected" />
        <NavRow to="/dashboard/company/interviews" icon="☎" label="Interviews" badge={interviewsScheduled} testId="company-tab-interviews" />
        <NavRow to="/candidates" icon="⌕" label="Talent Search" testId="company-tab-talent" />
        <NavRow to="/dashboard/company/profile" icon="◧" label="Company Profile" testId="company-tab-profile" />
        <div className="dash-nav-section">Account</div>
        <li>
          <a onClick={onSignOut} style={{ cursor: 'pointer' }} data-testid="company-tab-signout">
            <span className="ic">⤓</span> Sign out
          </a>
        </li>
      </ul>
    </aside>
  );
}
