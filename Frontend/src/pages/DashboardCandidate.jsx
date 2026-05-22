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
import { toJobCardShape } from '../api/adapters.js';
import { useApplyToJob } from '../hooks/useApplyToJob.js';

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

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
}

/**
 * Sidebar avatar. Uses a real <img> so onError can fall back to
 * the initials block when the URL 404s (file deleted, stale URL,
 * network blip). The <img> sits absolutely-positioned over the
 * initials so the fallback is instant — no flash of broken image.
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
        setMatches((matchesData?.records || []).map(toJobCardShape).filter(Boolean));
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

  const appsTotal = stats?.applications?.total ?? 0;
  const favoritesTotal = stats?.favorites?.total ?? 0;
  const interviewsTotal = stats?.interviews?.total ?? 0;
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
    <section className="view active" id="view-dash-candidate" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Candidate · Pro plan</div>
            <div className="dash-side-name">
              {/*
               * Avatar — uses a real <img> so onError can fall back
               * to initials when the file 404s (deleted on disk,
               * stale URL, etc) rather than rendering a broken-image
               * placeholder. The wrapper keeps the .dash-side-avatar
               * class so layout/sizing stays consistent.
               */}
              <DashAvatar user={user} />
              {user?.full_name?.split(' ')[0] || 'You'}
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Overview</a></li>
            <li><a><span className="ic">▤</span> My Applications <span className="badge">{appsTotal}</span></a></li>
            <li><Link to="/favorites"><span className="ic">♥</span> Favourites <span className="badge">{favoritesTotal}</span></Link></li>
            <li><Link to="/saved-jobs"><span className="ic">⌘</span> Saved for Later</Link></li>
            <li><Link to="/jobs"><span className="ic">★</span> Job Matches</Link></li>
            <li><Link to="/profile"><span className="ic">⚙</span> Edit Profile</Link></li>
            <li><Link to="/preferences"><span className="ic">⚙</span> Job Preferences</Link></li>
            <li><a><span className="ic">☎</span> Interviews <span className="badge">{interviewsTotal}</span></a></li>
            <div className="dash-nav-section">Account</div>
            <li><a><span className="ic">⚙</span> Settings</a></li>
            <li><a onClick={logout} style={{ cursor: 'pointer' }}><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

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

          <div className="stat-row">
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Profile strength<div className="stat-icon">◉</div></div>
              <div className="stat-value">{profileStrength}%</div>
              <div className="stat-trend">Aim for 100%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Applications<div className="stat-icon">▤</div></div>
              <div className="stat-value">{appsTotal}</div>
              <div className="stat-trend">All-time</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Saved jobs<div className="stat-icon">♥</div></div>
              <div className="stat-value">{favoritesTotal}</div>
              <div className="stat-trend">In favorites</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Interviews<div className="stat-icon">☎</div></div>
              <div className="stat-value">{interviewsTotal}</div>
              <div className="stat-trend">{nextInterview ? `Next: ${nextInterview.company_name || 'TBA'}` : 'None scheduled'}</div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Job Applications</h3>
                <Link to="/applications">See all {appsTotal} →</Link>
              </div>
              {apps.length === 0 ? (
                <div className="dash-empty">
                  <div className="dash-empty-icon">▤</div>
                  <h4>No applications yet</h4>
                  <p>You haven't applied to any jobs so far. Browse open roles and apply to the ones that fit you best.</p>
                  <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
                </div>
              ) : (
                <div className="app-rows">
                  {apps.map((a) => {
                    const pill = STATUS_PILL[a.status] || STATUS_PILL.applied;
                    const location = a.job_location || (a.is_remote ? 'Remote' : '—');
                    return (
                      <div key={a.id} className="app-row">
                        <div className={`mini-logo lg-${(Number(a.company_id || a.id) % 7) + 1}`}>
                          {(a.company_name || '·')[0]}
                        </div>
                        <div className="app-row-main">
                          <div className="app-row-title text-truncate" title={a.job_title || 'Role'}>
                            {a.job_title || 'Role'}
                          </div>
                          <div className="app-row-sub">
                            <span className="text-truncate" title={a.company_name}>{a.company_name || 'Company'}</span>
                            <span>·</span>
                            <span className="text-truncate" title={location}>{location}</span>
                          </div>
                          <div className="app-row-meta">
                            <span title={a.applied_at ? new Date(a.applied_at).toLocaleString() : ''}>
                              Applied {relative(a.applied_at)}
                            </span>
                            <span className={`pill ${pill.cls}`}>{pill.label}</span>
                          </div>
                        </div>
                        <Link
                          to={`/jobs/${a.job_id}`}
                          className="btn btn-ghost btn-sm app-row-view"
                          aria-label={`View details for ${a.job_title || 'role'}`}
                        >
                          View details
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/*
             * Profile health — drives off the real per-section
             * breakdown from /candidates/profile-completion so the
             * hints match what the candidate hasn't filled in yet,
             * not a hard-coded list.
             */}
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
              <div className="app-list">
                {matches.length === 0
                  ? <p className="muted" style={{ padding: '12px 0' }}>No matches yet — refine your <Link to="/preferences">preferences</Link>.</p>
                  : matches.map((m) => {
                    const alreadyApplied = appliedIds.has(m.id);
                    const expired = !!m.isExpired;
                    return (
                      <div key={m.id} className="app-card">
                        <Link
                          to={`/jobs/${m.id}`}
                          className={`mini-logo ${m.cl}`}
                          aria-label={`Open ${m.title}`}
                        >
                          {m.l}
                        </Link>
                        <div className="app-card-info">
                          <strong>
                            <Link to={`/jobs/${m.id}`} style={{ color: 'inherit' }}>
                              {m.title} · {m.co}
                            </Link>
                          </strong>
                          <small>{m.loc} · {m.pay} · {m.time}</small>
                        </div>
                        <div className="app-card-meta">
                          {m.match && <span className="pill pill-active">{m.match}</span>}
                          <div>{(m.tags || []).slice(0, 3).join(' · ')}</div>
                        </div>
                        {/*
                          * Per-row Apply control. Guarded on `isCandidate`
                          * so the button never renders on non-candidate
                          * sessions even if this page were reached by
                          * mistake (shouldn't happen — the route is
                          * candidate-only — but defensive nonetheless).
                          */}
                        {isCandidate && (
                          alreadyApplied ? (
                            <button
                              className="btn btn-coral btn-sm apply-btn apply-btn-applied"
                              type="button"
                              disabled
                              aria-disabled="true"
                              style={{ minWidth: 132 }}
                            >
                              ✓ Already Applied
                            </button>
                          ) : expired ? (
                            <button
                              className="btn btn-coral btn-sm apply-btn apply-btn-expired"
                              type="button"
                              disabled
                              aria-disabled="true"
                              title="This job is no longer accepting applications"
                              style={{ minWidth: 132 }}
                            >
                              Job Expired
                            </button>
                          ) : (
                            <button
                              className="btn btn-coral btn-sm apply-btn"
                              type="button"
                              onClick={(e) => { e.stopPropagation(); apply(m); }}
                              disabled={applyingId === m.id}
                              aria-busy={applyingId === m.id}
                              style={{ minWidth: 132 }}
                            >
                              {applyingId === m.id ? 'Applying…' : 'Apply Now'}
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
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
