/**
 * CompanyJobs — "My Job Postings" tab.
 *
 * Lists every job posted by the logged-in employer's company,
 * paginated client-side from `employersApi.jobs.list`. Each row
 * renders through the shared `CompanyJobCard` so the chrome
 * (status pill, applicants count, views, deadline) matches the
 * dashboard overview's job grid exactly — same component, no
 * duplicate layouts.
 *
 * Status filter chips reuse the canonical job statuses from the
 * backend. `admin_status` (pending / approved / rejected) is
 * shown as a contextual pill on the card itself via the existing
 * `statusBadge` logic in JobCard.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employersApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import CompanyJobCard from '../components/CompanyJobCard.jsx';
import ReactivateJobModal from '../components/ReactivateJobModal.jsx';
import { toJobCardShape } from '../api/adapters.js';

/**
 * Derive whether a company job is "expired" — i.e. its
 * `application_deadline` has passed. We treat this as a soft state
 * (the row stays `status='open'` until the company explicitly
 * closes / archives it) so a reactivation is just "extend the
 * deadline" + optional content edits. Mirrors the same `isExpired`
 * computation toJobCardShape does for candidates.
 */
function isJobExpired(raw) {
  if (!raw?.application_deadline) return false;
  const ts = new Date(raw.application_deadline).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts < Date.now();
}

const STATUS_FILTERS = [
  { key: '',         label: 'All' },
  { key: 'open',     label: 'Active' },
  { key: 'draft',    label: 'Draft' },
  { key: 'closed',   label: 'Closed' },
  { key: 'archived', label: 'Archived' },
];

export default function CompanyJobs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [companyName, setCompanyName] = useState(null);
  // Reactivate-flow state. `target` is the raw job row (not the
  // card view-model) so the modal can pre-fill its content
  // fields from the persisted values.
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [list, stats] = await Promise.all([
          employersApi.jobs.list({ page: 1, limit: 100, status: filter || undefined }),
          employersApi.dashboardStats().catch(() => null),
        ]);
        if (cancelled) return;
        setJobs(list?.records || []);
        if (stats?.company?.name) setCompanyName(stats.company.name);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filter, user?.id]);

  const counts = useMemo(() => {
    const out = { all: jobs.length, open: 0, draft: 0, closed: 0, archived: 0, expired: 0 };
    jobs.forEach((j) => {
      if (out[j.status] != null) out[j.status] += 1;
      if (isJobExpired(j)) out.expired += 1;
    });
    return out;
  }, [jobs]);

  /**
   * Reactivate handler. Calls the new /employers/jobs/:id/reactivate
   * endpoint; the modal owns the payload shape so this just hands
   * it over. On success we toast the message, close the modal,
   * and refetch the jobs list so the row's deadline + admin_status
   * reflect the latest server state.
   */
  async function handleReactivateConfirm(payload) {
    if (!reactivateTarget) return;
    const res = await employersApi.jobs.reactivate(reactivateTarget.id, payload);
    setReactivateTarget(null);
    setNotice({
      ok: true,
      text: res?.requires_approval
        ? 'Reactivation submitted — super-admin will re-approve before the job goes live.'
        : 'Job reactivated — back in the public feed now.',
    });
    // Refetch the jobs list so the card's deadline + admin_status
    // update without a full page reload.
    try {
      const list = await employersApi.jobs.list({ page: 1, limit: 100, status: filter || undefined });
      setJobs(list?.records || []);
    } catch { /* keep existing rows on refetch failure */ }
    // Auto-clear the toast after 6 seconds.
    setTimeout(() => setNotice(null), 6000);
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 0' }}>
        <LoadingState label="Loading your job postings…" />
      </div>
    );
  }

  return (
    <div className="dash-content" data-testid="company-jobs-page">
      <div className="dash-topbar">
        <div>
          <h1>My <span className="ital">job postings</span>.</h1>
          <p>
            {jobs.length} {jobs.length === 1 ? 'posting' : 'postings'}
            {filter ? ` · filtering by ${filter}` : ''}
          </p>
        </div>
        {/* Mirror DashboardCompany's CTA — role="button" + the same
            stable testid so the Playwright suite resolves the
            CTA from either page through the same selector. */}
        <Link
          to="/dashboard/company/post-job"
          role="button"
          className="btn btn-coral"
          data-testid="post-new-job-button"
        >
          + Post new job
        </Link>
      </div>

      {error && <ErrorState error={error} />}

      <div className="fav-summary" style={{ marginBottom: 18 }} role="group" aria-label="Filter jobs by status">
        {STATUS_FILTERS.map((s) => {
          const count = s.key === '' ? counts.all : (counts[s.key] || 0);
          return (
            <button
              key={s.key || 'all'}
              type="button"
              className={`fav-stat${filter === s.key ? ' is-active' : ''}`}
              onClick={() => setFilter(s.key)}
              aria-pressed={filter === s.key}
              data-testid={`company-jobs-filter-${s.key || 'all'}`}
            >
              <div className="fav-stat-icon">{s.key === 'open' ? '◉' : s.key === 'draft' ? '✎' : s.key === 'closed' ? '✕' : s.key === 'archived' ? '⊘' : '▤'}</div>
              <div className="fav-stat-value">{count}</div>
              <div className="fav-stat-label">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Reactivation toast — appears for ~6s after a successful
          reactivation, then auto-clears. Two-toned (sage for
          live-immediately, coral for awaiting-approval). */}
      {notice && (
        <div
          role="status"
          style={{
            margin: '0 0 14px', padding: '10px 14px', borderRadius: 10,
            background: notice.ok ? '#e6f4ea' : '#fde9e3',
            color: notice.ok ? '#0f5132' : '#b3361b',
            fontSize: 13,
          }}
          data-testid="company-jobs-toast"
        >
          {notice.text}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="fav-empty">
          <div className="fav-empty-icon">▤</div>
          <h3>No job postings yet</h3>
          <p>Once you post a role, it'll appear here for moderation and tracking.</p>
          <Link to="/dashboard/company/post-job" className="btn btn-coral">Post your first job →</Link>
        </div>
      ) : (
        <div className="jobs-grid" data-testid="company-jobs-grid">
          {jobs.map((j) => {
            const view = toJobCardShape({
              ...j,
              company_name: companyName || j.company_name,
            });
            if (!view) return null;
            const expired = isJobExpired(j);
            return (
              <div key={j.id} className="company-job-wrap" data-testid={expired ? 'company-job-expired' : 'company-job'}>
                <CompanyJobCard
                  job={view}
                  featured={!!j.is_featured}
                  onManage={(target) => navigate(`/jobs/${target.id}`)}
                />
                {expired && (
                  <div className="company-job-expired-actions" data-testid={`company-job-expired-actions-${j.id}`}>
                    <span className="pill pill-rejected" data-testid="company-job-expired-badge">Expired</span>
                    <button
                      type="button"
                      className="btn btn-coral btn-sm"
                      onClick={() => setReactivateTarget(j)}
                      data-testid={`reactivate-job-${j.id}`}
                    >
                      Reactivate job →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!error && jobs.length === 0 && <EmptyState title="Nothing posted yet" />}

      <ReactivateJobModal
        open={!!reactivateTarget}
        job={reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        onConfirm={handleReactivateConfirm}
      />
    </div>
  );
}
