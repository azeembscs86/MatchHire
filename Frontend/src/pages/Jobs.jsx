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

/* ---------- Skeleton ------------------------------------------------------- */

/**
 * One placeholder row mirroring the JobCard's silhouette. We render a
 * handful while the smart-jobs payload is in flight so the layout
 * doesn't reflow once data lands.
 */
function JobSkeleton() {
  return (
    <div className="skel-card" aria-hidden="true">
      <div className="skel-row">
        <div className="skel-dot" />
        <div style={{ flex: 1 }}>
          <div className="skel-line w-50" />
          <div className="skel-line sm w-30" style={{ marginTop: 6 }} />
        </div>
      </div>
      <div className="skel-line lg w-70" />
      <div className="skel-line w-90" />
      <div className="skel-row" style={{ gap: 6 }}>
        <div className="skel-line w-30" />
        <div className="skel-line w-30" />
        <div className="skel-line w-30" />
      </div>
      <div className="skel-line sm w-50" style={{ marginTop: 'auto' }} />
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

/**
 * Work-mode segmented control. Maps directly to the backend's
 * `work_mode` column (ENUM('onsite','hybrid','remote')) so each pill
 * is a real, distinct filter. Sending `work_mode=''` (Any) means
 * "don't filter".
 */
const WORK_MODES = [
  { label: 'Any',    value: '' },
  { label: 'Remote', value: 'remote' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Onsite', value: 'onsite' },
];

/**
 * "Posted within" filter. `days=0` (Any time) sends nothing to the
 * backend; positive values filter `j.published_at >= NOW() - INTERVAL ? DAY`
 * server-side so the response total and pagination stay accurate.
 */
const POSTED_WITHIN = [
  { label: 'Any time', days: 0 },
  { label: '24h',      days: 1 },
  { label: '7 days',   days: 7 },
  { label: '30 days',  days: 30 },
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

/*
 * Sort options. `best_match`, `latest`, `salary_high`, `experience`,
 * and `featured` are honoured by the backend; the rest are derived on
 * the client from data we already have on the card shape so we don't
 * have to extend the API contract.
 */
const SORTS_AUTHED = [
  { value: 'best_match',    label: 'Best match' },
  { value: 'latest',        label: 'Most recent' },
  { value: 'salary_high',   label: 'Highest salary' },
  { value: 'closing_soon',  label: 'Closing soon' },
  { value: 'remote_first',  label: 'Remote first' },
  { value: 'experience',    label: 'Experience level' },
];

const SORTS_GUEST = [
  { value: 'latest',        label: 'Most recent' },
  { value: 'featured',      label: 'Featured first' },
  { value: 'salary_high',   label: 'Highest salary' },
  { value: 'closing_soon',  label: 'Closing soon' },
  { value: 'remote_first',  label: 'Remote first' },
];

const DEFAULT_FILTERS = {
  keyword: '', location: '', skills: '', job_type: '', experience_level: '',
  work_mode: '', salary_min: undefined, salary_max: undefined,
  posted_within: 0, match_threshold: 40, sort: 'best_match',
};

/**
 * Build the filter object from URL search params so a refresh (or a
 * shared link) restores the exact view. Anything not present falls
 * back to `DEFAULT_FILTERS`. The inverse — pushing filters TO the
 * URL — lives in the useEffect below.
 */
function filtersFromSearchParams(params, isCandidate) {
  const num = (key, fallback) => {
    const raw = params.get(key);
    if (raw == null || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    ...DEFAULT_FILTERS,
    keyword: params.get('keyword') || '',
    skills: params.get('skills') || '',
    location: params.get('location') || '',
    work_mode: params.get('work_mode') || '',
    job_type: params.get('job_type') || '',
    experience_level: params.get('experience_level') || '',
    posted_within: num('posted_within', 0),
    match_threshold: num('match_threshold', 40),
    salary_min: num('salary_min', undefined),
    salary_max: num('salary_max', undefined),
    sort: params.get('sort') || (isCandidate ? 'best_match' : 'latest'),
  };
}

/* ---------- Helpers -------------------------------------------------------- */

/*
 * The legacy floating `AILabel` ("✨ Excellent match" at top-left) and
 * the bespoke `MatchCard` wrapper are retired — JobCard's tiered
 * MatchBadge carries the same signal in a place that doesn't collide
 * with the company logo, and missing skills now render inside the
 * card via its `WhyRecommended` ✓/✖ checklist. The Jobs feed now
 * renders `<JobCard featured />` straight into the same `.jobs-grid`
 * container the Home page uses, so the card looks identical on both
 * surfaces.
 */

/* ---------- Page ----------------------------------------------------------- */

export default function Jobs() {
  const { role, user } = useAuth();
  const isCandidate = role === 'candidate';
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters are the single source of truth for the request. They
  // hydrate from URL search params on first paint (so refresh + share
  // restore the view), and the effect below pushes any subsequent
  // change back into the URL. Text inputs (keyword/skills/location)
  // are debounced through local `*Input` state so we don't fire a
  // request on every keystroke.
  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams, isCandidate));
  const [keywordInput, setKeywordInput] = useState(filters.keyword);
  const [skillsInput, setSkillsInput] = useState(filters.skills);
  const [locationInput, setLocationInput] = useState(filters.location);

  const [data, setData] = useState({ records: [], total: 0, profileIncomplete: false, message: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [applyingId, setApplyingId] = useState(null);
  const [applyMessage, setApplyMessage] = useState(null);
  const [rejection, setRejection] = useState(null);

  /*
   * Debounce: when the user types in keyword / skills / location,
   * push the new text into the real filter state 350ms after the
   * last keystroke. This collapses a rapid burst of edits into a
   * single API call instead of one per character.
   */
  useEffect(() => {
    const handle = setTimeout(() => {
      // Only commit + reset pagination when at least one text field
      // actually drifted from the canonical filter state. Comparing
      // here avoids a redundant re-render after the URL hydration
      // path seeds `*Input` from `filters` on first paint.
      if (
        filters.keyword === keywordInput
        && filters.skills === skillsInput
        && filters.location === locationInput
      ) return;
      setPage(1);
      setFilters((prev) => ({
        ...prev,
        keyword: keywordInput,
        skills: skillsInput,
        location: locationInput,
      }));
    }, 350);
    return () => clearTimeout(handle);
  }, [keywordInput, skillsInput, locationInput, filters.keyword, filters.skills, filters.location]);

  /*
   * URL sync. Every change to `filters` writes a fresh search-params
   * snapshot so the URL is shareable / refresh-safe. Empty / default
   * values are stripped from the URL to keep it readable. `replace:
   * true` keeps these mid-page filter tweaks out of the back-button
   * history.
   */
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.keyword) next.set('keyword', filters.keyword);
    if (filters.skills) next.set('skills', filters.skills);
    if (filters.location) next.set('location', filters.location);
    if (filters.work_mode) next.set('work_mode', filters.work_mode);
    if (filters.job_type) next.set('job_type', filters.job_type);
    if (filters.experience_level) next.set('experience_level', filters.experience_level);
    if (filters.posted_within) next.set('posted_within', String(filters.posted_within));
    if (filters.salary_min != null && filters.salary_min !== '') next.set('salary_min', String(filters.salary_min));
    if (filters.salary_max != null && filters.salary_max !== '') next.set('salary_max', String(filters.salary_max));
    if (isCandidate && filters.match_threshold != null && filters.match_threshold !== 40) {
      next.set('match_threshold', String(filters.match_threshold));
    }
    const defaultSort = isCandidate ? 'best_match' : 'latest';
    if (filters.sort && filters.sort !== defaultSort) next.set('sort', filters.sort);
    setSearchParams(next, { replace: true });
  }, [filters, isCandidate, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Build the API params. Backend accepts every filter directly
        // now (skills, work_mode, posted_within_days, threshold, ...)
        // so the client doesn't have to filter or sort post-hoc except
        // for the two client-only sort hints (closing_soon, remote_first).
        const params = {
          page, limit: 24,
          keyword: filters.keyword || undefined,
          location: filters.location || undefined,
          skills: filters.skills || undefined,
          job_type: filters.job_type || undefined,
          experience_level: filters.experience_level || undefined,
          work_mode: filters.work_mode || undefined,
          salary_min: filters.salary_min,
          salary_max: filters.salary_max,
          posted_within_days: filters.posted_within > 0 ? filters.posted_within : undefined,
          // AI match minimum — meaningful only for signed-in candidates.
          // Sent as `threshold` to align with the existing backend param.
          threshold: isCandidate && Number.isFinite(filters.match_threshold)
            ? filters.match_threshold
            : undefined,
          sort: filters.sort,
        };
        const res = await homeApi.jobs(params);
        if (cancelled) return;
        let records = (res?.records || [])
          .map((r) => {
            const v = toJobCardShape(r);
            if (!v) return null;
            v.aiLabel = r.aiRecommendationLabel || null;
            v.aiSummary = r.aiSummary || null;
            v.publishedAt = r.published_at || r.created_at || null;
            v.payMin = r.salary_min ?? null;
            v.payMax = r.salary_max ?? null;
            return v;
          })
          // Defence-in-depth: backend filters expired postings; this
          // catches any that slip through a stale cache.
          .filter((j) => j && !j.isExpired);

        // Client-only sort hints — applied on top of whatever the
        // backend returned, since the underlying API contract doesn't
        // need to know about these visual orderings.
        if (filters.sort === 'salary_high') {
          records.sort((a, b) => (b.payMax || 0) - (a.payMax || 0));
        } else if (filters.sort === 'closing_soon') {
          records.sort((a, b) => {
            const ax = a.deadlineRaw ? new Date(a.deadlineRaw).getTime() : Infinity;
            const bx = b.deadlineRaw ? new Date(b.deadlineRaw).getTime() : Infinity;
            return ax - bx;
          });
        } else if (filters.sort === 'remote_first') {
          records.sort((a, b) => {
            const ar = (a.isGlobalRemote || /remote/i.test(a.loc || '')) ? 0 : 1;
            const br = (b.isGlobalRemote || /remote/i.test(b.loc || '')) ? 0 : 1;
            return ar - br;
          });
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
  }, [filters, page, isCandidate]);

  function update(patch) { setPage(1); setFilters((f) => ({ ...f, ...patch })); }
  function resetFilters() {
    setPage(1);
    // Reset both the canonical filter state AND the debounced text
    // mirrors so the inputs visibly clear at the same time.
    setKeywordInput('');
    setSkillsInput('');
    setLocationInput('');
    setFilters({ ...DEFAULT_FILTERS, sort: isCandidate ? 'best_match' : 'latest' });
  }

  async function handleApply(job) {
    if (!isCandidate) return;
    setApplyingId(job.id);
    setApplyMessage(null);
    setRejection(null);
    try {
      const result = await candidatesApi.validateAndApply(job.id, {});
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co} (match ${result.match_score}%).` });
      // Optimistic UX — after a successful apply, drop the row from the
      // visible list immediately so the candidate doesn't see "Apply"
      // on a role they're already in the pipeline for. The backend
      // listing also excludes applied jobs on the next fetch.
      setData((prev) => ({
        ...prev,
        records: (prev.records || []).filter((r) => r.id !== job.id),
        total: Math.max(0, Number(prev.total || 0) - 1),
      }));
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
              className="filter-input"
              placeholder="Title, skill, or company"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <h4>Skills</h4>
            <input
              className="filter-input"
              placeholder="e.g. react, node.js"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
            />
            <small className="filter-help">Match any of the skills you list.</small>
          </div>
          <div className="filter-group">
            <h4>Location</h4>
            <input
              className="filter-input"
              placeholder="City or country"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
            />
            {/*
              * Work-mode segmented pill — each pill is a distinct
              * filter mapped onto the backend's `work_mode` ENUM
              * (onsite/hybrid/remote). The "Any" pill clears the
              * filter.
              */}
            <div className="seg-row" role="group" aria-label="Work mode" style={{ marginTop: 10 }}>
              {WORK_MODES.map((m) => {
                const active = (filters.work_mode || '') === m.value;
                return (
                  <button
                    key={m.label}
                    type="button"
                    className={`seg-btn${active ? ' active' : ''}`}
                    onClick={() => update({ work_mode: m.value })}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="filter-group">
            <h4>Posted within</h4>
            <div className="seg-row" role="group" aria-label="Posted within">
              {POSTED_WITHIN.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`seg-btn${filters.posted_within === p.days ? ' active' : ''}`}
                  onClick={() => update({ posted_within: p.days })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {isCandidate && (
            <div className="filter-group">
              <h4>AI match minimum</h4>
              <input
                type="range"
                min={0}
                max={95}
                step={5}
                value={filters.match_threshold ?? 40}
                onChange={(e) => update({ match_threshold: Number(e.target.value) })}
                className="match-slider"
                aria-label="Minimum AI match percentage"
              />
              <div className="match-slider-row">
                <span>0%</span>
                <strong style={{ color: 'var(--ink)' }}>{filters.match_threshold ?? 40}%+</strong>
                <span>95%</span>
              </div>
            </div>
          )}
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
            ? (
              <div className="jobs-grid" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => <JobSkeleton key={i} />)}
              </div>
            )
            : error
              ? <ErrorState error={error} onRetry={() => setFilters({ ...filters })} />
              : data.records.length === 0
                ? (
                  <EmptyState
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
                          ? 'Try lowering the AI match minimum, clearing a filter, or updating your skills.'
                          : 'Try clearing one filter at a time, or broaden your keyword.')
                    }
                  />
                )
                : (
                  <div className="jobs-grid">
                    {data.records.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        featured
                        onApply={isCandidate ? handleApply : undefined}
                        applyingId={applyingId}
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
