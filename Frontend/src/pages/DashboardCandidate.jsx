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
import { toJobCardShape } from '../api/adapters.js';

const STATUS_PILL = {
  applied: { cls: 'pill-applied', label: 'Applied' },
  reviewing: { cls: 'pill-review', label: 'Under review' },
  shortlisted: { cls: 'pill-active', label: 'Shortlisted' },
  interview: { cls: 'pill-interview', label: 'Interview scheduled' },
  offered: { cls: 'pill-offer', label: 'Offer received' },
  hired: { cls: 'pill-offer', label: 'Hired' },
  rejected: { cls: 'pill-rejected', label: 'Not selected' },
  withdrawn: { cls: 'pill-rejected', label: 'Withdrawn' },
};

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, appsData, matchesData] = await Promise.all([
          candidatesApi.dashboardStats(),
          candidatesApi.applications.list({ page: 1, limit: 6 }),
          candidatesApi.recommendedJobs(4).catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        setStats(statsData || null);
        setApps(appsData?.records || []);
        setMatches((matchesData?.records || []).map(toJobCardShape).filter(Boolean));
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
              <div className="dash-side-avatar lg-1">{initials(user?.full_name)}</div>
              {user?.full_name?.split(' ')[0] || 'You'}
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Overview</a></li>
            <li><a><span className="ic">▤</span> My Applications <span className="badge">{appsTotal}</span></a></li>
            <li><Link to="/favorites"><span className="ic">♥</span> Saved Jobs <span className="badge">{favoritesTotal}</span></Link></li>
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
                <h3>Recent applications</h3>
                <a>See all {appsTotal} →</a>
              </div>
              {apps.length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No applications yet — browse jobs to get started.</p>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr><th>Company / Role</th><th>Applied</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {apps.map((a) => {
                      const pill = STATUS_PILL[a.status] || STATUS_PILL.applied;
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="table-co">
                              <div className="mini-logo lg-1">{(a.company_name || '·')[0]}</div>
                              <div>
                                <strong>{a.company_name || 'Company'}</strong>
                                <small>{a.job_title || 'Role'}</small>
                              </div>
                            </div>
                          </td>
                          <td>{relative(a.applied_at)}</td>
                          <td><span className={`pill ${pill.cls}`}>{pill.label}</span></td>
                          <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Profile health</h3>
                <strong style={{ color: 'var(--coral)', fontFamily: "'Fraunces',serif", fontSize: 18 }}>{profileStrength}%</strong>
              </div>
              <div className="completion-bar"><div className="completion-fill" style={{ width: `${profileStrength}%` }}></div></div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 18px' }}>Complete these to reach 100% and triple your match rate.</p>
              <div className="checklist">
                <div className={`check-item${profileStrength >= 60 ? ' done' : ''}`}><div className="check-box">{profileStrength >= 60 ? '✓' : ''}</div><span>Add your headline & summary</span></div>
                <div className={`check-item${profileStrength >= 75 ? ' done' : ''}`}><div className="check-box">{profileStrength >= 75 ? '✓' : ''}</div><span>Add 8+ skills</span></div>
                <div className={`check-item${profileStrength >= 85 ? ' done' : ''}`}><div className="check-box">{profileStrength >= 85 ? '✓' : ''}</div><span>Upload portfolio link <small>+15%</small></span></div>
                <div className={`check-item${profileStrength >= 95 ? ' done' : ''}`}><div className="check-box">{profileStrength >= 95 ? '✓' : ''}</div><span>Verify with LinkedIn <small>+10%</small></span></div>
              </div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>New matches <small>· based on your skills</small></h3>
                <Link to="/jobs">Browse all →</Link>
              </div>
              <div className="app-list">
                {matches.length === 0
                  ? <p className="muted" style={{ padding: '12px 0' }}>No matches yet — refine your <Link to="/preferences">preferences</Link>.</p>
                  : matches.map((m) => (
                    <div key={m.id} className="app-card">
                      <div className={`mini-logo ${m.cl}`}>{m.l}</div>
                      <div className="app-card-info">
                        <strong>{m.title} · {m.co}</strong>
                        <small>{m.loc} · {m.pay} · {m.time}</small>
                      </div>
                      <div className="app-card-meta">
                        {m.match && <span className="pill pill-active">{m.match}</span>}
                        <div>{(m.tags || []).slice(0, 3).join(' · ')}</div>
                      </div>
                    </div>
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
