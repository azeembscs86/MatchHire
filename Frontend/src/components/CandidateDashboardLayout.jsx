/**
 * CandidateDashboardLayout
 *
 * Route wrapper that renders the candidate dashboard shell
 * (sidebar + main column with bone background) and delegates
 * the inner content to a child route via React Router's
 * <Outlet />. Every candidate dashboard tab — Favourites, Saved
 * Jobs, Edit Profile, Job Preferences — is mounted under this
 * wrapper so the sidebar stays anchored on the left across the
 * full set, instead of disappearing when the candidate clicks
 * into the legacy standalone routes.
 *
 * Dashboard counters (applications / favourites / interviews)
 * come from /candidates/dashboard/stats, fetched once when the
 * layout mounts. The numbers are passed to the sidebar so the
 * badge counts stay consistent across tabs; if the fetch fails
 * we render the sidebar with bare labels rather than failing
 * the page.
 *
 * The standalone DashboardCandidate "overview" page keeps its
 * own data fetching for the dashboard cards (welcome message,
 * profile completion, recommended rail). The layout wrapper
 * provides the sidebar; the overview page provides its content.
 * Both call the same backend stats endpoint — duplicate cost is
 * one request, acceptable for the consistency win.
 */
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { candidatesApi } from '../api/index.js';
import CandidateDashSidebar from './CandidateDashSidebar.jsx';

export default function CandidateDashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    candidatesApi.dashboardStats()
      .then((data) => { if (!cancelled) setStats(data || null); })
      .catch(() => { /* badges stay unset — non-blocking */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  async function handleSignOut() {
    await logout();
    navigate('/');
  }

  return (
    <section
      className="view active dash-shell"
      id="view-dash-candidate-shell"
      data-testid="candidate-dashboard-shell"
      style={{ background: 'var(--bone)' }}
    >
      <div className="dash-layout">
        <CandidateDashSidebar
          user={user}
          /*
           * Apps badge is the ACTIVE-pipeline total — every status
           * except withdrawn, rejected, and shortlisted, all of
           * which have their own dedicated sidebar tabs + badges.
           * Layout owns the rollup so every tab mounted underneath
           * sees a consistent count from the shared dashboard-stats
           * fetch.
           */
          appsTotal={(() => {
            const total = stats?.applications?.total ?? null;
            if (total == null) return null;
            const by = stats?.applications?.by_status || {};
            const sidelined = (by.withdrawn || 0) + (by.rejected || 0) + (by.shortlisted || 0);
            return Math.max(0, total - sidelined);
          })()}
          favoritesTotal={stats?.favorites?.total ?? null}
          withdrawnTotal={stats?.applications?.by_status?.withdrawn ?? null}
          rejectedTotal={stats?.applications?.by_status?.rejected ?? null}
          shortlistedTotal={stats?.applications?.by_status?.shortlisted ?? null}
          profileStrength={stats?.profile_strength ?? null}
          onSignOut={handleSignOut}
        />
        <div className="dash-main dash-main-flush">
          {/*
           * `.dash-main-flush` removes the default 36×44 padding
           * so nested pages keep their own hero / page-header
           * spacing instead of doubling it. The class is opt-in
           * so the overview page (rendered separately by
           * DashboardCandidate.jsx) still gets the original
           * padded shell.
           */}
          <Outlet />
        </div>
      </div>
    </section>
  );
}
