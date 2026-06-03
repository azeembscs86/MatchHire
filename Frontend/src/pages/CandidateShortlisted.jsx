/**
 * CandidateShortlisted — "Shortlisted Applications" dashboard tab.
 *
 * Lives under CandidateDashboardLayout so the sidebar stays anchored.
 * Surfaces applications the employer has moved into the shortlist
 * stage — separated from the active My Applications pipeline so the
 * candidate can read the most promising rows in one focused list.
 *
 * Mirrors the structure of `CandidateRejected.jsx` (same dashboard
 * page-header chrome, same `<JobCard />` rendering, same
 * `.application-card-wrap` shell with a status pill row above)
 * so the three application-status surfaces (Applications,
 * Shortlisted, Rejected, Withdrawn) feel like siblings.
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

export default function CandidateShortlisted() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `statuses: ['shortlisted']` is the canonical inclusion filter
      // honoured by the candidate applications list endpoint. The
      // backend's listForCandidate prioritises `statuses` ahead of
      // `exclude_statuses`, so this returns only shortlisted rows.
      const list = await candidatesApi.applications.list({
        page: 1,
        limit: 100,
        statuses: ['shortlisted'],
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
      id="view-candidate-shortlisted"
      data-testid="candidate-shortlisted-page"
    >
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ★ Shortlisted applications · {records.length}
          </span>
          <h1 className="display">
            You made the <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>shortlist</span>.
          </h1>
          <p>
            Roles where the employer has moved you forward. Prepare your portfolio + interview stories — these are the strongest active conversations.
          </p>
        </div>
      </div>

      <div className="container" style={{ padding: '32px 0 80px' }}>
        {loading ? (
          <LoadingState label="Loading your shortlisted applications…" />
        ) : error ? (
          <ErrorState error={error} />
        ) : records.length === 0 ? (
          <EmptyState
            title="No shortlisted applications yet"
            message="When an employer shortlists one of your applications it'll appear here with the latest signals from each role."
          >
            <Link to="/dashboard/candidate/applications" className="btn btn-coral" style={{ marginTop: 12 }}>
              View active applications →
            </Link>
          </EmptyState>
        ) : (
          <div className="jobs-grid" data-testid="shortlisted-applications-list">
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
                match_score: row.match_score,
                reasons: row.reasons,
                missing: row.missing,
              });
              if (!view) return null;
              return (
                <div key={row.id} className="application-card-wrap" data-testid="shortlisted-application-row">
                  <div className="application-status-row">
                    <span className="pill pill-shortlisted" data-testid="shortlisted-status">Shortlisted</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Applied {formatDate(row.applied_at)} · Shortlisted {formatDate(row.updated_at)}
                    </span>
                  </div>
                  <JobCard
                    job={view}
                    applied
                    featured={!!row.is_featured}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
