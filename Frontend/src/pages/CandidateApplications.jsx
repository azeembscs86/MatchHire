/**
 * CandidateApplications — "My Applications" tab inside the
 * candidate dashboard shell (CandidateDashboardLayout).
 *
 * Strictly shows roles the logged-in candidate has applied to
 * — driven by `/candidates/applications/list`, which the
 * backend scopes to `applications.candidate_user_id = me`. We
 * never reach for the public /jobs feed here.
 *
 * Layout matches the other dashboard tabs (Favourites,
 * Saved-for-Later) so navigating between them feels seamless:
 *   - Page header with eyebrow + display heading
 *   - Four-card summary row (Total / Under Review / Shortlisted
 *     / Rejected+Accepted), the QA brief's required per-tab
 *     stats. Counts come from /candidates/dashboard/stats
 *     because the per-application list is paged.
 *   - JobCard grid with `applied={true}` so the apply row
 *     renders the "Already Applied" pill instead of the active
 *     Apply Now button.
 *   - Inline status badge above each card so the candidate can
 *     scan their pipeline state without opening the job.
 *
 * Empty state mirrors the rest of the dashboard's voice —
 * action-oriented copy + a link back to the Jobs feed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { candidatesApi } from '../api/index.js';
import { toJobCardShape } from '../api/adapters.js';

/**
 * Application status → display chip. Mirrors the candidate
 * dashboard's STATUS_PILL palette so a row reads the same on
 * the overview's recent-applications block and this dedicated
 * tab.
 */
const STATUS_BADGE = {
  applied:      { cls: 'pill-applied',     label: 'Applied' },
  reviewing:    { cls: 'pill-review',      label: 'Under Review' },
  under_review: { cls: 'pill-review',      label: 'Under Review' },
  shortlisted:  { cls: 'pill-shortlisted', label: 'Shortlisted' },
  interview:    { cls: 'pill-interview',   label: 'Interview' },
  offered:      { cls: 'pill-accepted',    label: 'Accepted' },
  hired:        { cls: 'pill-accepted',    label: 'Accepted' },
  accepted:     { cls: 'pill-accepted',    label: 'Accepted' },
  rejected:     { cls: 'pill-rejected',    label: 'Rejected' },
  withdrawn:    { cls: 'pill-rejected',    label: 'Withdrawn' },
};

function statusBadge(status) {
  return STATUS_BADGE[String(status || '').toLowerCase()]
    || { cls: 'pill-applied', label: status || 'Applied' };
}

/**
 * Statuses from which a candidate may still withdraw — mirrors the
 * backend's WITHDRAWABLE_STATUSES so the button only appears when the
 * API will actually honour it. Terminal states (withdrawn, rejected,
 * hired/accepted) hide the button.
 */
const WITHDRAWABLE_STATUSES = new Set([
  'applied', 'reviewing', 'under_review', 'shortlisted', 'interview', 'offered',
]);

function canWithdraw(status) {
  return WITHDRAWABLE_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * Count helpers so the four summary cards stay readable. The
 * dashboard stats endpoint returns a flat `by_status` map; we
 * group it into the user-facing buckets the brief asked for.
 */
function rollupStats(stats) {
  const by = stats?.applications?.by_status || {};
  const total = stats?.applications?.total ?? 0;
  const review = (by.reviewing || 0) + (by.under_review || 0);
  const shortlisted = by.shortlisted || 0;
  const decided = (by.rejected || 0) + (by.accepted || 0)
    + (by.offered || 0) + (by.hired || 0) + (by.withdrawn || 0);
  return { total, review, shortlisted, decided };
}

export default function CandidateApplications() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Withdraw flow: `withdrawTarget` holds the application row pending
  // confirmation; `withdrawing` guards the confirm button while the
  // request is in flight; `notice` surfaces success/failure inline.
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [list, dashStats] = await Promise.all([
        candidatesApi.applications.list({ page: 1, limit: 50 }),
        candidatesApi.dashboardStats().catch(() => null),
      ]);
      setRecords(list?.records || list?.rows || []);
      setStats(dashStats || null);
    } catch (err) {
      setError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmWithdraw() {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    setNotice(null);
    try {
      await candidatesApi.applications.withdraw(withdrawTarget.id);
      // Optimistically flip the row locally so the badge + button
      // update instantly, then re-sync list + stats in the
      // background so counts stay accurate.
      setRecords((prev) => prev.map((r) =>
        r.id === withdrawTarget.id ? { ...r, status: 'withdrawn' } : r));
      setNotice({ ok: true, text: 'Application withdrawn.' });
      setWithdrawTarget(null);
      load({ silent: true });
    } catch (err) {
      setNotice({ ok: false, text: err?.message || 'Could not withdraw application. Please try again.' });
    } finally {
      setWithdrawing(false);
    }
  }

  const roll = rollupStats(stats);

  return (
    <section
      className="view active"
      id="view-candidate-applications"
      data-testid="candidate-applications-page"
    >
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ▤ My Applications · {roll.total} total
          </span>
          <h1 className="display">
            Roles you've <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>applied to</span>.
          </h1>
          <p>
            Every application from your account in one place — with the latest status from each employer.
          </p>
        </div>
      </div>

      <div className="container" style={{ padding: '40px 0 80px' }}>
        {/*
         * Per-tab summary cards. The brief's required quartet:
         * Total / Under Review / Shortlisted / Rejected+Accepted.
         * Render 0 when no data so the row stays visible even
         * before any application exists.
         */}
        <div className="fav-summary" data-testid="applications-summary">
          <div className="fav-stat coral">
            <div className="fav-stat-icon">▤</div>
            <div className="fav-stat-value">{roll.total}</div>
            <div className="fav-stat-label">Total Applied</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">⌕</div>
            <div className="fav-stat-value">{roll.review}</div>
            <div className="fav-stat-label">Under Review</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">★</div>
            <div className="fav-stat-value">{roll.shortlisted}</div>
            <div className="fav-stat-label">Shortlisted</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">✓</div>
            <div className="fav-stat-value">{roll.decided}</div>
            <div className="fav-stat-label">Decided</div>
          </div>
        </div>

        {notice && (
          <div
            className="application-notice"
            role="status"
            style={{
              margin: '0 0 18px',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 13,
              background: notice.ok ? '#e6f4ea' : '#fde9e3',
              color: notice.ok ? '#0f5132' : '#b3361b',
              border: `1px solid ${notice.ok ? 'rgba(15,81,50,.2)' : 'rgba(179,54,27,.2)'}`,
            }}
          >
            {notice.text}
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading your applications…" />
        ) : error ? (
          <ErrorState error={error} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No applications yet"
            message="When you apply to a role from the Jobs feed it'll show up here with the latest status. Browse open roles to get started."
          >
            <Link to="/jobs" className="btn btn-coral" style={{ marginTop: 12 }}>
              Browse jobs →
            </Link>
          </EmptyState>
        ) : (
          <div className="jobs-grid" data-testid="applications-grid">
            {records.map((row) => {
              const view = toJobCardShape({
                id: row.job_id ?? row.id,
                title: row.job_title ?? row.title,
                company_id: row.company_id,
                company_name: row.company_name,
                company_logo: row.company_logo,
                location: row.job_location ?? row.location,
                city: row.city,
                country: row.country,
                is_remote: row.is_remote,
                work_mode: row.work_mode,
                is_global_remote: row.is_global_remote,
                job_type: row.job_type,
                experience_level: row.experience_level,
                salary_min: row.salary_min,
                salary_max: row.salary_max,
                salary_currency: row.salary_currency,
                salary_period: row.salary_period,
                application_deadline: row.application_deadline,
                skills_tags: row.skills_tags,
                published_at: row.published_at,
                created_at: row.job_created_at,
                is_featured: row.is_featured,
              });
              if (!view) return null;
              const badge = statusBadge(row.status);
              return (
                <div key={row.id} className="application-card-wrap">
                  <div className="application-status-row">
                    <span className={`pill ${badge.cls}`} data-testid="application-status">{badge.label}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Applied {row.applied_at ? new Date(row.applied_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <JobCard
                    job={view}
                    applied
                    featured={!!row.is_featured}
                  />
                  {/* Withdraw — only for applications still in an
                      active pipeline state. Sits below the card so it
                      never competes with the card's own click target. */}
                  {canWithdraw(row.status) && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm application-withdraw-btn"
                      data-testid="withdraw-application-button"
                      onClick={() => { setNotice(null); setWithdrawTarget(row); }}
                    >
                      Withdraw Application
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/*
       * Withdraw confirmation modal. Lightweight single-column
       * dialog (the app's main `.modal` is a two-column auth layout,
       * too heavy for a confirm). Closing via overlay click, the
       * Cancel button, or Escape-less backdrop keeps the flow
       * reversible until the candidate explicitly confirms.
       */}
      {withdrawTarget && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-title"
          onClick={() => { if (!withdrawing) setWithdrawTarget(null); }}
        >
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="withdraw-title" className="confirm-title">Withdraw application?</h3>
            <p className="confirm-body">
              You're about to withdraw your application for{' '}
              <strong>{withdrawTarget.job_title || withdrawTarget.title || 'this role'}</strong>
              {withdrawTarget.company_name ? <> at <strong>{withdrawTarget.company_name}</strong></> : null}.
              The employer will see that you withdrew, and this can't be undone.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setWithdrawTarget(null)}
                disabled={withdrawing}
              >
                Keep application
              </button>
              <button
                type="button"
                className="btn btn-coral"
                data-testid="withdraw-confirm-button"
                onClick={confirmWithdraw}
                disabled={withdrawing}
                aria-busy={withdrawing}
              >
                {withdrawing ? 'Withdrawing…' : 'Yes, withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
