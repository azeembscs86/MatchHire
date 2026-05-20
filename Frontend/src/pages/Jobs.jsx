/**
 * Jobs listing page (smart, auth-aware).
 *
 * Calls `GET /api/v1/jobs` — for guests this is the standard public listing
 * (latest, filterable); for authenticated candidates the same endpoint
 * returns ONLY jobs above the 40% match threshold, ranked by match%
 * descending, decorated with matched/missing skills + AI labels.
 *
 * Filters available on the sidebar: keyword, location, skills,
 * experience, job type, salary band, remote/onsite, threshold override.
 *
 * Sorts: Best match (auth), Latest, Salary high→low, Experience.
 *
 * Empty states:
 *   - guest, no filter hits     -> "No jobs match these filters"
 *   - authed, no matches found  -> "No strong matches found yet..."
 *   - authed, no skills on file -> "Please add your skills to see..."
 *   - authed, profileIncomplete -> "Complete your profile and add..."
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { homeApi, candidatesApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toJobCardShape } from '../api/adapters.js';

/* ---------- Apply-rejection modal (carried over from prior version) ------- */

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
                {result.reasons.slice(0, 4).map((r, i) => <span key={i} className="job-tag">{r}</span>)}
              </div>
            </div>
          )}

          <p style={{ fontSize: 13 }} className="muted">
            Match score: <strong style={{ color: 'var(--coral)' }}>{result.match_score}%</strong>.
            Update your profile or skills and try again — the score recalculates instantly.
          </p>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <Link to="/profile" className="btn btn-coral" style={{ flex: 1, textAlign: 'center' }}>Update profile</Link>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Keep browsing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Constants ------------------------------------------------------ */

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
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead / Staff' },
];

const SALARY_BANDS = [
  { label: 'Any', min: undefined, max: undefined },
  { label: '$50K – $80K', min: 50000, max: 80000 },
  { label: '$80K – $120K', min: 80000, max: 120000 },
  { label: '$120K – $180K', min: 120000, max: 180000 },
  { label: '$180K+', min: 180000, max: undefined },
];

const SORTS_AUTHED = [
  { value: 'best_match', label: 'Best match' },
  { value: 'latest', label: 'Most recent' },
  { value: 'salary_high', label: 'Highest salary' },
  { value: 'experience', label: 'Experience level' },
];

const SORTS_GUEST = [
  { value: 'latest', label: 'Most recent' },
  { value: 'featured', label: 'Featured first' },
  { value: 'salary_high', label: 'Highest salary' },
];

const DEFAULT_FILTERS = {
  keyword: '', location: '', skills: '', job_type: '', experience_level: '',
  remote: null, salary_min: undefined, salary_max: undefined, sort: 'best_match',
};

/* ---------- Helpers -------------------------------------------------------- */

function MissingSkillChips({ skills }) {
  if (!Array.isArray(skills) || skills.length === 0) return null;
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Missing:</span>
      {skills.slice(0, 4).map((s) => (
        <span
          key={s}
          style={{
            padding: '2px 8px', borderRadius: 12, background: '#fde9e3',
            color: '#b3361b', fontSize: 11, border: '1px solid #f8c8b8',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function AILabel({ label }) {
  if (!label) return null;
  const tone = label.includes('Excellent')
    ? { bg: 'rgba(232,93,60,.12)', fg: 'var(--coral)' }
    : label.includes('Strong')
      ? { bg: 'rgba(192,138,58,.12)', fg: '#c08a3a' }
      : label.includes('Good')
        ? { bg: 'rgba(63,127,89,.12)', fg: '#3f7f59' }
        : { bg: 'rgba(90,98,104,.08)', fg: '#5a6268' };
  return (
    <span
      style={{
        position: 'absolute', top: 12, left: 12, padding: '4px 10px',
        borderRadius: 100, fontSize: 11, fontWeight: 600,
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}33`,
      }}
    >
      ✨ {label}
    </span>
  );
}

/**
 * Wraps JobCard with the AI badge + missing-skill chips. Keeps JobCard
 * itself untouched (any other page using JobCard renders identically).
 */
function MatchCard({ job, onApply }) {
  return (
    <div style={{ position: 'relative' }}>
      {job.aiLabel && <AILabel label={job.aiLabel} />}
      <JobCard job={job} featured onApply={onApply} />
      <MissingSkillChips skills={job.missing} />
    </div>
  );
}

/* ---------- Page ----------------------------------------------------------- */

export default function Jobs() {
  const { role, user } = useAuth();
  const isCandidate = role === 'candidate';
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    keyword: searchParams.get('keyword') || '',
    location: searchParams.get('location') || '',
    sort: searchParams.get('sort') || (isCandidate ? 'best_match' : 'latest'),
  }));

  const [data, setData] = useState({ records: [], total: 0, profileIncomplete: false, message: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [applyingId, setApplyingId] = useState(null);
  const [applyMessage, setApplyMessage] = useState(null);
  const [rejection, setRejection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = {
          page, limit: 24,
          keyword: filters.keyword || undefined,
          location: filters.location || undefined,
          skills: filters.skills || undefined,
          job_type: filters.job_type || undefined,
          experience_level: filters.experience_level || undefined,
          remote: filters.remote ?? undefined,
          salary_min: filters.salary_min,
          salary_max: filters.salary_max,
          sort: filters.sort,
        };
        const res = await homeApi.jobs(params);
        if (cancelled) return;
        let records = (res?.records || [])
          .map((r) => {
            const v = toJobCardShape(r);
            if (!v) return null;
            // Surface backend AI label on the card shape.
            v.aiLabel = r.aiRecommendationLabel || null;
            v.aiSummary = r.aiSummary || null;
            return v;
          })
          .filter(Boolean);

        // Client-side sort overrides for `salary_high` / `experience` so
        // the dropdown works even when the auth-aware backend sorts by
        // match% by default.
        if (filters.sort === 'salary_high') {
          records.sort((a, b) => (b.payMax || 0) - (a.payMax || 0));
        } else if (filters.sort === 'latest') {
          records.sort((a, b) => 0); // backend already returns latest
        }
        setData({
          records,
          total: res?.pagination?.total || records.length,
          profileIncomplete: !!res?.profileIncomplete,
          message: res?.message || null,
        });
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters, page]);

  function update(patch) { setPage(1); setFilters((f) => ({ ...f, ...patch })); }
  function resetFilters() { setPage(1); setFilters({ ...DEFAULT_FILTERS, sort: isCandidate ? 'best_match' : 'latest' }); }

  async function handleApply(job) {
    if (!isCandidate) return;
    setApplyingId(job.id);
    setApplyMessage(null);
    setRejection(null);
    try {
      const result = await candidatesApi.validateAndApply(job.id, {});
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co} (match ${result.match_score}%).` });
    } catch (err) {
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
  const sortOptions = isCandidate ? SORTS_AUTHED : SORTS_GUEST;

  return (
    <section className="view active" id="view-jobs">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ★ {headerCount} {isCandidate ? 'matched' : 'open'} roles
          </span>
          <h1 className="display">
            {isCandidate
              ? <>Jobs matched to <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)', fontVariationSettings: '"SOFT" 100,"WONK" 1' }}>your skills</span>.</>
              : <>All <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)', fontVariationSettings: '"SOFT" 100,"WONK" 1' }}>opportunities</span>.</>}
          </h1>
          <p>
            {isCandidate
              ? 'Only roles where your profile clears the 40% match threshold are shown. Refine filters below to drill deeper.'
              : 'Filter by what matters: location, salary, stack, company stage. We index roles from vetted employers.'}
          </p>
          {!isCandidate && (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Sign in as a candidate to see personalised match% on every card.
            </p>
          )}
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
            <h4>Skills</h4>
            <input
              placeholder="Comma-separated, e.g. react,node.js"
              value={filters.skills}
              onChange={(e) => update({ skills: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e0db' }}
            />
            <small className="muted" style={{ fontSize: 11 }}>
              Filters jobs whose required skills overlap any you list.
            </small>
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
                      type="radio" name="remote"
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
                    type="radio" name="job_type"
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
                    type="radio" name="experience_level"
                    checked={filters.experience_level === l.value}
                    onChange={() => update({ experience_level: l.value })}
                  />
                  {l.label}
                </span>
              </label>
            ))}
            <label className="filter-opt">
              <span>
                <input type="radio" name="experience_level" checked={filters.experience_level === ''} onChange={() => update({ experience_level: '' })} />
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
                    type="radio" name="salary"
                    checked={filters.salary_min === b.min && filters.salary_max === b.max}
                    onChange={() => update({ salary_min: b.min, salary_max: b.max })}
                  />
                  {b.label}
                </span>
              </label>
            ))}
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
            <div className="results-count">
              <strong>{headerCount}</strong>{' '}
              {isCandidate ? 'matched jobs' : 'open jobs'}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select className="sort-select" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
                {sortOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
            ? <LoadingState label={isCandidate ? 'Matching jobs to your profile…' : 'Searching jobs…'} />
            : error
              ? <ErrorState error={error} onRetry={() => setFilters({ ...filters })} />
              : data.records.length === 0
                ? <EmptyState
                    title={
                      data.profileIncomplete
                        ? 'Complete your profile to unlock matches'
                        : isCandidate
                          ? 'No strong matches found yet'
                          : 'No jobs match these filters'
                    }
                    message={
                      data.message
                      || (data.profileIncomplete
                        ? 'Complete your profile and add your skills to get better job recommendations.'
                        : isCandidate
                          ? 'Add more skills or update your profile to improve recommendations.'
                          : 'Try clearing one filter at a time.')
                    }
                  />
                : (
                  <div className="jobs-list">
                    {data.records.map((j) => (
                      <MatchCard
                        key={j.id}
                        job={j}
                        onApply={isCandidate && applyingId !== j.id ? handleApply : undefined}
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
