/**
 * DashboardAdmin - "Admin Console".
 *
 * Platform-operator surface for admin and super_admin roles. Data sources:
 *
 *   /admin/dashboard/stats           aggregate users / jobs / companies / applications
 *   /admin/companies/pending         queue of companies awaiting verification
 *   /admin/users (filtered)          recent users (page 1, limit 6)
 *   /admin/health-summary            DB / Redis / uptime
 *   /admin/audit-logs                audit feed for the "flagged content" rail
 *
 * Approve / reject actions are wired to /admin/companies/:id/verify and
 * remove the row from the queue on success.
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../api/index.js';
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

function userStatusPill(status) {
  switch (status) {
    case 'active': return { cls: 'pill-verified', label: 'Verified' };
    case 'pending': return { cls: 'pill-pending', label: 'Pending' };
    case 'suspended': return { cls: 'pill-flagged', label: 'Suspended' };
    case 'inactive': return { cls: 'pill-rejected', label: 'Inactive' };
    default: return { cls: 'pill-verified', label: status || '—' };
  }
}

export default function DashboardAdmin() {
  const { logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [health, setHealth] = useState(null);
  // Aggregated search trends — feeds the "Search trends (7d)" panel.
  // Best-effort: a null fetch result just hides the panel.
  const [searchTrends, setSearchTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyCompanyId, setBusyCompanyId] = useState(null);
  // Pending job-approval queue — surfaced as a dedicated panel on
  // the admin overview so super-admin can clear the moderation
  // queue without leaving the dashboard. Per-row busy state guards
  // the Approve / Reject buttons during the API roundtrip.
  const [pendingJobs, setPendingJobs] = useState([]);
  const [busyJobId, setBusyJobId] = useState(null);
  // Inline reject-reason modal target (job row pending rejection).
  // null means the modal is closed.
  const [rejectingJob, setRejectingJob] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  // Pending candidate-approval queue. Reads from /admin/users with
  // role='candidate' + status='pending'. Approve flips status to
  // 'active'; reject flips to 'suspended' — both via the existing
  // /admin/users/:id/status endpoint that already audit-logs.
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [busyCandidateId, setBusyCandidateId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, pendingData, usersData, auditData, healthData, trendsData, pendingJobsData, pendingCandidatesData] = await Promise.all([
          adminApi.dashboardStats(),
          adminApi.companies.pending({ page: 1, limit: 6 }),
          adminApi.users.list({ page: 1, limit: 6 }),
          adminApi.auditLogs({ page: 1, limit: 6 }).catch(() => ({ records: [] })),
          adminApi.healthSummary().catch(() => null),
          adminApi.searchTrends({ days: 7 }).catch(() => null),
          // Pending job approvals — admin_status='pending' filter
          // exposes the moderation queue. Best-effort: a backend
          // error just hides the panel.
          adminApi.jobs.list({ admin_status: 'pending', page: 1, limit: 8 })
            .catch(() => ({ records: [] })),
          // Pending candidate approvals — role='candidate' +
          // status='pending'. The validator already accepts both
          // params (admin.validator.js listFilters).
          adminApi.users.list({ role: 'candidate', status: 'pending', page: 1, limit: 8 })
            .catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        setStats(statsData || null);
        setPending(pendingData?.records || []);
        setUsers(usersData?.records || []);
        setAudit(auditData?.records || []);
        setHealth(healthData || null);
        setSearchTrends(trendsData || null);
        setPendingJobs(pendingJobsData?.records || []);
        setPendingCandidates(pendingCandidatesData?.records || []);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function verify(companyId, action) {
    setBusyCompanyId(companyId);
    try {
      await adminApi.companies.verify(companyId, {
        verification_status: action === 'approve' ? 'verified' : 'rejected',
      });
      setPending((list) => list.filter((c) => c.id !== companyId));
    } catch (_e) {
      /* keep the row; user can retry */
    } finally {
      setBusyCompanyId(null);
    }
  }

  /**
   * Approve a pending job posting — flips `admin_status` to
   * 'approved' via the existing `/admin/jobs/:id/status` endpoint
   * (which also writes an audit-log entry server-side). On success
   * the row drops out of the local queue immediately so the
   * recruiter sees the change without a refresh.
   */
  async function approveJob(jobId) {
    setBusyJobId(jobId);
    try {
      await adminApi.jobs.setStatus(jobId, { admin_status: 'approved' });
      setPendingJobs((list) => list.filter((j) => j.id !== jobId));
    } catch (_e) {
      /* keep the row; super-admin can retry */
    } finally {
      setBusyJobId(null);
    }
  }

  /**
   * Reject flow — mandatory reason. The existing /admin/jobs/:id/status
   * validator accepts a free-text reason that lands in the audit log
   * (admin_audit_logs.meta.reason). Once the schema migration for
   * `jobs.rejection_reason` ships, the reason can also be surfaced
   * on the employer's My Jobs card; for now it's audit-only.
   */
  async function confirmRejectJob() {
    if (!rejectingJob) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setBusyJobId(rejectingJob.id);
    try {
      await adminApi.jobs.setStatus(rejectingJob.id, {
        admin_status: 'rejected',
        status: 'rejected',
        reason,
      });
      setPendingJobs((list) => list.filter((j) => j.id !== rejectingJob.id));
      setRejectingJob(null);
      setRejectReason('');
    } catch (_e) {
      /* keep modal open so super-admin can retry */
    } finally {
      setBusyJobId(null);
    }
  }

  /**
   * Candidate approval / rejection. Reuses /admin/users/:id/status
   * (already audit-logged server-side). Approve → 'active'
   * (full access). Reject → 'suspended' (account deactivated;
   * the per-request status guard added to candidate.routes will
   * block all subsequent candidate-only API calls).
   */
  async function moderateCandidate(candidateId, action) {
    setBusyCandidateId(candidateId);
    try {
      const nextStatus = action === 'approve' ? 'active' : 'suspended';
      await adminApi.users.setStatus(candidateId, { status: nextStatus });
      setPendingCandidates((list) => list.filter((c) => c.id !== candidateId));
    } catch (_e) {
      /* keep the row visible so admin can retry */
    } finally {
      setBusyCandidateId(null);
    }
  }

  if (loading) {
    return (
      <section className="view active" id="view-dash-admin" style={{ background: 'var(--bone)' }}>
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading admin console…" />
        </div>
      </section>
    );
  }

  const totalUsers = stats?.users?.total ?? 0;
  const totalCompanies = stats?.companies?.total ?? 0;
  const totalJobs = stats?.jobs?.total ?? 0;
  const totalApps = stats?.applications?.total ?? 0;

  return (
    <section className="view active" id="view-dash-admin" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Platform admin · Owner</div>
            <div className="dash-side-name">
              <div className="dash-side-avatar lg-7" style={{ background: 'var(--coral)', color: '#fff' }}>◉</div>
              Console
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Overview</a></li>
            <li><a><span className="ic">✓</span> Verifications <span className="badge">{pending.length}</span></a></li>
            <li><a><span className="ic">⚑</span> Audit logs <span className="badge">{audit.length}</span></a></li>
            <div className="dash-nav-section">Manage</div>
            <li><a><span className="ic">◉</span> Users · {Number(totalUsers).toLocaleString()}</a></li>
            <li><a><span className="ic">◆</span> Companies · {Number(totalCompanies).toLocaleString()}</a></li>
            <li><a><span className="ic">▤</span> Job Listings · {Number(totalJobs).toLocaleString()}</a></li>
            <div className="dash-nav-section">System</div>
            <li><a><span className="ic">▲</span> Health summary</a></li>
            <li><a><span className="ic">⎙</span> Logs & Audit</a></li>
            <li><a><span className="ic">⚙</span> Settings</a></li>
            <li><a onClick={logout} style={{ cursor: 'pointer' }}><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Admin <span className="ital">console</span>.</h1>
              <p>
                {pending.length} compan{pending.length === 1 ? 'y' : 'ies'} awaiting verification ·
                {' '}{audit.length} recent audit event{audit.length === 1 ? '' : 's'} ·
                {' '}{health?.database?.status === 'up' ? 'all systems normal' : 'check health summary'}
              </p>
            </div>
            <div className="dash-topbar-actions">
              <button className="btn btn-ghost" type="button">Audit log</button>
            </div>
          </div>

          {error && <ErrorState error={error} />}

          <div className="stat-row">
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Total users<div className="stat-icon">◉</div></div>
              <div className="stat-value">{Number(totalUsers).toLocaleString()}</div>
              <div className="stat-trend">All-time</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Companies<div className="stat-icon">◆</div></div>
              <div className="stat-value">{Number(totalCompanies).toLocaleString()}</div>
              <div className="stat-trend">{pending.length} pending</div>
            </div>
            {/*
              * Job listings tile — now clickable. The trend slot
              * surfaces the pending-moderation count so super-admin
              * sees the queue depth at a glance; clicking the tile
              * scrolls down to the Pending Job Approvals panel where
              * the row-level Approve / Reject buttons live.
              */}
            <button
              type="button"
              className="stat-card stat-card-clickable"
              onClick={() => {
                const el = document.getElementById('admin-pending-jobs');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              data-testid="admin-stat-jobs"
              style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
            >
              <div className="stat-label">Job listings<div className="stat-icon">▤</div></div>
              <div className="stat-value">{Number(totalJobs).toLocaleString()}</div>
              <div className="stat-trend">
                {Number(stats?.jobs?.pending || 0).toLocaleString()} pending approval →
              </div>
            </button>
            <div className="stat-card">
              <div className="stat-label">Applications<div className="stat-icon">$</div></div>
              <div className="stat-value">{Number(totalApps).toLocaleString()}</div>
              <div className="stat-trend">Platform-wide</div>
            </div>
            {/*
              * Hiring Rate — share of all-time applications that
              * reached `status='hired'`. Renders even at 0% so an
              * early-stage platform doesn't see a "missing" tile;
              * the trend line carries the absolute hire count.
              */}
            <div className="stat-card" data-testid="admin-hiring-rate">
              <div className="stat-label">Hiring rate<div className="stat-icon">✓</div></div>
              <div className="stat-value">
                {Number(stats?.hiring_rate ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                <small style={{ fontSize: 18, marginLeft: 2 }}>%</small>
              </div>
              <div className="stat-trend">
                {Number(stats?.applications?.hired ?? 0).toLocaleString()} hires of {Number(totalApps).toLocaleString()}
              </div>
            </div>
            {/*
              * User Activity — last-login signal aggregated server-
              * side. The 7-day number is the headline; the 24h
              * count rides in the trend slot so the recruiter can
              * gauge stickiness at a glance.
              */}
            <div className="stat-card" data-testid="admin-active-users">
              <div className="stat-label">Active users (7d)<div className="stat-icon">⚡</div></div>
              <div className="stat-value">{Number(stats?.activity?.last_7d ?? 0).toLocaleString()}</div>
              <div className="stat-trend">
                {Number(stats?.activity?.last_24h ?? 0).toLocaleString()} active in last 24h
              </div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Pending verifications <small>· {pending.length} awaiting review</small></h3>
                <a>View queue →</a>
              </div>
              {pending.length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No companies waiting for verification right now.</p>
              ) : (
                <div className="verify-list">
                  {pending.map((c) => (
                    <div key={c.id} className="verify-card">
                      <div className="co-logo lg-3">{(c.name || '·')[0]}</div>
                      <div className="verify-info">
                        <strong>{c.name}</strong>
                        <small>
                          {[c.slug || '', c.industry, c.location || c.country].filter(Boolean).join(' · ')}
                          {c.created_at ? ` · Submitted ${relative(c.created_at)}` : ''}
                        </small>
                      </div>
                      <div className="verify-actions">
                        <button
                          className="v-reject"
                          type="button"
                          disabled={busyCompanyId === c.id}
                          onClick={() => verify(c.id, 'reject')}
                        >
                          Reject
                        </button>
                        <button
                          className="v-approve"
                          type="button"
                          disabled={busyCompanyId === c.id}
                          onClick={() => verify(c.id, 'approve')}
                        >
                          ✓ Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>System health</h3>
                <span style={{ fontSize: 11, letterSpacing: '.05em', color: health?.database?.status === 'up' ? 'var(--sage)' : 'var(--coral)', fontWeight: 600 }}>
                  ● {health?.database?.status === 'up' ? 'ALL SYSTEMS NORMAL' : 'CHECK STATUS'}
                </span>
              </div>
              <div className="health-row"><span>API</span><span className="health-status">{health?.api?.status || 'up'}</span></div>
              <div className="health-row"><span>Database</span><span className={`health-status${health?.database?.status === 'up' ? '' : ' warn'}`}>{health?.database?.status || '—'}</span></div>
              <div className="health-row"><span>Redis cache</span><span className={`health-status${(health?.redis?.status || '').startsWith('up') ? '' : ' warn'}`}>{health?.redis?.status || '—'}</span></div>
              <div className="health-row"><span>Uptime</span><strong>{health?.uptime_seconds != null ? `${Math.floor(health.uptime_seconds / 60)}m` : '—'}</strong></div>
              <div className="health-row"><span>Node</span><strong>{health?.node_version || '—'}</strong></div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent users <small>· last signups</small></h3>
                <a>Manage all →</a>
              </div>
              {users.length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No users yet.</p>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr><th>User</th><th>Role</th><th>Joined</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const pill = userStatusPill(u.status);
                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="table-co">
                              <div className="cand-tiny lg-1">{initials(u.full_name)}</div>
                              <div>
                                <strong>{u.full_name || 'User'}</strong>
                                <small>{u.email}</small>
                              </div>
                            </div>
                          </td>
                          <td><small>{u.role}</small></td>
                          <td>{relative(u.created_at)}</td>
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
                <h3>Audit feed <small>· recent admin actions</small></h3>
              </div>
              {audit.length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No audit events yet.</p>
              ) : (
                <div className="timeline">
                  {audit.map((a) => (
                    <div key={a.id} className="tl-item">
                      <div className="tl-dot coral">⚑</div>
                      <div className="tl-content">
                        <strong>{a.action.replace(/_/g, ' ')}</strong>
                        <span>
                          {[
                            a.entity_type && a.entity_id ? `${a.entity_type}#${a.entity_id}` : null,
                            a.admin_name || a.admin_email,
                            relative(a.created_at),
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/*
            * Search trends panel — aggregated from `search_events`
            * over the trailing 7 days. Pulls the three signals the
            * moderation team cares about most:
            *   - top keywords (where demand is concentrating)
            *   - zero-result rate (search experience health)
            *   - conversion rate (search → application)
            * Hidden when the analytics call returns null (DB / cache
            * miss) rather than rendering an empty card.
            */}
          {searchTrends && (
            <div className="dash-panel" style={{ marginTop: 24 }} data-testid="admin-search-trends">
              <div className="dash-panel-head">
                <h3>Search trends <small>· last {searchTrends.window_days || 7} days · {Number(searchTrends.total_searches || 0).toLocaleString()} searches</small></h3>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
                  <span>Zero-result rate · <strong style={{ color: 'var(--ink)' }}>{searchTrends.zero_result_rate}%</strong></span>
                  <span>Conversion rate · <strong style={{ color: 'var(--ink)' }}>{searchTrends.conversion_rate}%</strong></span>
                </div>
              </div>
              {(searchTrends.top_keywords || []).length === 0 ? (
                <p className="muted" style={{ padding: '12px 0' }}>No searches recorded in this window.</p>
              ) : (
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th style={{ textAlign: 'right' }}>Searches</th>
                      <th style={{ textAlign: 'right' }}>Zero results</th>
                      <th style={{ textAlign: 'right' }}>Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchTrends.top_keywords.map((kw) => (
                      <tr key={kw.keyword}>
                        <td><strong style={{ fontFamily: "'Fraunces',serif" }}>{kw.keyword}</strong></td>
                        <td style={{ textAlign: 'right' }}>{kw.searches.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          {kw.dry_runs.toLocaleString()}
                          <small className="muted" style={{ marginLeft: 6 }}>
                            ({kw.searches ? Math.round((kw.dry_runs / kw.searches) * 100) : 0}%)
                          </small>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {kw.conversions.toLocaleString()}
                          <small className="muted" style={{ marginLeft: 6 }}>
                            ({kw.searches ? Math.round((kw.conversions / kw.searches) * 100) : 0}%)
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/*
            * Pending Job Approvals — the moderation queue. Reads
            * jobs.admin_status='pending' from /admin/jobs and lets
            * super-admin Approve / Reject inline. Approving flips
            * `admin_status` to 'approved' and the job rejoins the
            * public feed via `activeJobWhere()`; rejecting opens
            * the reason modal below and writes the reason into the
            * audit log alongside the status flip.
            */}
          {/*
            * Pending Candidate Approvals — same shape as the Pending
            * Job Approvals panel below. Inline Approve / Reject
            * buttons hit /admin/users/:id/status which flips
            * `users.status` and writes an audit log entry. After
            * the action, the row disappears from the queue; the
            * candidate's NEXT request is caught by the
            * `requireActiveAccount` middleware on candidate.routes
            * (which means a rejected candidate is locked out of
            * every candidate-only endpoint within one HTTP round-trip).
            */}
          <div
            className="dash-panel"
            style={{ marginTop: 24 }}
            id="admin-pending-candidates"
            data-testid="admin-pending-candidates"
          >
            <div className="dash-panel-head">
              <h3>Pending candidate approvals <small>· {pendingCandidates.length} awaiting review</small></h3>
            </div>
            {pendingCandidates.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>
                No candidates in the moderation queue right now. New candidate
                signups will appear here automatically.
              </p>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCandidates.map((c) => (
                    <tr key={c.id} data-testid={`pending-candidate-row-${c.id}`}>
                      <td>
                        <strong>{c.full_name || '—'}</strong>
                      </td>
                      <td><small>{c.email || '—'}</small></td>
                      <td><small>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</small></td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-btn success"
                            disabled={busyCandidateId === c.id}
                            onClick={() => moderateCandidate(c.id, 'approve')}
                            title="Approve candidate"
                            data-testid={`pending-candidate-approve-${c.id}`}
                          >✓</button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            disabled={busyCandidateId === c.id}
                            onClick={() => moderateCandidate(c.id, 'reject')}
                            title="Reject (deactivate) candidate"
                            data-testid={`pending-candidate-reject-${c.id}`}
                          >×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div
            className="dash-panel"
            style={{ marginTop: 24 }}
            id="admin-pending-jobs"
            data-testid="admin-pending-jobs"
          >
            <div className="dash-panel-head">
              <h3>Pending job approvals <small>· {pendingJobs.length} awaiting review</small></h3>
            </div>
            {pendingJobs.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>
                No jobs in the moderation queue right now. New company submissions
                will appear here automatically.
              </p>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Company</th>
                    <th>Posted</th>
                    <th>Salary</th>
                    <th>Location</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingJobs.map((j) => (
                    <tr key={j.id} data-testid={`pending-job-row-${j.id}`}>
                      <td>
                        <strong>{j.title}</strong>
                        {j.job_type && <small style={{ display: 'block', color: 'var(--muted)' }}>{j.job_type.replace(/_/g, ' ')}</small>}
                      </td>
                      <td><small>{j.company_name || '—'}</small></td>
                      <td><small>{j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}</small></td>
                      <td>
                        <small>
                          {j.salary_min && j.salary_max
                            ? `${Number(j.salary_min).toLocaleString()} – ${Number(j.salary_max).toLocaleString()} ${j.salary_currency || ''}`
                            : '—'}
                        </small>
                      </td>
                      <td><small>{j.location || j.country || '—'}</small></td>
                      <td>
                        <div className="row-actions">
                          <a
                            href={`/jobs/${j.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            title="View job"
                            data-testid={`pending-job-view-${j.id}`}
                          >↗</a>
                          <button
                            type="button"
                            className="icon-btn success"
                            disabled={busyJobId === j.id}
                            onClick={() => approveJob(j.id)}
                            title="Approve"
                            data-testid={`pending-job-approve-${j.id}`}
                          >✓</button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            disabled={busyJobId === j.id}
                            onClick={() => { setRejectingJob(j); setRejectReason(''); }}
                            title="Reject"
                            data-testid={`pending-job-reject-${j.id}`}
                          >×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/*
        * Reject-reason modal. Reuses the .modal / .modal-form chrome
        * shared with CompanyRejectionModal. Reason is mandatory —
        * the Reject button stays disabled until non-empty text.
        */}
      {rejectingJob && (
        <div
          className="modal-overlay open"
          onClick={(e) => { if (e.target === e.currentTarget && busyJobId !== rejectingJob.id) { setRejectingJob(null); setRejectReason(''); } }}
          data-testid="admin-reject-job-modal"
        >
          <div className="modal" style={{ maxWidth: 520, gridTemplateColumns: '1fr' }}>
            <button
              className="modal-close"
              onClick={() => { setRejectingJob(null); setRejectReason(''); }}
              aria-label="Close"
              type="button"
              disabled={busyJobId === rejectingJob.id}
            >×</button>
            <div className="modal-form" style={{ padding: '32px 28px' }}>
              <h2 style={{ marginBottom: 4 }}>Reject this job posting?</h2>
              <p className="muted" style={{ marginBottom: 16 }}>
                <strong>{rejectingJob.title}</strong>
                {rejectingJob.company_name ? <> · {rejectingJob.company_name}</> : null}.
                The reason is stored in the moderation audit log so the
                employer can read it on their My Jobs surface once the
                rejection-reason column ships.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                placeholder="Why is this posting being rejected? Be specific so the employer can fix it."
                rows={4}
                disabled={busyJobId === rejectingJob.id}
                data-testid="admin-reject-reason"
                style={{
                  width: '100%', padding: 10, borderRadius: 10,
                  border: '1px solid var(--line)', fontSize: 14,
                  resize: 'vertical', minHeight: 100,
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>
                {rejectReason.length}/500
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setRejectingJob(null); setRejectReason(''); }}
                  disabled={busyJobId === rejectingJob.id}
                >Cancel</button>
                <button
                  type="button"
                  className="btn btn-coral"
                  onClick={confirmRejectJob}
                  disabled={!rejectReason.trim() || busyJobId === rejectingJob.id}
                  data-testid="admin-reject-confirm"
                >
                  {busyJobId === rejectingJob.id ? 'Rejecting…' : 'Reject job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
