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
import { useLocation as useGeoLocation } from '../hooks/useLocation.js';
import { toJobCardShape } from '../api/adapters.js';

/* ---------- Location banner ---------- */

function LocationBanner({ location, source, status, onRequestPermission, onReset }) {
  if (!location) {
    return (
      <div
        style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 10,
          background: 'var(--bone)', border: '1px solid #e2e0db', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}
      >
        <span>📍 Detecting your location…</span>
        <button type="button" className="btn btn-ghost" onClick={onRequestPermission}
                style={{ padding: '4px 10px', fontSize: 12 }}>
          Use my current location
        </button>
      </div>
    );
  }
  const sourceLabel = source === 'browser' ? 'browser GPS'
    : source === 'manual' ? 'set by you'
    : source === 'ip' ? 'estimated from IP' : 'detected';
  return (
    <div
      style={{
        marginBottom: 16, padding: '12px 14px', borderRadius: 10,
        background: 'var(--bone)', border: '1px solid #e2e0db', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}
    >
      <span>📍 Showing jobs near <strong>{location.city ? `${location.city}, ` : ''}{location.country || 'you'}</strong></span>
      <span className="muted" style={{ fontSize: 11 }}>({sourceLabel})</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {source !== 'browser' && status !== 'detecting' && (
          <button type="button" className="btn btn-ghost" onClick={onRequestPermission}
                  style={{ padding: '4px 10px', fontSize: 12 }}>
            Use precise location
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onReset}
                style={{ padding: '4px 10px', fontSize: 12 }}>
          Clear
        </button>
      </div>
    </div>
  );
}

/* ---------- Apply-rejection modal ---------- */

function RejectionModal({ result, onClose }) {
  if (!result) return null;
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, gridTemplateColumns: '1fr' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close" type="button">×</button>
        <div className="modal-form" style={{ padding: '32px 28px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
          <h2 style={{ marginBottom: 4 }}>Not quite a fit yet</h2>
          <p className="muted" style={{ marginBottom: 16 }}>{result.message}</p>

          {Array.isArray(result.missing) && result.missing.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                Skills the role expects
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.missing.map((s) => (
                  <span key={s} className="job-tag" style={{ background: '#fde9e3', color: '#b3361b' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(result.reasons) && result.reasons.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                What did match
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.reasons.slice(0, 4).map((r, i) => (
                  <span key={i} className="job-tag">{r}</span>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 13 }} className="muted">
            Match score: <strong style={{ color: 'var(--coral)' }}>{result.match_score}%</strong>.
            Update your profile or skills and try again - the score recalculates instantly.
          </p>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <a href="/profile" className="btn btn-coral" style={{ flex: 1, textAlign: 'center' }}>Update profile</a>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Keep browsing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

const SCOPE_OPTIONS = [
  { value: 'hybrid', label: 'All (local + global)' },
  { value: 'local', label: 'Local (my city)' },
  { value: 'country', label: 'My country' },
  { value: 'global_remote', label: 'Global remote' },
];

export default function Jobs() {
  const { role } = useAuth();
  const { location, status, source, requestPermission, reset: resetLocation } = useGeoLocation();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    keyword: searchParams.get('keyword') || '',
    location: searchParams.get('location') || '',
  }));
  const [jobScope, setJobScope] = useState('hybrid');
  const [data, setData] = useState({ records: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [applyMessage, setApplyMessage] = useState(null);
  const [rejection, setRejection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // When we have a resolved location, prefer the location-based
        // endpoint - it ranks city > country > global remote and
        // decorates each row with the match score when authenticated.
        const useLocationFeed = !!(location?.country || location?.city);
        const res = useLocationFeed
          ? await publicApi.locationBasedJobs({
              country: location.country || undefined,
              city: location.city || undefined,
              role: filters.keyword || undefined,
              experience_level: filters.experience_level || undefined,
              job_scope: jobScope,
              page: 1, limit: 24,
            })
          : await publicApi.jobs({
              page: 1, limit: 24,
              keyword: filters.keyword || undefined,
              location: filters.location || undefined,
              job_type: filters.job_type || undefined,
              experience_level: filters.experience_level || undefined,
              remote: filters.remote ?? undefined,
              salary_min: filters.salary_min,
              salary_max: filters.salary_max,
              sort: filters.sort,
            });
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
  }, [filters, location?.country, location?.city, jobScope]);

  function update(patch) { setFilters((f) => ({ ...f, ...patch })); }
  function resetFilters() { setFilters({ ...DEFAULT_FILTERS }); }

  async function handleApply(job) {
    if (role !== 'candidate') return;
    setApplyingId(job.id);
    setApplyMessage(null);
    setRejection(null);
    try {
      // Validate-and-apply: the server scores first and rejects hard
      // mismatches with a polite explanation. The frontend pops the
      // RejectionModal for those cases.
      const result = await candidatesApi.validateAndApply(job.id, {});
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co} (match ${result.match_score}%).` });
    } catch (err) {
      // The error envelope from validate-and-apply carries the full
      // verdict on `original.response.data.Data`. Surface it in the
      // modal so the user gets actionable feedback.
      const data = err.original?.response?.data?.Data;
      if (data && data.decision === 'rejected') {
        setRejection({ ...data, job });
      } else {
        setApplyMessage({ ok: false, text: err.message || 'Could not submit application.' });
      }
    } finally {
      setApplyingId(null);
      setTimeout(() => setApplyMessage(null), 5000);
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
          <LocationBanner
            location={location}
            source={source}
            status={status}
            onRequestPermission={requestPermission}
            onReset={resetLocation}
          />

          <div className="browse-results-head">
            <div className="results-count"><strong>{headerCount}</strong> matching jobs</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                className="sort-select"
                value={jobScope}
                onChange={(e) => setJobScope(e.target.value)}
                aria-label="Job scope"
                title="Show jobs in your city, country, or globally"
              >
                {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="sort-select" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
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

      <RejectionModal result={rejection} onClose={() => setRejection(null)} />
    </section>
  );
}
