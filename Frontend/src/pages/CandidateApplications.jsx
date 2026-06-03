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
// Rejection-reason decode helpers (parseRejectionReason / formatRejectedDate)
// were used by the inline rejection-feedback panel that previously sat
// beside each rejected card on this tab. The panel has moved to the Job
// Detail page (canonical "application detail" surface for the
// candidate), so those helpers are no longer imported here.

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
  // Unified candidate-side label across the project — matches the
  // overview page and the dashboard sidebar copy.
  interview:    { cls: 'pill-interview',   label: 'Interview Scheduled' },
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

// Withdrawal happens from the Job Detail page (or a future
// Application Detail page) — never from this list. The previous
// in-list withdraw button + confirmation modal moved to JobDetail in
// May 2026; this surface only renders the active pipeline. Rows with
// `status='withdrawn'` are excluded server-side via the
// `exclude_statuses` filter on /candidates/applications/list.

/**
 * Roll the flat `by_status` map from /candidates/dashboard/stats
 * into the six summary buckets shown above the list:
 *
 *   total       — every application row excluding withdrawals (the
 *                 Withdrawn tab has its own surface + count)
 *   review      — `reviewing` + `under_review`
 *   shortlisted — `shortlisted`
 *   interview   — `interview` (rendered as "Interview Scheduled")
 *   accepted    — `accepted` + `offered` + `hired`
 *   rejected    — `rejected`
 *
 * Withdrawn rows are deliberately not counted in this page's `total`
 * because the active-pipeline list itself excludes them.
 */
function rollupStats(stats) {
  const by = stats?.applications?.by_status || {};
  const review = (by.reviewing || 0) + (by.under_review || 0);
  const shortlisted = by.shortlisted || 0;
  const interview = by.interview || 0;
  const accepted = (by.accepted || 0) + (by.offered || 0) + (by.hired || 0);
  const rejected = by.rejected || 0;
  const applied = by.applied || 0;
  const total = applied + review + shortlisted + interview + accepted + rejected;
  return { total, review, shortlisted, interview, accepted, rejected };
}

/**
 * Statuses from which a candidate may still withdraw — mirrors the
 * backend's WITHDRAWABLE_STATUSES exactly so the Withdraw button on
 * each card matches what the API will actually honour.
 */
const WITHDRAWABLE_STATUSES = new Set([
  'applied', 'reviewing', 'under_review', 'shortlisted', 'interview', 'offered',
]);

export default function CandidateApplications() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Withdraw flow state. `withdrawTarget` holds the application row
  // pending confirmation; `withdrawing` guards the confirm button
  // while the request is in flight; `notice` surfaces success +
  // failure inline. Mirrors the pattern used on JobDetail.
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Withdrawn applications live on the dedicated "Withdrawn
      // Applications" tab — this surface is for the active pipeline
      // only. `exclude_statuses: ['withdrawn']` is the contract the
      // backend honours so the candidate's active list stays clean.
      const list = await candidatesApi.applications.list({
        page: 1,
        limit: 50,
        exclude_statuses: ['withdrawn'],
      });
      setRecords(list?.records || list?.rows || []);
    } catch (err) {
      setError(err);
    } finally {
      // Important: `loading` is gated on the LIST endpoint only.
      // The summary counts come from a separate dashboard-stats
      // call that we kick off below as fire-and-forget — a slow
      // or hanging stats endpoint must NOT block the grid render,
      // which was causing the page's Playwright spec to flake.
      setLoading(false);
    }
    // Fire-and-forget stats refresh. Failures are silent — the
    // summary tiles render rolled-up counts from `records` as a
    // fallback when `stats` is null (see `rollupStats(stats)`),
    // so the page stays usable even if this call never returns.
    candidatesApi.dashboardStats()
      .then((dashStats) => setStats(dashStats || null))
      .catch(() => { /* leave stats null; rollup falls back to records */ });
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Confirm-and-withdraw handler shared by the modal. Mirrors the
   * JobDetail withdraw flow: optimistic remove from the visible list,
   * inline success/failure notice, full re-fetch in the background so
   * the summary cards refresh.
   */
  async function confirmWithdraw() {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    setNotice(null);
    try {
      await candidatesApi.applications.withdraw(withdrawTarget.id);
      // The active list excludes withdrawn rows — drop it locally so
      // the row disappears immediately rather than waiting on the
      // re-fetch.
      setRecords((prev) => prev.filter((r) => r.id !== withdrawTarget.id));
      setNotice({ ok: true, text: 'Application withdrawn. It now lives in your Withdrawn Applications tab.' });
      setWithdrawTarget(null);
      load(); // refresh counts on the summary cards
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
        {notice && (
          <div
            role="status"
            className="applications-notice"
            data-testid="applications-notice"
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

        {/*
         * Six summary cards covering every stage of the active
         * pipeline (withdrawn rows have their own dedicated tab so
         * they're not counted here). Numbers come from the same
         * `/candidates/dashboard/stats` endpoint as the sidebar
         * badge, rolled into the user-facing buckets by
         * `rollupStats` above. Each card renders even when the
         * count is 0 so the row stays visible from day one.
         */}
        <div className="applications-summary" data-testid="applications-summary">
          <div className="fav-stat coral">
            <div className="fav-stat-icon">▤</div>
            <div className="fav-stat-value">{roll.total}</div>
            <div className="fav-stat-label">Total Applications</div>
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
            <div className="fav-stat-icon">☎</div>
            <div className="fav-stat-value">{roll.interview}</div>
            <div className="fav-stat-label">Interview Scheduled</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">✓</div>
            <div className="fav-stat-value">{roll.accepted}</div>
            <div className="fav-stat-label">Accepted</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">✕</div>
            <div className="fav-stat-value">{roll.rejected}</div>
            <div className="fav-stat-label">Rejected</div>
          </div>
        </div>

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
                description: row.description,
                // Match decoration added by the backend's
                // listApplications service (June 2031). Surfaces the
                // candidate's current match score + matched / missing
                // skills so the JobCard's "Why we recommend" slot has
                // real content and the card height matches the Jobs
                // page exactly.
                match_score: row.match_score,
                reasons: row.reasons,
                missing: row.missing,
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
                  {/*
                   * Pass `onWithdraw` only when the application is in
                   * a withdrawable pipeline state — terminal states
                   * (rejected, hired/accepted) keep the green
                   * "Applied" pill so the row reads as terminal.
                   * Capturing the row's id in the closure is safer
                   * than reading `job.id` because the JobCard view-
                   * model carries the job_id, not the application_id.
                   */}
                  <JobCard
                    job={view}
                    applied
                    featured={!!row.is_featured}
                    onWithdraw={WITHDRAWABLE_STATUSES.has(String(row.status || '').toLowerCase())
                      ? () => { setNotice(null); setWithdrawTarget(row); }
                      : undefined}
                    withdrawingId={withdrawing && withdrawTarget?.id === row.id ? view.id : null}
                  />
                  {/*
                   * Rejection reason intentionally NOT rendered here.
                   * Cards on My Applications stay lean (title /
                   * company / location / salary / status / applied
                   * date). The full rejection feedback panel —
                   * reason + improvement suggestions — now lives on
                   * the Job Detail page; clicking the card body or
                   * the View Job action opens it.
                   */}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/*
       * Withdraw confirmation modal — same `.confirm-overlay` / `.confirm-card`
       * pattern used on JobDetail. Clicking the backdrop (while not in flight)
       * cancels; the explicit Cancel + Confirm buttons run the standard flow.
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
              The job will reappear in your feed and the application will move to your Withdrawn Applications tab.
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
