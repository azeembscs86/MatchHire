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

// Withdrawal happens from the Job Detail page (or a future
// Application Detail page) — never from this list. The previous
// in-list withdraw button + confirmation modal moved to JobDetail in
// May 2026; this surface only renders the active pipeline. Rows with
// `status='withdrawn'` are excluded server-side via the
// `exclude_statuses` filter on /candidates/applications/list.

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
                  {/*
                   * No withdraw button on the Applications tab — the
                   * withdraw flow now lives on the Job Detail page
                   * (open the job to withdraw). This keeps the list
                   * surface focused on browsing active applications.
                   */}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
