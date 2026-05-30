/**
 * CandidateRejected — "Rejected Applications" dashboard tab.
 *
 * Lives under CandidateDashboardLayout so the sidebar stays anchored.
 * Strictly shows applications the employer has rejected — the active
 * pipeline + withdrawals each have their own dedicated surface.
 *
 * Each card uses the SAME `<JobCard />` rendered everywhere else in
 * the dashboard, wrapped by `.application-card-wrap` with a Rejected
 * pill + applied/rejected timestamps above and a `.rejection-feedback`
 * panel below carrying the canonical reason + tailored improvement
 * suggestions (decoded by `data/rejection-reasons.parseRejectionReason`).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import JobCard from '../components/JobCard.jsx';
import { candidatesApi } from '../api/index.js';
import { toJobCardShape } from '../api/adapters.js';
import { parseRejectionReason } from '../data/rejection-reasons.js';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CandidateRejected() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `statuses: ['rejected']` is the canonical inclusion filter
      // honoured by the candidate applications list endpoint.
      const list = await candidatesApi.applications.list({
        page: 1,
        limit: 100,
        statuses: ['rejected'],
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
      id="view-candidate-rejected"
      data-testid="candidate-rejected-page"
    >
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ✕ Rejected applications · {records.length}
          </span>
          <h1 className="display">
            Where you can <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>level up</span>.
          </h1>
          <p>
            Every application the employer decided wasn't a fit, with the reason and a few concrete improvement suggestions tailored to each rejection.
          </p>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 0 80px' }}>
        {loading ? (
          <LoadingState label="Loading your rejected applications…" />
        ) : error ? (
          <ErrorState error={error} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No rejected applications"
            message="When an employer rejects an application it'll appear here with feedback and suggestions you can act on."
          >
            <Link to="/dashboard/candidate/applications" className="btn btn-coral" style={{ marginTop: 12 }}>
              View active applications →
            </Link>
          </EmptyState>
        ) : (
          <div className="jobs-grid" data-testid="rejected-applications-list">
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
              const rejectionMeta = parseRejectionReason(row.rejection_reason);
              return (
                <div key={row.id} className="application-card-wrap" data-testid="rejected-application-row">
                  <div className="application-status-row">
                    <span className="pill pill-rejected" data-testid="rejected-status">Rejected</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Applied {formatDate(row.applied_at)} · Rejected {formatDate(row.updated_at)}
                    </span>
                  </div>
                  <JobCard
                    job={view}
                    applied
                    featured={!!row.is_featured}
                  />
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
