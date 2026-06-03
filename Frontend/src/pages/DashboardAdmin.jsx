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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, pendingData, usersData, auditData, healthData, trendsData] = await Promise.all([
          adminApi.dashboardStats(),
          adminApi.companies.pending({ page: 1, limit: 6 }),
          adminApi.users.list({ page: 1, limit: 6 }),
          adminApi.auditLogs({ page: 1, limit: 6 }).catch(() => ({ records: [] })),
          adminApi.healthSummary().catch(() => null),
          adminApi.searchTrends({ days: 7 }).catch(() => null),
        ]);
        if (cancelled) return;
        setStats(statsData || null);
        setPending(pendingData?.records || []);
        setUsers(usersData?.records || []);
        setAudit(auditData?.records || []);
        setHealth(healthData || null);
        setSearchTrends(trendsData || null);
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
            <div className="stat-card">
              <div className="stat-label">Job listings<div className="stat-icon">▤</div></div>
              <div className="stat-value">{Number(totalJobs).toLocaleString()}</div>
              <div className="stat-trend">Across all companies</div>
            </div>
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
        </div>
      </div>
    </section>
  );
}
