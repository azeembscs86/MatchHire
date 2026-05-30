/**
 * CandidateWithdrawn — "Withdrawn Applications" dashboard tab.
 *
 * Lives under the standard CandidateDashboardLayout so the sidebar
 * stays anchored. Strictly shows applications the candidate has
 * withdrawn — separating active pipeline (`/dashboard/candidate/
 * applications`) from terminal-pull-outs keeps each surface
 * focused.
 *
 * Card design unification (May 2031): this surface renders through
 * the same shared `<JobCard />` as the Jobs page (via
 * `toJobCardShape`) so the catalogue reads as one consistent
 * grid. Above each card we emit a small meta row carrying the
 * Withdrawn pill + applied / withdrawn timestamps. Below each
 * card we offer "Reapply" — the backend's active-application
 * filter no longer treats withdrawn rows as "still applied", so
 * the job is back in candidate-facing listings and the Apply
 * button on JobDetail is re-enabled.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import JobCard from '../components/JobCard.jsx';
import { candidatesApi } from '../api/index.js';
import { toJobCardShape } from '../api/adapters.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CandidateWithdrawn() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `statuses: ['withdrawn']` is the canonical inclusion filter
      // — the validator and repository both honour it. The page
      // size is generous because withdrawals are sparse vs the
      // active pipeline.
      const list = await candidatesApi.applications.list({
        page: 1,
        limit: 100,
        statuses: ['withdrawn'],
      });
      setRecords(list?.records || list?.rows || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section
      className="view active"
      id="view-candidate-withdrawn"
      data-testid="candidate-withdrawn-page"
    >
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ↶ Withdrawn applications · {records.length}
          </span>
          <h1 className="display">
            Roles you've <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>withdrawn from</span>.
          </h1>
          <p>
            A permanent record of every application you pulled out of. You can reapply if the role is still open.
          </p>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 0 80px' }}>
        {loading ? (
          <LoadingState label="Loading your withdrawn applications…" />
        ) : error ? (
          <ErrorState error={error} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No withdrawn applications"
            message="When you withdraw an application it'll appear here. Active applications live in the My Applications tab."
          >
            <Link to="/dashboard/candidate/applications" className="btn btn-coral" style={{ marginTop: 12 }}>
              View active applications →
            </Link>
          </EmptyState>
        ) : (
          <div className="jobs-grid" data-testid="withdrawn-applications-list">
            {records.map((row) => {
              // Build the same JobCard view-model the Jobs page
              // produces — keeping the data shape identical means
              // the card design is identical too.
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
              const jobId = row.job_id ?? row.id;
              return (
                <div key={row.id} className="application-card-wrap" data-testid="withdrawn-application-row">
                  <div className="application-status-row">
                    <span className="pill pill-rejected" data-testid="withdrawn-status">Withdrawn</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Applied {formatDate(row.applied_at)} · Withdrawn {formatDate(row.updated_at)}
                    </span>
                  </div>
                  <JobCard
                    job={view}
                    featured={!!row.is_featured}
                  />
                  {/*
                   * Reapply CTA below the card — keeps the card body
                   * identical to every other surface and the action
                   * row consistent with the Applications tab pattern.
                   */}
                  <Link
                    to={`/jobs/${jobId}`}
                    className="btn btn-coral btn-sm application-withdraw-btn"
                    data-testid="withdrawn-reapply"
                    title="Reopen the job to apply again"
                  >
                    Reapply →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
