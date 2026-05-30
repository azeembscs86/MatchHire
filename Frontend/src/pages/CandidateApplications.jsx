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
import { parseRejectionReason } from '../data/rejection-reasons.js';

/** Format the date the employer rejected an application. The
 * underlying column is `updated_at` because we don't (yet) store a
 * dedicated `rejected_at` — the status flip is the most recent
 * change on a rejected row, so updated_at is the correct proxy. */
function formatRejectedDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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

export default function CandidateApplications() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Withdrawn applications live on the dedicated "Withdrawn
      // Applications" tab — this surface is for the active pipeline
      // only. `exclude_statuses: ['withdrawn']` is the contract the
      // backend honours so the candidate's active list stays clean.
      const [list, dashStats] = await Promise.all([
        candidatesApi.applications.list({
          page: 1,
          limit: 50,
          exclude_statuses: ['withdrawn'],
        }),
        candidatesApi.dashboardStats().catch(() => null),
      ]);
      setRecords(list?.records || list?.rows || []);
      setStats(dashStats || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
              });
              if (!view) return null;
              const badge = statusBadge(row.status);
              const isRejected = String(row.status || '').toLowerCase() === 'rejected';
              // Decode the canonical rejection reason + improvement
              // suggestions for the rejected-application feedback
              // panel. Returns null for non-rejected rows or rejected
              // rows where the employer hasn't supplied a reason yet
              // (pre-validator legacy rows).
              const rejectionMeta = isRejected ? parseRejectionReason(row.rejection_reason) : null;
              const rejectedDate = isRejected ? formatRejectedDate(row.updated_at) : null;
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
                  {/*
                   * No withdraw button on the Applications tab — the
                   * withdraw flow now lives on the Job Detail page
                   * (open the job to withdraw). This keeps the list
                   * surface focused on browsing active applications.
                   */}
                  {isRejected && (
                    <div
                      className="rejection-feedback"
                      data-testid="rejection-feedback"
                      aria-label="Rejection feedback"
                    >
                      <div className="rejection-feedback-head">
                        <span className="rejection-feedback-label">Reason</span>
                        <span className="rejection-feedback-value">
                          {rejectionMeta?.label || 'Not specified'}
                        </span>
                        {rejectedDate && (
                          <span className="rejection-feedback-date">· {rejectedDate}</span>
                        )}
                      </div>
                      {rejectionMeta && rejectionMeta.suggestions.length > 0 && (
                        <div className="rejection-feedback-body">
                          <div className="rejection-feedback-title">Suggested improvements</div>
                          <ul className="rejection-feedback-list">
                            {rejectionMeta.suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
