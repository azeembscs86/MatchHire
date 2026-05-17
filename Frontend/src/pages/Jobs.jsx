/**
 * Jobs listing page.
 *
 * Two-column layout: filter sidebar on the left, results on the right.
 * Filters - job type, remote, experience level, salary band, keyword,
 * location - are translated to query-string params on `/public/jobs`.
 *
 * The page reads `?keyword=` and `?location=` from the URL on first
 * render so the Home page's search bar can deep-link into a filtered
 * results view.
 *
 * Authenticated candidates see an "Apply now" action on each card,
 * which posts to `/candidates/applications/:jobId`. Other visitors see
 * the card without the action.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { publicApi, candidatesApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toJobCardShape } from '../api/adapters.js';

const JOB_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
];

const REMOTE_OPTIONS = [
  { label: 'Remote', value: true },
  { label: 'Onsite/Hybrid', value: false },
];

const LEVELS = [
  { value: 'entry', label: 'Entry level' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead/Staff' },
];

const SALARY_BANDS = [
  { label: '$50K – $80K', min: 50000, max: 80000 },
  { label: '$80K – $120K', min: 80000, max: 120000 },
  { label: '$120K – $180K', min: 120000, max: 180000 },
  { label: '$180K+', min: 180000, max: undefined },
];

const SORTS = [
  { value: 'latest', label: 'Most relevant' },
  { value: 'featured', label: 'Featured first' },
  { value: 'salary_high', label: 'Highest salary' },
];

const DEFAULT_FILTERS = {
  keyword: '', location: '', job_type: '', experience_level: '',
  remote: null, salary_min: undefined, salary_max: undefined, sort: 'latest',
};

export default function Jobs() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    keyword: searchParams.get('keyword') || '',
    location: searchParams.get('location') || '',
  }));
  const [data, setData] = useState({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [applyMessage, setApplyMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page: 1, limit: 20,
          keyword: filters.keyword || undefined,
          location: filters.location || undefined,
          job_type: filters.job_type || undefined,
          experience_level: filters.experience_level || undefined,
          remote: filters.remote ?? undefined,
          salary_min: filters.salary_min,
          salary_max: filters.salary_max,
          sort: filters.sort,
        };
        const res = await publicApi.jobs(params);
        if (cancelled) return;
        setData({
          records: (res?.records || []).map(toJobCardShape).filter(Boolean),
          total: res?.pagination?.total || 0,
        });
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters]);

  function update(patch) { setFilters((f) => ({ ...f, ...patch })); }
  function resetFilters() { setFilters({ ...DEFAULT_FILTERS }); }

  async function handleApply(job) {
    if (role !== 'candidate') return;
    setApplyingId(job.id);
    setApplyMessage(null);
    try {
      await candidatesApi.applications.apply(job.id, {});
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co}.` });
    } catch (err) {
      setApplyMessage({ ok: false, text: err.message || 'Could not submit application.' });
    } finally {
      setApplyingId(null);
      setTimeout(() => setApplyMessage(null), 4000);
    }
  }

  const headerCount = useMemo(
    () => (data.total != null ? Number(data.total).toLocaleString() : '—'),
    [data.total]
  );

  return (
    <section className="view active" id="view-jobs">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ {headerCount} open roles</span>
          <h1 className="display">All <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)', fontVariationSettings: '"SOFT" 100,"WONK" 1' }}>opportunities</span>.</h1>
          <p>Filter by what matters: location, salary, stack, company stage. We index roles from vetted employers.</p>
        </div>
      </div>

      <div className="container browse-layout">
        <aside className="filters">
          <div className="filter-group">
            <h4>Keyword</h4>
            <input
              placeholder="Title, skill, or company"
              value={filters.keyword}
              onChange={(e) => update({ keyword: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e0db' }}
            />
          </div>
          <div className="filter-group">
            <h4>Location</h4>
            <input
              placeholder="City or country"
              value={filters.location}
              onChange={(e) => update({ location: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e0db' }}
            />
            <div style={{ marginTop: 10 }}>
              {REMOTE_OPTIONS.map((o) => (
                <label key={String(o.value)} className="filter-opt">
                  <span>
                    <input
                      type="radio"
                      name="remote"
                      checked={filters.remote === o.value}
                      onChange={() => update({ remote: o.value })}
                    />
                    {o.label}
                  </span>
                </label>
              ))}
              <label className="filter-opt">
                <span>
                  <input type="radio" name="remote" checked={filters.remote == null} onChange={() => update({ remote: null })} />
                  Any
                </span>
              </label>
            </div>
          </div>
          <div className="filter-group">
            <h4>Job type</h4>
            {JOB_TYPES.map((t) => (
              <label key={t.value} className="filter-opt">
                <span>
                  <input
                    type="radio"
                    name="job_type"
                    checked={filters.job_type === t.value}
                    onChange={() => update({ job_type: t.value })}
                  />
                  {t.label}
                </span>
              </label>
            ))}
            <label className="filter-opt">
              <span>
                <input type="radio" name="job_type" checked={filters.job_type === ''} onChange={() => update({ job_type: '' })} />
                Any
              </span>
            </label>
          </div>
          <div className="filter-group">
            <h4>Experience</h4>
            {LEVELS.map((l) => (
              <label key={l.value} className="filter-opt">
                <span>
                  <input
                    type="radio"
                    name="experience_level"
                    checked={filters.experience_level === l.value}
                    onChange={() => update({ experience_level: l.value })}
                  />
                  {l.label}
                </span>
              </label>
            ))}
            <label className="filter-opt">
              <span>
                <input
                  type="radio"
                  name="experience_level"
                  checked={filters.experience_level === ''}
                  onChange={() => update({ experience_level: '' })}
                />
                Any
              </span>
            </label>
          </div>
          <div className="filter-group">
            <h4>Salary range</h4>
            {SALARY_BANDS.map((b) => (
              <label key={b.label} className="filter-opt">
                <span>
                  <input
                    type="radio"
                    name="salary"
                    checked={filters.salary_min === b.min && filters.salary_max === b.max}
                    onChange={() => update({ salary_min: b.min, salary_max: b.max })}
                  />
                  {b.label}
                </span>
              </label>
            ))}
            <label className="filter-opt">
              <span>
                <input
                  type="radio"
                  name="salary"
                  checked={filters.salary_min === undefined && filters.salary_max === undefined}
                  onChange={() => update({ salary_min: undefined, salary_max: undefined })}
                />
                Any
              </span>
            </label>
          </div>
          <button
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={resetFilters}
            type="button"
          >
            Reset filters
          </button>
        </aside>

        <div>
          <div className="browse-results-head">
            <div className="results-count"><strong>{headerCount}</strong> matching jobs</div>
            <select className="sort-select" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {applyMessage && (
            <div
              role="status"
              style={{
                margin: '12px 0', padding: '10px 12px', borderRadius: 8,
                background: applyMessage.ok ? '#e6f4ea' : '#fde9e3',
                color: applyMessage.ok ? '#0f5132' : '#b3361b',
                fontSize: 13,
              }}
            >
              {applyMessage.text}
            </div>
          )}
          {loading
            ? <LoadingState label="Searching jobs…" />
            : error
              ? <ErrorState error={error} onRetry={() => setFilters({ ...filters })} />
              : data.records.length === 0
                ? <EmptyState title="No jobs match these filters" message="Try clearing one filter at a time." />
                : (
                  <div className="jobs-list">
                    {data.records.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        featured
                        onApply={role === 'candidate' && applyingId !== j.id ? handleApply : undefined}
                      />
                    ))}
                  </div>
                )}
        </div>
      </div>
    </section>
  );
}
