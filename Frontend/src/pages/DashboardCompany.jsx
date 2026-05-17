/**
 * DashboardCompany - "Company Hub".
 *
 * Employer-side workspace. Data sources:
 *
 *   /employers/dashboard/stats     by-status counts + interviews
 *   /employers/jobs/list           the company's job postings
 *   /employers/jobs/:id/applicants top applicants from the most-applied job
 *
 * The hiring funnel is derived from the by-status counts on
 * `applications` (Applied -> Reviewed -> Shortlisted -> Interview ->
 * Offered -> Hired), so the percentages stay accurate as the pipeline
 * moves without an extra endpoint.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { employersApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';

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

function statusPill(status) {
  switch (status) {
    case 'open': return { cls: 'pill-active', label: 'Active' };
    case 'closed': return { cls: 'pill-paused', label: 'Closed' };
    case 'archived': return { cls: 'pill-rejected', label: 'Archived' };
    case 'draft': return { cls: 'pill-review', label: 'Draft' };
    default: return { cls: 'pill-active', label: status || '—' };
  }
}

export default function DashboardCompany() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [topApplicants, setTopApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, jobsData] = await Promise.all([
          employersApi.dashboardStats(),
          employersApi.jobs.list({ page: 1, limit: 10 }),
        ]);
        if (cancelled) return;
        setStats(statsData || null);
        const jobList = jobsData?.records || [];
        setJobs(jobList);

        // Pull applicants from the most-applied job so the second panel
        // always has something to render without N requests.
        const topJob = [...jobList].sort((a, b) => (b.applications_count || 0) - (a.applications_count || 0))[0];
        if (topJob) {
          try {
            const applicants = await employersApi.jobs.applicants(topJob.id, { page: 1, limit: 5 });
            if (!cancelled) setTopApplicants((applicants?.records || []).map((a) => ({ ...a, _jobTitle: topJob.title })));
          } catch { /* fall through */ }
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const funnel = useMemo(() => {
    const by = stats?.applications?.by_status || {};
    const total = stats?.applications?.total ?? 0;
    const pct = (v) => total ? Math.round((v / total) * 100) : 0;
    const buckets = [
      { key: 'applied', label: 'Applied', count: by.applied || 0, cls: '' },
      { key: 'reviewing', label: 'Reviewed', count: (by.reviewing || 0) + (by.shortlisted || 0) + (by.interview || 0) + (by.offered || 0) + (by.hired || 0), cls: '' },
      { key: 'shortlisted', label: 'Shortlisted', count: (by.shortlisted || 0) + (by.interview || 0) + (by.offered || 0) + (by.hired || 0), cls: 'gold' },
      { key: 'interview', label: 'Interviewed', count: (by.interview || 0) + (by.offered || 0) + (by.hired || 0), cls: 'coral' },
      { key: 'offered', label: 'Offered', count: (by.offered || 0) + (by.hired || 0), cls: 'sage' },
      { key: 'hired', label: 'Hired', count: by.hired || 0, cls: 'sage' },
    ];
    return buckets.map((b) => ({ ...b, percent: pct(b.count) }));
  }, [stats]);

  async function moderate(applicationId, action) {
    setBusyId(applicationId);
    try {
      if (action === 'shortlist') await employersApi.applications.shortlist(applicationId);
      if (action === 'reject') await employersApi.applications.reject(applicationId, '');
      setTopApplicants((list) => list.map((a) => a.id === applicationId
        ? { ...a, status: action === 'shortlist' ? 'shortlisted' : 'rejected' }
        : a));
    } catch (_e) {
      /* surface via shared ErrorState if needed; the row keeps its old state */
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="view active" id="view-dash-company" style={{ background: 'var(--bone)' }}>
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your hiring dashboard…" />
        </div>
      </section>
    );
  }

  const company = stats?.company || {};
  const appsTotal = stats?.applications?.total ?? 0;
  const inReview = stats?.applications?.by_status?.reviewing ?? 0;
  const hired = stats?.applications?.by_status?.hired ?? 0;

  return (
    <section className="view active" id="view-dash-company" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Employer · Growth plan</div>
            <div className="dash-side-name">
              <div className="dash-side-avatar lg-2">{initials(company.name || user?.full_name)}</div>
              {company.name || 'Your company'}
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Dashboard</a></li>
            <li><a><span className="ic">▤</span> Job Postings <span className="badge">{stats?.jobs_total ?? jobs.length}</span></a></li>
            <li><a><span className="ic">◉</span> Applicants <span className="badge">{appsTotal}</span></a></li>
            <li><a><span className="ic">★</span> Shortlists <span className="badge">{stats?.applications?.by_status?.shortlisted ?? 0}</span></a></li>
            <li><a><span className="ic">☎</span> Interviews <span className="badge">{stats?.interviews?.scheduled ?? 0}</span></a></li>
            <li><Link to="/candidates"><span className="ic">⌕</span> Talent Search</Link></li>
            <li><a><span className="ic">◧</span> Company Profile</a></li>
            <div className="dash-nav-section">Insights</div>
            <li><a><span className="ic">▲</span> Analytics</a></li>
            <div className="dash-nav-section">Account</div>
            <li><a><span className="ic">⚙</span> Team & Billing</a></li>
            <li><a onClick={logout} style={{ cursor: 'pointer' }}><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Hiring at <span className="ital">{company.name || 'your company'}</span>.</h1>
              <p>
                {appsTotal} application{appsTotal === 1 ? '' : 's'} · {stats?.interviews?.scheduled ?? 0} interview{stats?.interviews?.scheduled === 1 ? '' : 's'} scheduled
              </p>
            </div>
            <div className="dash-topbar-actions">
              <button className="btn btn-coral" type="button">+ Post new job</button>
            </div>
          </div>

          {error && <ErrorState error={error} />}

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Active jobs<div className="stat-icon">▤</div></div>
              <div className="stat-value">{jobs.filter((j) => j.status === 'open').length}</div>
              <div className="stat-trend">{jobs.length} total</div>
            </div>
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Total applicants<div className="stat-icon">◉</div></div>
              <div className="stat-value">{appsTotal}</div>
              <div className="stat-trend">All-time</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In review<div className="stat-icon">⌕</div></div>
              <div className="stat-value">{inReview}</div>
              <div className="stat-trend">Awaiting decision</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Hired<div className="stat-icon">✓</div></div>
              <div className="stat-value">{hired}</div>
              <div className="stat-trend">All-time</div>
            </div>
          </div>

          <div className="dash-panel" style={{ marginBottom: 24 }}>
            <div className="dash-panel-head">
              <h3>Active job postings</h3>
              <a>Manage all →</a>
            </div>
            {jobs.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>No jobs posted yet. Use "Post new job" to create your first listing.</p>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr><th>Position</th><th>Applicants</th><th>Views</th><th>Posted</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const pill = statusPill(j.status);
                    return (
                      <tr key={j.id}>
                        <td>
                          <div className="table-co">
                            <div className="mini-logo lg-1">{(company.name || '·')[0]}</div>
                            <div>
                              <strong>{j.title}</strong>
                              <small>
                                {[j.location, j.is_remote ? 'Remote' : null].filter(Boolean).join(' · ')}
                                {j.salary_min && j.salary_max ? ` · $${Math.round(j.salary_min/1000)}–${Math.round(j.salary_max/1000)}K` : ''}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td><strong style={{ fontFamily: "'Fraunces',serif" }}>{j.applications_count ?? 0}</strong></td>
                        <td>{j.views_count ?? 0}</td>
                        <td>{relative(j.published_at || j.created_at)}</td>
                        <td><span className={`pill ${pill.cls}`}>{pill.label}</span></td>
                        <td><div className="row-actions"><button className="icon-btn">✎</button></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent applicants <small>· top job</small></h3>
                <a>View all →</a>
              </div>
              {topApplicants.length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No applicants yet on your jobs.</p>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr><th>Candidate</th><th>Applied for</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {topApplicants.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div className="table-co">
                            <div className="cand-tiny lg-1">{initials(a.candidate_name)}</div>
                            <div>
                              <strong>{a.candidate_name || 'Candidate'}</strong>
                              <small>{a.location || a.headline || ''}{a.years_experience != null ? ` · ${a.years_experience}+ yrs` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td><small>{a._jobTitle}</small></td>
                        <td><span className="pill pill-active">{a.status}</span></td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn success" type="button" disabled={busyId === a.id} onClick={() => moderate(a.id, 'shortlist')}>✓</button>
                            <button className="icon-btn danger" type="button" disabled={busyId === a.id} onClick={() => moderate(a.id, 'reject')}>×</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Hiring funnel</h3>
              </div>
              <div className="funnel">
                {funnel.map((b) => (
                  <div key={b.key} className="funnel-row">
                    <span>{b.label}</span>
                    <div className="funnel-bar">
                      <div className={`funnel-fill ${b.cls}`} style={{ width: `${Math.max(b.percent, 4)}%` }}>{b.count}</div>
                    </div>
                    <strong>{b.percent}%</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line-soft)', fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Total applications</span>
                  <strong style={{ color: 'var(--ink)', fontFamily: "'Fraunces',serif" }}>{appsTotal}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Conversion to hire</span>
                  <strong style={{ color: 'var(--ink)', fontFamily: "'Fraunces',serif" }}>
                    {appsTotal ? `${Math.round((hired / appsTotal) * 100)}%` : '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
