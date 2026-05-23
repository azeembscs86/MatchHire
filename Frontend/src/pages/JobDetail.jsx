/**
 * JobDetail page (/jobs/:id)
 *
 * Full job posting view. Data: `GET /public/jobs/:id` (returns the
 * job + per-viewer flags `is_applied / is_favorited / is_saved_for_later
 * / is_expired / application_status` when called with a candidate
 * token) and `GET /public/jobs/:id/similar` for the recommendations
 * rail.
 *
 * Layout
 * ------
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ Hero: logo · title · company · location · meta-chips      │
 *   │       [ Apply now ] [ ♥ Save fav ] [ ⌘ Save for later ]   │
 *   └───────────────────────────────────────────────────────────┘
 *   ┌──────────────────────────────────┐  ┌──────────────────┐
 *   │ Job description                  │  │ Quick facts      │
 *   │ Responsibilities                 │  │ - Salary         │
 *   │ Requirements                     │  │ - Posted date    │
 *   │ Benefits                         │  │ - Deadline       │
 *   │ Required skills                  │  │ - Applications   │
 *   └──────────────────────────────────┘  │ Company snippet  │
 *                                         └──────────────────┘
 *
 *   "Recommended Jobs for You" — grid of JobCard
 *
 * Action state rules:
 *   - `is_expired=true`   → all three actions disabled with "Expired" copy.
 *   - `is_applied=true`   → Apply button replaced with "Already Applied"
 *                            pill; Save / Favourite still work.
 *   - signed-in candidate → Apply uses /validate-and-apply (gated by
 *                            match score). Guests are redirected to
 *                            sign-in via AuthModal.
 *
 * Save / Favourite state hydrates from FavoritesContext + SavedJobsContext
 * so toggles here update other surfaces (header badge, JobCard hearts,
 * dashboard counts) instantly.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { publicApi, candidatesApi } from '../api/index.js';
import { toJobCardShape, filterActiveJobs } from '../api/adapters.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuthModal } from '../context/AuthModalContext.jsx';
import { useFavorites } from '../context/FavoritesContext.jsx';
import { useSavedJobs } from '../context/SavedJobsContext.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import JobCard from '../components/JobCard.jsx';

const STATUS_LABEL = {
  applied:      'Applied',
  reviewing:    'Under Review',
  under_review: 'Under Review',
  shortlisted:  'Shortlisted',
  interview:    'Interview Scheduled',
  offered:      'Accepted',
  hired:        'Accepted',
  accepted:     'Accepted',
  rejected:     'Rejected',
  withdrawn:    'Withdrawn',
};

const STATUS_CLASS = {
  applied:      'pill-applied',
  reviewing:    'pill-review',
  under_review: 'pill-review',
  shortlisted:  'pill-shortlisted',
  interview:    'pill-interview',
  offered:      'pill-accepted',
  hired:        'pill-accepted',
  accepted:     'pill-accepted',
  rejected:     'pill-rejected',
  withdrawn:    'pill-rejected',
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatSalary(min, max, currency = 'USD', period = 'year') {
  if (!min && !max) return 'Competitive';
  const sym = currency === 'USD' ? '$' : (currency + ' ');
  const k = (n) => `${Math.round(Number(n) / 1000)}K`;
  const range = min && max ? `${sym}${k(min)} – ${sym}${k(max)}` : (min ? `From ${sym}${k(min)}` : `Up to ${sym}${k(max)}`);
  return `${range} · per ${period}`;
}

function splitTags(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return String(s).split(',').map((t) => t.trim()).filter(Boolean);
}

/** Split free-text responsibilities/requirements/benefits into bullets. */
function asBullets(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n|•|·| - (?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { openAuth } = useAuthModal();
  const isCandidate = !!user && role === 'candidate';

  const { isSaved, toggleSave: toggleFav } = useFavorites();
  const { isSavedForLater, toggleSave: toggleSavedForLater } = useSavedJobs();

  const [job, setJob] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState(null);
  // Per-card applying state for the "Recommended for you" rail at the
  // bottom of the page. Tracked separately from the hero `applying`
  // flag so the hero button doesn't show a spinner while the rail
  // card the candidate just clicked submits.
  const [similarApplyingId, setSimilarApplyingId] = useState(null);
  // In-session record of similar-rail jobs the candidate just applied
  // to. The rail removes them after success anyway, but this covers
  // the moment between API success and React re-render.
  const [similarAppliedIds, setSimilarAppliedIds] = useState(() => new Set());

  // Load detail + similar in parallel. Re-runs when the URL :id changes
  // (e.g. clicking a recommended card) so the page swaps in-place.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setActionMessage(null);
      try {
        const [detail, simResp] = await Promise.all([
          publicApi.job(Number(id)),
          publicApi.similarJobs(Number(id), 6).catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        setJob(detail);
        setHasApplied(!!detail?.is_applied);
        setApplicationStatus(detail?.application_status || null);
        // Similar-jobs rail is candidate-facing — drop any expired
        // postings client-side as a backstop. The hero/detail above
        // can still render an expired anchor job (with the "no longer
        // available" message) because it uses `toJobCardShape` directly.
        setSimilar(filterActiveJobs(simResp?.records));
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const cardShape = useMemo(() => job ? toJobCardShape(job) : null, [job]);
  const isExpired = !!job?.is_expired
    || (job?.application_deadline && new Date(job.application_deadline).getTime() < Date.now());

  // Save / Favourite are derived from contexts so toggles on other
  // pages (Jobs, Favorites, SavedJobs) update this page live.
  const favActive = job ? isSaved(job.id) : false;
  const savedActive = job ? isSavedForLater(job.id) : false;

  async function handleApply() {
    if (!job) return;
    if (!isCandidate) { openAuth('signin'); return; }
    if (isExpired || hasApplied) return;
    setApplying(true);
    setActionMessage(null);
    try {
      const result = await candidatesApi.validateAndApply(job.id, {});
      setHasApplied(true);
      setApplicationStatus('applied');
      setActionMessage({
        ok: true,
        text: `Application submitted${result?.match_score != null ? ` · ${result.match_score}% match` : ''}.`,
      });
      // Remove this job from the similar rail if it sneaks in.
      setSimilar((rows) => rows.filter((r) => r.id !== job.id));
    } catch (err) {
      const data = err.original?.response?.data?.Data;
      if (data && data.decision === 'rejected') {
        setActionMessage({
          ok: false,
          text: data.message || 'Your profile does not yet meet this role\'s minimum requirements.',
        });
      } else {
        setActionMessage({ ok: false, text: err.message || 'Could not submit application.' });
      }
    } finally {
      setApplying(false);
    }
  }

  function handleFavToggle() {
    if (!job) return;
    if (!isCandidate) { openAuth('signin'); return; }
    if (isExpired) return;
    toggleFav(job.id);
  }
  function handleSaveToggle() {
    if (!job) return;
    if (!isCandidate) { openAuth('signin'); return; }
    if (isExpired) return;
    toggleSavedForLater(job.id);
  }

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '60px 0' }}>
          <LoadingState label="Loading job…" />
        </div>
      </section>
    );
  }

  if (error || !job) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '40px 0' }}>
          {error ? <ErrorState error={error} /> : <EmptyState title="Job not found" />}
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" type="button" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </div>
      </section>
    );
  }

  const skills = splitTags(job.skills_tags);
  const responsibilities = asBullets(job.responsibilities);
  const requirements = asBullets(job.requirements);
  const benefits = asBullets(job.benefits);

  return (
    <section className="view active" id="view-job-detail">
      <div className="container" style={{ padding: '32px 0 80px' }}>

        <div className="jd-breadcrumb">
          <Link to="/jobs">← All jobs</Link>
        </div>

        {/*
          * Expired hero banner. When a candidate lands on a direct URL
          * for a job whose application deadline has passed, we surface
          * a clean "no longer available" message at the top of the
          * page and route them straight back to the active listings.
          * The hero/details below still render (so the candidate
          * understands what the role was), but every action button is
          * already disabled by the `isExpired` check downstream.
          */}
        {isExpired && (
          <div className="jd-unavailable" role="status" aria-live="polite">
            <div className="jd-unavailable-icon" aria-hidden="true">⌛</div>
            <div className="jd-unavailable-text">
              <strong>This job is no longer available.</strong>
              <p>
                The application deadline has passed. Browse currently open roles
                — your profile is already set up to match new postings as they
                go live.
              </p>
            </div>
            <Link to="/jobs" className="btn btn-coral">Browse active jobs →</Link>
          </div>
        )}

        {/* HERO */}
        <header className={`jd-hero${isExpired ? ' jd-hero-expired' : ''}`}>
          <div className="jd-hero-main">
            <div className={`jd-logo ${cardShape?.cl || 'lg-1'}`}>{cardShape?.l || '·'}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="jd-eyebrow">
                {job.company_name}
                {job.is_featured && <span className="jd-eyebrow-badge">Featured</span>}
                {isExpired && <span className="pill pill-rejected" style={{ marginLeft: 10 }}>Expired</span>}
                {hasApplied && (
                  <span
                    className={`pill ${STATUS_CLASS[applicationStatus] || 'pill-applied'}`}
                    style={{ marginLeft: 10 }}
                  >
                    {STATUS_LABEL[applicationStatus] || 'Applied'}
                  </span>
                )}
              </div>
              <h1 className="jd-title">{job.title}</h1>
              <div className="jd-meta-row">
                <span className="meta-chip">{cardShape?.loc}</span>
                {cardShape?.type && <span className="meta-chip">{cardShape.type}</span>}
                {cardShape?.experience && <span className="meta-chip">{cardShape.experience}</span>}
                {cardShape?.deadline && (
                  <span className={`meta-chip${isExpired ? ' meta-chip-warn' : ''}`}>
                    {cardShape.deadline}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ACTION BAR — Apply / Save / Favourite */}
          <div className="jd-actions">
            {hasApplied ? (
              <button
                className="btn btn-coral apply-btn apply-btn-applied"
                disabled
                aria-disabled="true"
                type="button"
                style={{ minWidth: 180 }}
              >
                ✓ Already Applied
              </button>
            ) : isExpired ? (
              <button
                className="btn btn-coral apply-btn apply-btn-expired"
                disabled
                aria-disabled="true"
                type="button"
                style={{ minWidth: 180 }}
                title="This job is no longer accepting applications"
              >
                Job Expired
              </button>
            ) : (
              <button
                className="btn btn-coral apply-btn"
                onClick={handleApply}
                disabled={applying}
                aria-busy={applying}
                type="button"
                style={{ minWidth: 180 }}
                title="Apply to this job"
              >
                {applying ? 'Submitting…' : 'Apply Now'}
              </button>
            )}
            <button
              className={`btn btn-ghost jd-icon-btn${favActive ? ' is-active' : ''}`}
              onClick={handleFavToggle}
              disabled={isExpired}
              type="button"
              title={favActive ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={favActive}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>{favActive ? '♥' : '♡'}</span>
              {favActive ? 'Favourited' : 'Favourite'}
            </button>
            <button
              className={`btn btn-ghost jd-icon-btn${savedActive ? ' is-active' : ''}`}
              onClick={handleSaveToggle}
              disabled={isExpired}
              type="button"
              title={savedActive ? 'Remove from saved' : 'Save for later'}
              aria-pressed={savedActive}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>⌘</span>
              {savedActive ? 'Saved' : 'Save for later'}
            </button>
          </div>

          {actionMessage && (
            <div
              role="status"
              className={`jd-toast${actionMessage.ok ? ' ok' : ' err'}`}
            >
              {actionMessage.text}
            </div>
          )}
        </header>

        {/* TWO-COLUMN BODY */}
        <div className="jd-grid">
          <div className="jd-main">
            {job.description && (
              <section className="jd-section">
                <h2>About the role</h2>
                <p style={{ whiteSpace: 'pre-line' }}>{job.description}</p>
              </section>
            )}

            {responsibilities.length > 0 && (
              <section className="jd-section">
                <h2>Responsibilities</h2>
                <ul className="jd-bullets">
                  {responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </section>
            )}

            {requirements.length > 0 && (
              <section className="jd-section">
                <h2>Requirements</h2>
                <ul className="jd-bullets">
                  {requirements.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </section>
            )}

            {benefits.length > 0 && (
              <section className="jd-section">
                <h2>Benefits</h2>
                <ul className="jd-bullets">
                  {benefits.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </section>
            )}

            {skills.length > 0 && (
              <section className="jd-section">
                <h2>Skills required</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {skills.map((s) => <span key={s} className="job-tag" style={{ fontSize: 12 }}>{s}</span>)}
                </div>
              </section>
            )}
          </div>

          <aside className="jd-side">
            <div className="jd-card">
              <h3>Quick facts</h3>
              <dl className="jd-facts">
                <div><dt>Salary</dt><dd>{formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period || 'year')}</dd></div>
                <div><dt>Job type</dt><dd>{cardShape?.type || '—'}</dd></div>
                <div><dt>Experience</dt><dd>{cardShape?.experience || '—'}</dd></div>
                <div><dt>Location</dt><dd>{cardShape?.loc || '—'}</dd></div>
                <div><dt>Posted</dt><dd>{formatDate(job.published_at || job.created_at)}</dd></div>
                <div>
                  <dt>Deadline</dt>
                  <dd className={isExpired ? 'jd-fact-warn' : ''}>
                    {job.application_deadline
                      ? `${formatDate(job.application_deadline)}${isExpired ? ' (expired)' : ''}`
                      : 'No deadline'}
                  </dd>
                </div>
                <div><dt>Applications</dt><dd>{job.applications_count ?? 0}</dd></div>
                <div><dt>Views</dt><dd>{job.views_count ?? 0}</dd></div>
              </dl>
            </div>

            <div className="jd-card">
              <h3>About {job.company_name}</h3>
              {job.company_industry && (
                <p className="muted" style={{ fontSize: 13 }}>{job.company_industry}</p>
              )}
              {job.company_location && (
                <p style={{ fontSize: 13 }}>{job.company_location}</p>
              )}
              <Link to={`/companies/${job.company_id}`} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
                View company →
              </Link>
            </div>
          </aside>
        </div>

        {/* RECOMMENDED JOBS RAIL */}
        <div style={{ marginTop: 56 }}>
          <div className="section-head" style={{ marginBottom: 24 }}>
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 12 }}>★ Tailored to you</span>
              <h2 className="display" style={{ fontSize: 32 }}>
                Recommended Jobs <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>for you</span>
              </h2>
            </div>
            <Link to="/jobs" className="section-link">Browse all →</Link>
          </div>

          {similar.length === 0 ? (
            <div className="fav-empty">
              <div className="fav-empty-icon">★</div>
              <h3>No similar roles right now</h3>
              <p>We couldn't find open postings that match this role closely. Try browsing all jobs — your dashboard will keep learning as you save and apply.</p>
              <Link to="/jobs" className="btn btn-coral">Browse all jobs →</Link>
            </div>
          ) : (
            <div className="jobs-grid">
              {similar.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  featured
                  applied={similarAppliedIds.has(j.id)}
                  applyingId={similarApplyingId}
                  onApply={isCandidate ? async (target) => {
                    if (!isCandidate) { openAuth('signin'); return; }
                    if (target.isExpired) return;
                    setSimilarApplyingId(target.id);
                    try {
                      await candidatesApi.validateAndApply(target.id, {});
                      setSimilarAppliedIds((prev) => {
                        const next = new Set(prev);
                        next.add(target.id);
                        return next;
                      });
                      // Drop the freshly-applied row from the rail so the
                      // candidate doesn't see Apply on it twice.
                      setSimilar((rows) => rows.filter((r) => r.id !== target.id));
                      setActionMessage({ ok: true, text: `Application submitted to ${target.co}.` });
                    } catch (err) {
                      const data = err.original?.response?.data?.Data;
                      setActionMessage({
                        ok: false,
                        text: (data?.decision === 'rejected' && data?.message)
                          ? data.message
                          : (err.message || 'Could not submit application.'),
                      });
                    } finally {
                      setSimilarApplyingId(null);
                    }
                  } : undefined}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
