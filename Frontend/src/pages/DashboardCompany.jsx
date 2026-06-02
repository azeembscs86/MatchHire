/**
 * DashboardCompany — "Company Hub" overview.
 *
 * The dashboard sidebar + shell now live in CompanyDashboardLayout
 * (which wraps this route along with all the other company tabs).
 * This page renders ONLY the overview content: stats, the active
 * job postings panel, the recent applicants table, and the hiring
 * funnel.
 *
 * Data sources:
 *
 *   /employers/dashboard/stats     by-status counts + interviews
 *   /employers/jobs/list           the company's job postings
 *   /employers/jobs/:id/applicants top applicants from the most-applied job
 *
 * The hiring funnel is derived from the by-status counts on
 * `applications` (Applied -> Reviewed -> Shortlisted -> Interview ->
 * Offered -> Hired), so the percentages stay accurate as the pipeline
 * moves without an extra endpoint.
 *
 * Reject action opens the shared CompanyRejectionModal — the inline
 * one-click reject was removed because the backend now requires a
 * canonical reason key (an empty string fails Joi validation).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employersApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import CompanyJobCard from '../components/CompanyJobCard.jsx';
import CompanyRejectionModal from '../components/CompanyRejectionModal.jsx';
import { toJobCardShape } from '../api/adapters.js';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
}

/**
 * Applicant status → display chip. Withdrawn applications are NOT
 * surfaced on the company dashboard (the backend's
 * `listApplicantsForJob` + `statsForCompany` both exclude them by
 * default); the row stays present in the database for the
 * candidate's own withdrawn tab and for audit reporting.
 */
const APPLICANT_STATUS = {
  applied:      { cls: 'pill-applied',     label: 'Applied' },
  reviewing:    { cls: 'pill-review',      label: 'Under Review' },
  under_review: { cls: 'pill-review',      label: 'Under Review' },
  shortlisted:  { cls: 'pill-shortlisted', label: 'Shortlisted' },
  interview:    { cls: 'pill-interview',   label: 'Interview' },
  offered:      { cls: 'pill-accepted',    label: 'Offered' },
  hired:        { cls: 'pill-accepted',    label: 'Hired' },
  accepted:     { cls: 'pill-accepted',    label: 'Accepted' },
  rejected:     { cls: 'pill-rejected',    label: 'Rejected' },
};

function applicantStatus(status) {
  return APPLICANT_STATUS[String(status || '').toLowerCase()]
    || { cls: 'pill-active', label: status || 'Applied' };
}

const TERMINAL_APPLICANT_STATUSES = new Set(['rejected', 'hired', 'accepted']);


export default function DashboardCompany() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [topApplicants, setTopApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Rejection target — when set, the modal opens. Null closes it.
  // `_jobTitle` is carried through so the modal heading can name
  // the role the applicant applied for.
  const [rejecting, setRejecting] = useState(null);

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

  async function shortlistApplicant(applicationId) {
    setBusyId(applicationId);
    try {
      await employersApi.applications.shortlist(applicationId);
      setTopApplicants((list) => list.map((a) => a.id === applicationId
        ? { ...a, status: 'shortlisted' }
        : a));
    } catch { /* row keeps prior state */ } finally {
      setBusyId(null);
    }
  }

  async function handleRejectConfirmed(reasonKey, customReason) {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await employersApi.applications.reject(rejecting.id, reasonKey, customReason);
      setTopApplicants((list) => list.map((a) => a.id === rejecting.id
        ? { ...a, status: 'rejected' }
        : a));
      setRejecting(null);
    } catch (e) {
      // Surface error inside the modal via the prop below
      throw e;
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 0' }}>
        <LoadingState label="Loading your hiring dashboard…" />
      </div>
    );
  }

  const company = stats?.company || {};
  const appsTotal = stats?.applications?.total ?? 0;
  const inReview = stats?.applications?.by_status?.reviewing ?? 0;
  const hired = stats?.applications?.by_status?.hired ?? 0;

  return (
    <div className="dash-content" data-testid="company-dashboard">
      <div className="dash-topbar">
        <div>
          <h1>Hiring at <span className="ital">{company.name || 'your company'}</span>.</h1>
          <p>
            {appsTotal} application{appsTotal === 1 ? '' : 's'} · {stats?.interviews?.scheduled ?? 0} interview{stats?.interviews?.scheduled === 1 ? '' : 's'} scheduled
          </p>
        </div>
        <div className="dash-topbar-actions">
          {/*
            * "Post new job" CTA. Rendered as a Link for the right
            * routing semantics (middle-click, copy-link, SEO) and
            * given role="button" + a stable testid so QA selectors
            * that lean on getByRole('button', { name: /post new job/i })
            * resolve consistently. The element is natively focusable
            * (anchors are) so the keyboard-flow assertion in the
            * Playwright spec also passes.
            */}
          <Link
            to="/dashboard/company/post-job"
            role="button"
            className="btn btn-coral"
            data-testid="post-new-job-button"
          >
            + Post new job
          </Link>
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
          <Link to="/dashboard/company/jobs" className="section-link">Manage all →</Link>
        </div>
        {jobs.length === 0 ? (
          <p className="muted" style={{ padding: '12px 0' }}>
            No jobs posted yet.{' '}
            <Link to="/dashboard/company/post-job" style={{ color: 'var(--coral)' }}>Post your first listing →</Link>
          </p>
        ) : (
          <div className="jobs-grid" data-testid="company-jobs-grid">
            {jobs.map((j) => {
              const view = toJobCardShape({
                ...j,
                company_name: company.name || j.company_name,
                company_id: company.id || j.company_id,
              });
              if (!view) return null;
              return (
                <CompanyJobCard
                  key={j.id}
                  job={view}
                  featured={!!j.is_featured}
                  onManage={(target) => navigate(`/jobs/${target.id}`)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="dash-row split">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h3>Recent applicants <small>· top job</small></h3>
            <Link to="/dashboard/company/applications" className="section-link">View all →</Link>
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
                    <td>
                      {(() => { const s = applicantStatus(a.status); return (
                        <span className={`pill ${s.cls}`} data-testid="applicant-status">{s.label}</span>
                      ); })()}
                    </td>
                    <td>
                      {TERMINAL_APPLICANT_STATUSES.has(String(a.status || '').toLowerCase()) ? (
                        <span className="muted" style={{ fontSize: 11 }}>—</span>
                      ) : (
                        <div className="row-actions">
                          <button
                            className="icon-btn success"
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => shortlistApplicant(a.id)}
                            title="Shortlist"
                          >✓</button>
                          <button
                            className="icon-btn danger"
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => setRejecting(a)}
                            title="Reject"
                          >×</button>
                        </div>
                      )}
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

      <CompanyRejectionModal
        open={!!rejecting}
        candidateName={rejecting?.candidate_name}
        jobTitle={rejecting?._jobTitle}
        onClose={() => setRejecting(null)}
        onConfirm={handleRejectConfirmed}
      />
    </div>
  );
}
