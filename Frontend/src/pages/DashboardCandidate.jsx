/**
 * DashboardCandidate - "Candidate Hub".
 *
 * Personal workspace for job seekers. Data sources:
 *
 *   /candidates/dashboard/stats        applications/interviews/favorites totals + profile strength
 *   /candidates/applications/list      recent applications table
 *   /candidates/recommended-jobs       "new matches" rail
 *
 * The activity timeline is rendered from a synthesized event list
 * (applications + interviews) since the backend does not yet expose a
 * dedicated activity stream.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { candidatesApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import ProfileCompletionCard from '../components/ProfileCompletionCard.jsx';
import { filterActiveJobs } from '../api/adapters.js';
import { useApplyToJob } from '../hooks/useApplyToJob.js';
import JobCard from '../components/JobCard.jsx';
import CandidateDashSidebar from '../components/CandidateDashSidebar.jsx';

/**
 * Status → badge mapping for the Applied Jobs section.
 *
 * Class names map to the badge palette defined in styles.css under
 * "Application status badges (May 2026)". The label set covers the
 * five product-spec states (Applied, Under Review, Shortlisted,
 * Rejected, Accepted) plus the existing DB enum values so legacy
 * rows render with consistent colours instead of falling through to
 * the generic "Applied" pill.
 */
const STATUS_PILL = {
  applied:      { cls: 'pill-applied',     label: 'Applied' },
  reviewing:    { cls: 'pill-review',      label: 'Under Review' },
  under_review: { cls: 'pill-review',      label: 'Under Review' },
  shortlisted:  { cls: 'pill-shortlisted', label: 'Shortlisted' },
  interview:    { cls: 'pill-interview',   label: 'Interview Scheduled' },
  offered:      { cls: 'pill-accepted',    label: 'Accepted' },
  hired:        { cls: 'pill-accepted',    label: 'Accepted' },
  accepted:     { cls: 'pill-accepted',    label: 'Accepted' },
  rejected:     { cls: 'pill-rejected',    label: 'Rejected' },
  withdrawn:    { cls: 'pill-rejected',    label: 'Withdrawn' },
};

function relative(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export default function DashboardCandidate() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [apps, setApps] = useState([]);
  const [matches, setMatches] = useState([]);
  // Per-section completion breakdown for the ProfileCompletionCard.
  const [completion, setCompletion] = useState(null);
  // Onboarding wizard state — surfaces a "Continue setup" banner
  // when the user hasn't completed the 7-step wizard yet.
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appliedIds, setAppliedIds] = useState(() => new Set());
  const [applyMessage, setApplyMessage] = useState(null);

  // Centralised Apply Now wiring. The dashboard's "New matches" rail
  // uses a custom horizontal card (`.app-card`) — not <JobCard /> —
  // but it still routes the apply action through the same hook so the
  // gating rules (logged-in candidate, expired, in-flight) stay
  // identical across every surface.
  const { apply, applyingId, isCandidate } = useApplyToJob({
    onSuccess: ({ job }) => {
      setAppliedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co}.` });
      setTimeout(() => setApplyMessage(null), 5000);
    },
    onError: ({ message }) => {
      setApplyMessage({ ok: false, text: message });
      setTimeout(() => setApplyMessage(null), 5000);
    },
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, appsData, matchesData, completionData] = await Promise.all([
          candidatesApi.dashboardStats(),
          candidatesApi.applications.list({ page: 1, limit: 6 }),
          candidatesApi.recommendedJobs(4).catch(() => ({ records: [] })),
          // Per-section completion breakdown — non-fatal if it errors,
          // so the rest of the dashboard still renders.
          candidatesApi.profileCompletion().catch(() => null),
        ]);
        if (cancelled) return;
        setStats(statsData || null);
        setApps(appsData?.records || []);
        // Dashboard "New matches" rail — drop expired postings so the
        // candidate never sees a match they can't act on.
        setMatches(filterActiveJobs(matchesData?.records));
        setCompletion(completionData || null);
        // Non-blocking — banner just hides if this fails.
        candidatesApi.onboarding.state()
          .then((d) => !cancelled && setOnboarding(d))
          .catch(() => {});
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Active applications = total minus withdrawn. Matches the rollup
  // used by the dashboard layout's sidebar so the overview and the
  // sub-routes show the same number.
  const withdrawnTotal = stats?.applications?.by_status?.withdrawn ?? 0;
  const appsTotal = Math.max(0, (stats?.applications?.total ?? 0) - withdrawnTotal);
  const favoritesTotal = stats?.favorites?.total ?? 0;
  // `interviewsTotal` previously fed the now-removed inline stat
  // card. The interview count is read directly from
  // `stats.applications.by_status.interview` on the summary cards
  // above. `nextInterview` (below) still drives the hero copy.
  const profileStrength = stats?.profile_strength ?? 0;
  const nextInterview = (stats?.interviews?.upcoming || [])[0];

  const timeline = useMemo(() => {
    const events = [];
    (stats?.interviews?.upcoming || []).slice(0, 2).forEach((i) => {
      events.push({
        id: `int-${i.id}`, dot: 'coral', icon: '☎',
        title: `${i.company_name || 'Company'} scheduled an interview`,
        subtitle: i.scheduled_at ? new Date(i.scheduled_at).toLocaleString() : '',
      });
    });
    apps.slice(0, 4).forEach((a) => {
      events.push({
        id: `app-${a.id}`, dot: a.status === 'offered' ? 'sage' : '',
        icon: a.status === 'offered' ? '✓' : '▤',
        title: `${a.status === 'offered' ? 'Offer from ' : 'Applied to '}${a.company_name || 'Company'}`,
        subtitle: `${a.job_title || 'Role'} · ${relative(a.applied_at)}`,
      });
    });
    return events.slice(0, 6);
  }, [apps, stats]);

  if (loading) {
    return (
      <section className="view active" id="view-dash-candidate" style={{ background: 'var(--bone)' }}>
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your dashboard…" />
        </div>
      </section>
    );
  }

  return (
    <section className="view active" id="view-dash-candidate" data-testid="candidate-dashboard-shell" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <CandidateDashSidebar
          user={user}
          appsTotal={appsTotal}
          favoritesTotal={favoritesTotal}
          withdrawnTotal={withdrawnTotal}
          rejectedTotal={stats?.applications?.by_status?.rejected ?? 0}
          profileStrength={profileStrength}
          onSignOut={logout}
        />

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Welcome back, <span className="ital">{user?.full_name?.split(' ')[0] || 'there'}</span>.</h1>
              <p>
                You have {appsTotal} application{appsTotal === 1 ? '' : 's'}{nextInterview ? ` and an upcoming interview with ${nextInterview.company_name || 'a company'}` : ''}.
              </p>
            </div>
            <div className="dash-topbar-actions">
              <Link to="/profile" className="btn btn-coral">Edit profile →</Link>
            </div>
          </div>

          {error && <ErrorState error={error} />}

          {/*
           * Onboarding banner — only renders when the wizard exists
           * AND has not yet been completed. The banner deep-links
           * back to the EXACT step the user left off on.
           */}
          {onboarding && !onboarding.is_completed && (
            <div style={{
              background: 'linear-gradient(135deg, var(--coral, #E85D3C), var(--coral-deep, #C73E1D))',
              color: '#fff', borderRadius: 14, padding: '16px 20px',
              marginBottom: 18, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, marginBottom: 2 }}>
                  Continue your setup
                </div>
                <div style={{ fontSize: 13, opacity: 0.92 }}>
                  Step {Number(onboarding.current_step) + 1} of {onboarding.total_steps}
                  {' · '}
                  Profile {onboarding.profile_strength}% complete
                </div>
              </div>
              <Link
                to="/onboarding"
                style={{
                  background: '#fff', color: 'var(--coral-deep, #C73E1D)',
                  padding: '8px 16px', borderRadius: 100, fontWeight: 600,
                  fontSize: 13, textDecoration: 'none',
                }}
              >
                Resume onboarding →
              </Link>
            </div>
          )}

          {/*
           * Six clickable summary cards (June 2031 redesign).
           *
           * Replaced the old four-card stat row + the inline
           * "My Applications" list — both lived on the overview
           * but duplicated content already available on the
           * dedicated tabs. The overview is now a high-level
           * dashboard with one summary tile per workflow surface;
           * each tile navigates to the matching sidebar tab so a
           * candidate can drill from the count into the list in
           * one click.
           *
           * The shortlisted + interviews tiles deep-link via a
           * `?status=…` query param so the My Applications page
           * can scope the list when (later) it consumes that
           * param. Today the route still opens the full list;
           * the scope is a non-breaking UI enhancement reserved
           * for a follow-up step.
           *
           * Profile strength moved to the sidebar widget — see
           * `CandidateDashSidebar` — so a tile here isn't needed.
           */}
          <div className="overview-summary" data-testid="overview-summary">
            <Link to="/dashboard/candidate/applications" className="overview-summary-card overview-summary-card-primary">
              <div className="overview-summary-icon">▤</div>
              <div className="overview-summary-value">{appsTotal}</div>
              <div className="overview-summary-label">Applications</div>
            </Link>
            <Link to="/saved-jobs" className="overview-summary-card">
              <div className="overview-summary-icon">⌘</div>
              <div className="overview-summary-value">{stats?.saved_jobs?.total ?? 0}</div>
              <div className="overview-summary-label">Saved Jobs</div>
            </Link>
            <Link
              to="/dashboard/candidate/applications?status=shortlisted"
              className="overview-summary-card"
            >
              <div className="overview-summary-icon">★</div>
              <div className="overview-summary-value">{stats?.applications?.by_status?.shortlisted ?? 0}</div>
              <div className="overview-summary-label">Shortlisted</div>
            </Link>
            <Link
              to="/dashboard/candidate/applications?status=interview"
              className="overview-summary-card"
            >
              <div className="overview-summary-icon">☎</div>
              <div className="overview-summary-value">{stats?.applications?.by_status?.interview ?? 0}</div>
              <div className="overview-summary-label">Interviews</div>
            </Link>
            <Link to="/dashboard/candidate/withdrawn" className="overview-summary-card">
              <div className="overview-summary-icon">↶</div>
              <div className="overview-summary-value">{withdrawnTotal}</div>
              <div className="overview-summary-label">Withdrawn</div>
            </Link>
            <Link to="/dashboard/candidate/rejected" className="overview-summary-card">
              <div className="overview-summary-icon">✕</div>
              <div className="overview-summary-value">{stats?.applications?.by_status?.rejected ?? 0}</div>
              <div className="overview-summary-label">Rejected</div>
            </Link>
          </div>

          {/*
           * Profile completion hints stay on the overview because
           * they actively drive the candidate's "next step". The
           * standalone version (full-width) replaces the previous
           * 50/50 split that paired it with the now-removed
           * Applications list.
           */}
          <div className="dash-row" style={{ marginTop: 24 }}>
            <ProfileCompletionCard completion={completion} compact />
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>New matches <small>· based on your skills</small></h3>
                <Link to="/jobs">Browse all →</Link>
              </div>
              {applyMessage && (
                <div
                  role="status"
                  style={{
                    margin: '8px 0 12px', padding: '10px 12px', borderRadius: 8,
                    background: applyMessage.ok ? '#e6f4ea' : '#fde9e3',
                    color: applyMessage.ok ? '#0f5132' : '#b3361b',
                    fontSize: 13,
                  }}
                >
                  {applyMessage.text}
                </div>
              )}
              {/*
                * "New matches" rail — uses JobCard's `row` variant so
                * the dashboard list stays compact but visually
                * consistent with every other surface (match tier,
                * Apply Now states, hearts).
                */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matches.length === 0
                  ? <p className="muted" style={{ padding: '12px 0' }}>No matches yet — refine your <Link to="/preferences">preferences</Link>.</p>
                  : matches.map((m) => (
                      <JobCard
                        key={m.id}
                        job={m}
                        variant="row"
                        onApply={isCandidate ? apply : undefined}
                        applied={appliedIds.has(m.id)}
                        applyingId={applyingId}
                      />
                    ))}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent activity</h3>
              </div>
              <div className="timeline">
                {timeline.length === 0
                  ? <p className="muted" style={{ padding: '12px 0' }}>No activity yet.</p>
                  : timeline.map((t) => (
                    <div key={t.id} className="tl-item">
                      <div className={`tl-dot ${t.dot}`}>{t.icon}</div>
                      <div className="tl-content">
                        <strong>{t.title}</strong>
                        <span>{t.subtitle}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
