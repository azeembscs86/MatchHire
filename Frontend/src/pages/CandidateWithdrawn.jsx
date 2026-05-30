/**
 * CandidateWithdrawn — "Withdrawn Applications" dashboard tab.
 *
 * Lives under the standard CandidateDashboardLayout so the sidebar
 * stays anchored. Strictly shows applications the candidate has
 * withdrawn — separating active pipeline (`/dashboard/candidate/
 * applications`) from terminal-pull-outs keeps each surface
 * focused.
 *
 * Each row shows: job title, company, location, salary, job type,
 * applied date, withdrawn date, and two affordances:
 *
 *   - **View job** — opens `/jobs/:id`. Always available.
 *   - **Reapply** — same `/jobs/:id` deep-link; the JobDetail page
 *      now resurfaces the Apply button once a candidate is in
 *      withdrawn / rejected state (the backend's active-application
 *      filter no longer treats those rows as "still applied").
 *
 * Empty state mirrors the active Applications tab's voice with a
 * link back to the Jobs feed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { candidatesApi } from '../api/index.js';

/**
 * Format a salary range using the same conventions as the candidate-side
 * JobCard. Returns "$120K–180K", "From $90K", "Up to $200K", or
 * "Competitive" when nothing is set.
 */
function formatSalary(min, max, currency = 'USD') {
  if (!min && !max) return 'Competitive';
  const sym = currency === 'USD' ? '$' : `${currency} `;
  const k = (n) => `${Math.round(Number(n) / 1000)}K`;
  if (min && max) return `${sym}${k(min)}–${k(max)}`;
  if (min) return `From ${sym}${k(min)}`;
  return `Up to ${sym}${k(max)}`;
}

function formatJobType(t) {
  if (!t) return 'Onsite';
  return String(t).replace(/_/g, '-').replace(/(^|-)([a-z])/g, (_m, p, c) => (p ? '-' : '') + c.toUpperCase());
}

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
            message="When you withdraw an application it'll appear here. Active applications live in the Job Applications tab."
          >
            <Link to="/dashboard/candidate/applications" className="btn btn-coral" style={{ marginTop: 12 }}>
              View active applications →
            </Link>
          </EmptyState>
        ) : (
          <div className="withdrawn-list" data-testid="withdrawn-applications-list">
            {records.map((row) => {
              const jobId = row.job_id ?? row.id;
              const title = row.job_title ?? row.title ?? 'Job';
              const company = row.company_name || 'Company';
              const loc = [row.city, row.country].filter(Boolean).join(' · ')
                || row.job_location || row.location || 'Remote';
              const salary = formatSalary(row.salary_min, row.salary_max, row.salary_currency);
              const jobType = formatJobType(row.job_type);
              return (
                <div key={row.id} className="withdrawn-card" data-testid="withdrawn-application-row">
                  <div className="withdrawn-card-head">
                    <div className="withdrawn-card-title">
                      <Link to={`/jobs/${jobId}`} className="withdrawn-card-link">
                        {title}
                      </Link>
                      <div className="withdrawn-card-co">{company} · {loc}</div>
                    </div>
                    <span className="pill pill-rejected" data-testid="withdrawn-status">Withdrawn</span>
                  </div>
                  <dl className="withdrawn-meta">
                    <div><dt>Salary</dt><dd>{salary}</dd></div>
                    <div><dt>Job type</dt><dd>{jobType}</dd></div>
                    <div><dt>Applied</dt><dd>{formatDate(row.applied_at)}</dd></div>
                    <div><dt>Withdrawn</dt><dd>{formatDate(row.updated_at)}</dd></div>
                  </dl>
                  <div className="withdrawn-card-actions">
                    <Link to={`/jobs/${jobId}`} className="btn btn-outline btn-sm" data-testid="withdrawn-view-job">
                      View job
                    </Link>
                    <Link
                      to={`/jobs/${jobId}`}
                      className="btn btn-coral btn-sm"
                      data-testid="withdrawn-reapply"
                      title="Reapply from the job detail page"
                    >
                      Reapply →
                    </Link>
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
