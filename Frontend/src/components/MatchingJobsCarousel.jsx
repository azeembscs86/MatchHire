/**
 * MatchingJobsCarousel
 *
 * Horizontal carousel rendered at the bottom of the candidate
 * detail page when the viewer is the logged-in employer. Shows the
 * employer's active job board scored against the candidate — only
 * postings with match > 50% — in a single row that scrolls
 * horizontally. Replaces the previous side-rail panel so the
 * candidate detail page reads as one continuous profile.
 *
 * Behaviour
 *   - Reuses the same shared `<JobCard>` used everywhere else, so
 *     the visual language (Featured pill, match badge, missing-
 *     skills chips, Apply Now / Already Applied states) is
 *     identical to the Home and Jobs grids.
 *   - Scroll-snap on the container gives the swipe a clean stop
 *     per card on mobile + trackpad.
 *   - Desktop gets left/right arrow controls that only render when
 *     the row is actually scrollable AND the user isn't already at
 *     that edge.
 *   - Loading: 3 skeleton tiles in the same width so the layout
 *     doesn't reflow.
 *   - Empty: the spec-mandated copy "No matching jobs from your
 *     company found for this candidate."
 *
 * Security: this component is gated by the caller (CandidateDetail
 * only mounts it for employer viewers). The endpoint also enforces
 * `requireEmployer` server-side, so a stray render couldn't leak
 * data.
 *
 * @param {number} props.candidateId  Candidate user id.
 */
import { useEffect, useRef, useState } from 'react';
import { employersApi } from '../api/index.js';
import { formatSalary } from '../api/adapters.js';
import JobCard from './JobCard.jsx';

const LOGO_TONES = ['lg-1', 'lg-2', 'lg-3', 'lg-4', 'lg-5', 'lg-6', 'lg-7', 'lg-8'];
function toneFor(id) {
  const n = Math.abs(Number(id) || 0);
  return LOGO_TONES[n % LOGO_TONES.length];
}
function firstLetter(s) { return (s || '·').trim()[0]?.toUpperCase() || '·'; }

// Salary formatter — re-exported from `adapters.js` so this surface
// matches the project-wide "PKR 500,000/month" format. The previous
// local "K" shorthand is retired.

function deadlineLabel(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = ts - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 7) return `Closes in ${days}d`;
  return `Closes ${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

function splitTags(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return String(s).split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Map a `matching-jobs` API row onto the JobCard view-model. The
 * carousel uses the shared card, so we have to translate the
 * subset of fields the API ships back into the shape `JobCard`
 * expects (the same shape `toJobCardShape` would produce from a
 * raw job row).
 */
function toCardShape(r) {
  const deadline = deadlineLabel(r.application_deadline);
  return {
    id: r.job_id,
    co: r.company_name || 'Your company',
    l: firstLetter(r.company_name),
    cl: toneFor(r.company_id || r.job_id),
    title: (r.job_title || '').replace(/\s*\[match-seed-v1-\d+\]$/, ''),
    loc: [r.location, r.country, r.is_remote ? 'Remote' : null].filter(Boolean).join(' · ') || 'Remote',
    type: String(r.job_type || 'full_time').replace(/_/g, '-')
      .replace(/(^|-)([a-z])/g, (_m, p, c) => (p ? '-' : '') + c.toUpperCase()),
    pay: formatSalary(r.salary_min, r.salary_max, r.salary_currency, r.salary_period),
    tags: splitTags(r.skills_tags).slice(0, 4),
    experience: r.experience_level
      ? r.experience_level.charAt(0).toUpperCase() + r.experience_level.slice(1) + '-level'
      : null,
    deadline,
    deadlineRaw: r.application_deadline || null,
    isExpired: false, // backend filtered
    time: relativeTime(r.published_at),
    matchScore: r.match_score,
    match: `${r.match_score}% match`,
    reasons: r.match_reasons || [],
    missing: r.missing_skills || [],
    featured: !!r.is_featured,
    isGlobalRemote: !!r.is_global_remote,
    workMode: r.work_mode || null,
    closingSoon: (() => {
      if (!r.application_deadline) return false;
      const ts = new Date(r.application_deadline).getTime();
      if (!Number.isFinite(ts)) return false;
      const ms = ts - Date.now();
      return ms > 0 && ms <= 3 * 86400000;
    })(),
  };
}

export default function MatchingJobsCarousel({ candidateId }) {
  const [state, setState] = useState({ records: [], loading: true, error: null });
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ records: [], loading: true, error: null });
    employersApi.matchingJobsForCandidate(candidateId)
      .then((data) => {
        if (cancelled) return;
        const records = (data?.records || []).map(toCardShape);
        setState({ records, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ records: [], loading: false, error: err });
      });
    return () => { cancelled = true; };
  }, [candidateId]);

  /**
   * Recompute whether the arrow controls should be visible. We
   * track this in state so React re-renders the arrows when the
   * user scrolls the row by trackpad / swipe — not just when
   * they click an arrow.
   */
  function updateArrowVisibility() {
    const el = scrollRef.current;
    if (!el) return;
    const epsilon = 4; // sub-pixel rounding tolerance
    setCanScrollLeft(el.scrollLeft > epsilon);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - epsilon);
  }

  useEffect(() => {
    updateArrowVisibility();
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', updateArrowVisibility, { passive: true });
    window.addEventListener('resize', updateArrowVisibility);
    return () => {
      el.removeEventListener('scroll', updateArrowVisibility);
      window.removeEventListener('resize', updateArrowVisibility);
    };
  }, [state.records.length]);

  function scrollByCard(direction) {
    const el = scrollRef.current;
    if (!el) return;
    // One card-width-ish per click — sized roughly to the JobCard
    // fixed width below so the scroll-snap stops on the next card.
    const step = Math.max(320, Math.round(el.clientWidth * 0.85));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  return (
    <section className="match-carousel" aria-label="Matching jobs from your company">
      <header className="match-carousel-head">
        <div>
          <h2 className="match-carousel-title">Matching Jobs From Your Company</h2>
          <p className="match-carousel-sub muted">
            Jobs from your company that match this candidate profile
          </p>
        </div>
        {!state.loading && state.records.length > 0 && (
          <div className="match-carousel-arrows" role="group" aria-label="Scroll matching jobs">
            <button
              type="button"
              className="match-carousel-arrow"
              onClick={() => scrollByCard(-1)}
              disabled={!canScrollLeft}
              aria-label="Scroll left"
            >‹</button>
            <button
              type="button"
              className="match-carousel-arrow"
              onClick={() => scrollByCard(1)}
              disabled={!canScrollRight}
              aria-label="Scroll right"
            >›</button>
          </div>
        )}
      </header>

      <div className="match-carousel-scroll" ref={scrollRef}>
        {state.loading ? (
          // 3 skeleton tiles with the same width as a real card so
          // the layout doesn't reflow when the response lands.
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`s-${i}`} className="match-carousel-item skel-card" aria-hidden="true">
              <div className="skel-row">
                <div className="skel-dot" />
                <div style={{ flex: 1 }}>
                  <div className="skel-line w-50" />
                  <div className="skel-line sm w-30" style={{ marginTop: 6 }} />
                </div>
              </div>
              <div className="skel-line lg w-70" />
              <div className="skel-line w-90" />
            </div>
          ))
        ) : state.error ? (
          <div className="match-carousel-empty muted">
            We couldn't load matching jobs right now. Refresh to try again.
          </div>
        ) : state.records.length === 0 ? (
          <div className="match-carousel-empty muted">
            No matching jobs from your company found for this candidate.
          </div>
        ) : (
          state.records.map((j) => (
            <div key={j.id} className="match-carousel-item">
              <JobCard job={j} featured />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
