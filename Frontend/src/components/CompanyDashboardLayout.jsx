/**
 * CompanyDashboardLayout
 *
 * Route wrapper for the employer dashboard. Renders the persistent
 * sidebar + main column shell and delegates inner content to the
 * child route via React Router's <Outlet />. Mirror of
 * CandidateDashboardLayout so the two role surfaces feel like
 * siblings.
 *
 * Sidebar badges (jobs, applicants, shortlisted, interviews) come
 * from /employers/dashboard/stats, fetched once on mount and shared
 * across every nested page so the counts stay consistent when the
 * user clicks between tabs.
 */
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { employersApi } from '../api/index.js';
import CompanyDashSidebar from './CompanyDashSidebar.jsx';

export default function CompanyDashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    employersApi.dashboardStats()
      .then((data) => { if (!cancelled) setStats(data || null); })
      .catch(() => { /* badges stay unset — non-blocking */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  async function handleSignOut() {
    await logout();
    navigate('/');
  }

  const by = stats?.applications?.by_status || {};

  return (
    <section
      className="view active dash-shell"
      id="view-dash-company-shell"
      data-testid="company-dashboard-shell"
      style={{ background: 'var(--bone)' }}
    >
      <div className="dash-layout">
        <CompanyDashSidebar
          user={user}
          companyName={stats?.company?.name}
          jobsTotal={stats?.jobs_total ?? null}
          applicantsTotal={stats?.applications?.total ?? null}
          shortlistedTotal={by.shortlisted ?? null}
          interviewsScheduled={stats?.interviews?.scheduled ?? null}
          onSignOut={handleSignOut}
        />
        <div className="dash-main dash-main-flush">
          <Outlet />
        </div>
      </div>
    </section>
  );
}
