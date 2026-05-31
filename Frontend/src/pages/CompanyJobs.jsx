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
import { toJobCardShape } from '../api/adapters.js';

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
    const out = { all: jobs.length, open: 0, draft: 0, closed: 0, archived: 0 };
    jobs.forEach((j) => { if (out[j.status] != null) out[j.status] += 1; });
    return out;
  }, [jobs]);

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
        <Link to="/dashboard/company/post-job" className="btn btn-coral" data-testid="company-jobs-post-cta">
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

      {!error && jobs.length === 0 && <EmptyState title="Nothing posted yet" />}
    </div>
  );
}
