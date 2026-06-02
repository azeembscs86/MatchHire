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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { homeApi, candidatesApi, skillsApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { viewerForRole } from '../lib/viewer.js';
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

/*
 * Salary filter bands.
 *
 * Display in PKR / month (the visitor's locale) while the values sent
 * to the backend stay in the storage unit — annual figures in the
 * same currency as the job rows. Most of the catalogue is stored
 * annually, so a "PKR 50,000 – 100,000 / month" band sends
 * `salary_min = 600,000` and `salary_max = 1,200,000` (× 12) and the
 * repository's range comparison matches PKR-annual rows out of the
 * box. Jobs stored in other currencies still fall back to numeric
 * comparison; currency-aware filtering is a follow-up improvement.
 */
const SALARY_BANDS = [
  { label: 'Any',                            min: undefined, max: undefined },
  { label: 'PKR 50,000 – 100,000 / month',   min: 600_000,    max: 1_200_000 },
  { label: 'PKR 100,000 – 250,000 / month',  min: 1_200_000,  max: 3_000_000 },
  { label: 'PKR 250,000 – 500,000 / month',  min: 3_000_000,  max: 6_000_000 },
  { label: 'PKR 500,000+ / month',            min: 6_000_000,  max: undefined },
];

/*
 * Sort options. `best_match`, `latest`, `salary_high`, `experience`,
 * and `featured` are honoured by the backend; the rest are derived on
 * the client from data we already have on the card shape so we don't
 * have to extend the API contract.
 */
const SORTS_AUTHED = [
  { value: 'best_match',    label: 'Best match' },
  // "AI Recommended" is best_match + a 70% match-threshold floor —
  // narrows the feed to roles the matching service rated as Strong
  // or Good fit only. Pure sort hint client-side; the `threshold`
  // raise is applied in `commitSearch()` when this sort is picked.
  { value: 'ai_recommended', label: '★ AI Recommended (70%+)' },
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
  keyword: '', location: '', skills: '', company: '',
  job_type: '', experience_level: '',
  work_mode: '', salary_min: undefined, salary_max: undefined,
  posted_within: 0, match_threshold: 40, sort: 'best_match',
  // `verified_only` wires through to the backend
  // (`companies.verification_status = 'verified'`). Candidate-side
  // location bias is already enforced server-side by
  // listLocationBased (it reads profile country/city) so a
  // separate "Near me" toggle would be a no-op there.
  verified_only: false,
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
    company: params.get('company') || '',
    work_mode: params.get('work_mode') || '',
    job_type: params.get('job_type') || '',
    experience_level: params.get('experience_level') || '',
    posted_within: num('posted_within', 0),
    match_threshold: num('match_threshold', 40),
    salary_min: num('salary_min', undefined),
    salary_max: num('salary_max', undefined),
    sort: params.get('sort') || (isCandidate ? 'best_match' : 'latest'),
    verified_only: params.get('verified_only') === '1' || params.get('verified_only') === 'true',
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

/* ---------- Modern search bar --------------------------------------------- */

/**
 * Persistent recent-searches helper. We store the last few committed
 * keyword searches in localStorage so a returning candidate sees a
 * "Recent" row under the bar. Capped at 5 entries; oldest is dropped
 * on overflow. The shape is intentionally flat (just the keyword
 * string) — recent searches are a UX hint, not a query replay surface.
 */
const RECENT_KEY = 'mh.jobs.recentSearches';
const RECENT_MAX = 5;
function loadRecent() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function saveRecent(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch { /* quota / privacy mode — non-fatal */ }
}
function pushRecent(value) {
  const v = String(value || '').trim();
  if (!v) return loadRecent();
  const prev = loadRecent();
  const next = [v, ...prev.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_MAX);
  saveRecent(next);
  return next;
}

/**
 * Tiny search-icon button. Pure presentation — the form submits via
 * its own onSubmit so the icon button is the visible affordance, not
 * the active control.
 */
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="16" height="16" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * Single search field with built-in clear button and (optional)
 * autocomplete dropdown. The dropdown is rendered as a portal-style
 * absolute element under the field; clicks outside close it via the
 * effect on `.jobs-search-bar`.
 *
 * Keyboard model:
 *   - ArrowDown / ArrowUp move the active highlight through the list
 *     (wraps at both ends).
 *   - Enter picks the active row when one is highlighted; otherwise it
 *     falls through to `onSubmit` so the form still submits cleanly.
 *   - Escape collapses the panel via `onClose` (the parent closes by
 *     clearing `focusedField` — same path as the outside-click handler).
 *
 * `emptyHint` is a per-field opt-in: when provided and the user has
 * typed something but no suggestions came back, we render the hint
 * instead of an empty list (used for Skills → "No matching skills
 * found"). Pure presentational widget; data fetching stays in the
 * parent so multiple fields can share lookup logic.
 */
function SearchField({
  label, name, value, onChange, onSubmit, placeholder,
  suggestions = [], onSuggestionPick, onFocus, onClose, focused,
  emptyHint,
}) {
  const [active, setActive] = useState(-1);
  const showList = focused && suggestions.length > 0;
  const showEmpty = focused
    && !!emptyHint
    && value.trim().length > 0
    && suggestions.length === 0;

  // Reset the active index whenever the visible list changes (new
  // query, blur/refocus). Without this an old highlight could land
  // on a different row after the list rebuilds.
  useEffect(() => { setActive(-1); }, [focused, suggestions.length]);

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (showList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1 >= suggestions.length ? 0 : i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && active >= 0 && active < suggestions.length) {
        e.preventDefault();
        onSuggestionPick(suggestions[active]);
        return;
      }
    }
    if (e.key === 'Enter') onSubmit();
  }

  function handleClear() {
    onChange('');
    setActive(-1);
    onClose?.();
  }

  const listboxId = `jobs-search-${name}-suggest`;
  const activeId = active >= 0 ? `jobs-search-${name}-opt-${active}` : undefined;

  return (
    <div className={`jobs-search-field${focused ? ' is-focused' : ''}`}>
      <label htmlFor={`jobs-search-${name}`}>{label}</label>
      <div className="jobs-search-field-row">
        <input
          id={`jobs-search-${name}`}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          data-testid={`jobs-search-${name}`}
        />
        {value && (
          <button
            type="button"
            className="jobs-search-clear"
            onClick={handleClear}
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
          >×</button>
        )}
      </div>
      {showList && (
        <ul
          id={listboxId}
          className="jobs-search-suggest"
          role="listbox"
          data-testid={listboxId}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id || s.name || s}
              role="option"
              id={`jobs-search-${name}-opt-${i}`}
              aria-selected={active === i}
            >
              <button
                type="button"
                className={active === i ? 'is-active' : undefined}
                onMouseDown={(e) => e.preventDefault() /* keep focus until pick fires */}
                onMouseEnter={() => setActive(i)}
                onClick={() => onSuggestionPick(s)}
              >
                {s.name || s.label || String(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <div
          className="jobs-search-suggest-empty"
          role="status"
          data-testid={`jobs-search-${name}-empty`}
        >
          {emptyHint}
        </div>
      )}
    </div>
  );
}

/* ---------- Page ----------------------------------------------------------- */

export default function Jobs() {
  const { role, user } = useAuth();
  const isCandidate = role === 'candidate';
  // Resolve once and pass to every JobCard render path so the
  // top-right heart/bookmark cluster, match badge, and Apply row
  // only appear for the candidate role. Employer/admin/guest
  // viewers see the same job card without the candidate-only
  // affordances.
  const viewer = viewerForRole(role);
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
  const [companyInput, setCompanyInput] = useState(filters.company);

  // Modern search bar state: which field is focused (drives the
  // suggestion dropdown visibility), live skill suggestions from the
  // catalogue, and the recent-searches stash.
  const [focusedField, setFocusedField] = useState(null);
  const [skillSuggestions, setSkillSuggestions] = useState([]);
  const [recentSearches, setRecentSearches] = useState(() => loadRecent());
  const searchBarRef = useRef(null);

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
        && filters.company === companyInput
      ) return;
      setPage(1);
      setFilters((prev) => ({
        ...prev,
        keyword: keywordInput,
        skills: skillsInput,
        location: locationInput,
        company: companyInput,
      }));
    }, 350);
    return () => clearTimeout(handle);
  }, [keywordInput, skillsInput, locationInput, companyInput, filters.keyword, filters.skills, filters.location, filters.company]);

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
    if (filters.company) next.set('company', filters.company);
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
    if (filters.verified_only) next.set('verified_only', '1');
    setSearchParams(next, { replace: true });
  }, [filters, isCandidate, setSearchParams]);

  /*
   * Skill suggestions for the Skills field. We re-query the catalogue
   * (debounced at 200ms) every time `skillsInput` changes — fewer
   * keystrokes than the main filter debounce so the dropdown feels
   * live. Anything short (< 1 char) clears the list to avoid
   * showing the entire skill catalogue.
   */
  useEffect(() => {
    if (focusedField !== 'skills') return undefined;
    const q = (skillsInput || '').trim();
    if (q.length < 1) { setSkillSuggestions([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        const rows = await skillsApi.search(q, 8);
        const list = rows?.records || rows?.rows || rows || [];
        setSkillSuggestions(Array.isArray(list) ? list.slice(0, 8) : []);
      } catch {
        setSkillSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [skillsInput, focusedField]);

  /*
   * Outside-click → blur the focused field (closes the suggestion
   * dropdown / recent-searches popover). Listens on the document and
   * unwires on unmount.
   */
  useEffect(() => {
    function onDocClick(e) {
      if (!searchBarRef.current) return;
      if (!searchBarRef.current.contains(e.target)) setFocusedField(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /**
   * Commit the current text inputs to filters immediately (instead of
   * waiting for the 350ms debounce) and push the keyword onto the
   * recent-searches stash. Wired to the search-bar's submit + the
   * primary Search button.
   */
  function commitSearch() {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      keyword: keywordInput,
      skills: skillsInput,
      location: locationInput,
      company: companyInput,
    }));
    if (keywordInput.trim()) {
      setRecentSearches(pushRecent(keywordInput));
    }
    setFocusedField(null);
  }

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
          company: filters.company || undefined,
          job_type: filters.job_type || undefined,
          experience_level: filters.experience_level || undefined,
          work_mode: filters.work_mode || undefined,
          salary_min: filters.salary_min,
          salary_max: filters.salary_max,
          posted_within_days: filters.posted_within > 0 ? filters.posted_within : undefined,
          // AI match minimum — meaningful only for signed-in candidates.
          // Sent as `threshold` to align with the existing backend param.
          // The `ai_recommended` sort is a preset that bumps the floor
          // to 70 (Strong + Good fit only) and falls back to best_match
          // server-side, which the backend already understands.
          threshold: isCandidate && Number.isFinite(filters.match_threshold)
            ? Math.max(filters.match_threshold, filters.sort === 'ai_recommended' ? 70 : 0)
            : (filters.sort === 'ai_recommended' ? 70 : undefined),
          // `ai_recommended` is a client-side preset — the backend only
          // honours canonical sort keys, so we translate before sending.
          sort: filters.sort === 'ai_recommended' ? 'best_match' : filters.sort,
          // Verified employer filter — backend reads
          // `companies.verification_status='verified'`. Omitting the
          // param entirely (vs sending `false`) keeps the URL clean.
          verified_only: filters.verified_only ? true : undefined,
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
    setCompanyInput('');
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

      {/*
       * Modern Jobs search bar — sits between the page hero and the
       * browse layout. Four canonical fields (Job title, Skills,
       * Company, Location) with a single primary Search button. Skill
       * suggestions and recent searches live here too. The previous
       * sidebar duplicates for keyword / skills / location were
       * removed; the sidebar keeps only advanced filters (work mode,
       * salary, posted-within, experience level, AI match minimum,
       * sort). No internal scrollbars.
       */}
      <div className="container jobs-search-band">
        <form
          className="jobs-search-bar"
          ref={searchBarRef}
          onSubmit={(e) => { e.preventDefault(); commitSearch(); }}
          role="search"
        >
          <SearchField
            label="Job title"
            name="title"
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={commitSearch}
            placeholder="e.g. Senior Frontend Engineer"
            onFocus={() => setFocusedField('title')}
            onClose={() => setFocusedField(null)}
            focused={focusedField === 'title'}
            suggestions={
              focusedField === 'title' && !keywordInput && recentSearches.length > 0
                ? recentSearches.map((s) => ({ id: `recent-${s}`, name: s }))
                : []
            }
            onSuggestionPick={(s) => { setKeywordInput(s.name || s); setFocusedField(null); }}
          />
          <SearchField
            label="Skills"
            name="skills"
            value={skillsInput}
            onChange={setSkillsInput}
            onSubmit={commitSearch}
            placeholder="react, node.js, aws"
            onFocus={() => setFocusedField('skills')}
            onClose={() => setFocusedField(null)}
            focused={focusedField === 'skills'}
            suggestions={focusedField === 'skills' ? skillSuggestions : []}
            emptyHint="No matching skills found"
            onSuggestionPick={(s) => {
              // Append to existing comma-separated list, dedup case-insensitively.
              const name = s.name || String(s);
              const existing = skillsInput.split(',').map((x) => x.trim()).filter(Boolean);
              if (!existing.some((x) => x.toLowerCase() === name.toLowerCase())) existing.push(name);
              setSkillsInput(existing.join(', '));
              setFocusedField(null);
            }}
          />
          <SearchField
            label="Company"
            name="company"
            value={companyInput}
            onChange={setCompanyInput}
            onSubmit={commitSearch}
            placeholder="Company name"
            onFocus={() => setFocusedField('company')}
            onClose={() => setFocusedField(null)}
            focused={focusedField === 'company'}
          />
          <SearchField
            label="Location"
            name="location"
            value={locationInput}
            onChange={setLocationInput}
            onSubmit={commitSearch}
            placeholder="City or country"
            onFocus={() => setFocusedField('location')}
            onClose={() => setFocusedField(null)}
            focused={focusedField === 'location'}
          />
          <button
            type="submit"
            className="btn btn-coral jobs-search-submit"
            data-testid="jobs-search-submit"
            aria-label="Search jobs"
          >
            <SearchIcon /> Search
          </button>
        </form>
        {recentSearches.length > 0 && (keywordInput === '' && focusedField !== 'title') && (
          <div className="jobs-search-recent" aria-label="Recent searches">
            <span className="jobs-search-recent-label">Recent:</span>
            {recentSearches.map((s) => (
              <button
                key={s}
                type="button"
                className="jobs-search-recent-chip"
                onClick={() => { setKeywordInput(s); commitSearch(); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="container browse-layout">
        <aside className="filters">
          {/*
           * Advanced filters only — Keyword / Skills / Company /
           * Location moved to the search bar above. Work-mode pill
           * row stays here as a quick chip filter that complements
           * the location text input.
           */}
          {/*
            * Trust filter — narrows the feed to companies whose
            * `verification_status='verified'`. Sits at the top of
            * the sidebar so it reads as a quality gate rather than
            * a typical attribute filter. Toggle-style chip so the
            * state is obvious at a glance.
            */}
          <div className="filter-group">
            <h4>Trust signals</h4>
            <button
              type="button"
              role="switch"
              aria-checked={!!filters.verified_only}
              className={`seg-btn${filters.verified_only ? ' active' : ''}`}
              onClick={() => update({ verified_only: !filters.verified_only })}
              data-testid="filter-verified-only"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              title="Show only jobs posted by verified employers"
            >
              {filters.verified_only ? '✓ ' : ''}Verified employers only
            </button>
          </div>
          <div className="filter-group">
            <h4>Work mode</h4>
            <div className="seg-row" role="group" aria-label="Work mode">
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
              <select
                className="sort-select"
                aria-label="Sort jobs"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value })}
              >
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
                        viewer={viewer}
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
