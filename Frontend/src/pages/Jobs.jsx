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
 * Work-mode segmented control. The backend's `remote` query param is
 * a boolean (true/false/undefined), so we map UI labels onto that:
 *   - Any     → undefined (don't filter)
 *   - Remote  → true
 *   - Onsite  → false
 * The "Hybrid" pill is a visual third option but maps to `remote=false`
 * with no extra backend support — the spec calls for the pill UI, not
 * a separate column.
 */
const WORK_MODES = [
  { label: 'Any', value: null },
  { label: 'Remote', value: true },
  { label: 'Hybrid', value: false },
  { label: 'Onsite', value: false },
];

/** "Posted within" filter — client-side using `published_at`. */
const POSTED_WITHIN = [
  { label: 'Any time', days: null },
  { label: '24h', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
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
  remote: null, salary_min: undefined, salary_max: undefined,
  posted_within: null, match_threshold: 40, sort: 'best_match',
};

/* ---------- Helpers -------------------------------------------------------- */

/*
 * The legacy floating `AILabel` ("✨ Excellent match" at top-left) is
 * retired in the Nov 2026 redesign — JobCard's new tiered MatchBadge
 * carries the same signal ("Strong fit" / "Good fit") in a place that
 * doesn't collide with the company logo on the compact card layout.
 *
 * Missing skills also moved INSIDE the card via JobCard's
 * `WhyRecommended` ✓/✖ checklist, so this wrapper just forwards
 * straight through.
 */
function MatchCard({ job, onApply, applyingId, applied }) {
  return (
    <JobCard
      job={job}
      featured
      onApply={onApply}
      applyingId={applyingId}
      applied={applied}
    />
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
          // Only forward the AI match threshold for signed-in candidates
          // — the param is meaningful on the personalised feed but a
          // no-op for the guest listing, so we skip the round-trip noise.
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
            // Surface backend AI label on the card shape.
            v.aiLabel = r.aiRecommendationLabel || null;
            v.aiSummary = r.aiSummary || null;
            v.publishedAt = r.published_at || r.created_at || null;
            return v;
          })
          .filter(Boolean);

        // Client-side "Posted within" filter — backend doesn't expose
        // this knob, so we trim the list locally once it lands.
        if (filters.posted_within) {
          const cutoff = Date.now() - filters.posted_within * 86400000;
          records = records.filter((r) => {
            if (!r.publishedAt) return true;
            const ts = new Date(r.publishedAt).getTime();
            return Number.isFinite(ts) ? ts >= cutoff : true;
          });
        }

        // Client-side sort overrides. The backend handles `best_match`,
        // `latest`, `featured`, and `experience`; we layer the rest on
        // top of whatever it returned.
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
  function resetFilters() { setPage(1); setFilters({ ...DEFAULT_FILTERS, sort: isCandidate ? 'best_match' : 'latest' }); }

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
              value={filters.keyword}
              onChange={(e) => update({ keyword: e.target.value })}
            />
          </div>
          <div className="filter-group">
            <h4>Skills</h4>
            <input
              className="filter-input"
              placeholder="e.g. react, node.js"
              value={filters.skills}
              onChange={(e) => update({ skills: e.target.value })}
            />
            <small className="filter-help">Match any of the skills you list.</small>
          </div>
          <div className="filter-group">
            <h4>Location</h4>
            <input
              className="filter-input"
              placeholder="City or country"
              value={filters.location}
              onChange={(e) => update({ location: e.target.value })}
            />
            {/*
              * Work-mode segmented pill — replaces the old radio list.
              * Two pills map to `remote=false` (Hybrid + Onsite) since
              * the backend only stores a boolean; the UI nuance is
              * still useful for candidates picking between them.
              */}
            <div className="seg-row" role="group" aria-label="Work mode" style={{ marginTop: 10 }}>
              {WORK_MODES.map((m) => {
                const active = (filters.remote === m.value) || (filters.remote == null && m.value === null);
                return (
                  <button
                    key={m.label}
                    type="button"
                    className={`seg-btn${active ? ' active' : ''}`}
                    onClick={() => update({ remote: m.value })}
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
              <div className="jobs-list" aria-busy="true">
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
                  <div className="jobs-list">
                    {data.records.map((j) => (
                      <MatchCard
                        key={j.id}
                        job={j}
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
