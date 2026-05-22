/**
 * JobCard
 *
 * Compact card for a single job. Used on Home, Jobs, Favourites' similar
 * rail, the JobDetail page's recommendations rail, and the company
 * dashboard.
 *
 * Structure (May 2026 — clickable-card pass)
 * ------------------------------------------
 * The "View details" button is gone. The card itself is now the
 * navigation surface — clicking anywhere on the body opens the Job
 * Detail page. Apply / Favourite / Save still work because their
 * handlers call `e.stopPropagation()` so the parent click is never
 * triggered.
 *
 * The "Missing skills" row (from match.service) used to sit INSIDE the
 * card where it got clipped by the card's own padding/border. It now
 * lives OUTSIDE the card body, as a sibling inside a
 * `.job-card-wrapper`. Wrapping the card means the missing chips
 * always wrap freely without clipping, and the card itself stays the
 * same equal-height tile in the grid.
 *
 *   <div className="job-card-wrapper">
 *     <div className="job-card clickable">  ← clicks → /jobs/:id
 *       …
 *     </div>
 *     <div className="missing-skills-section">
 *       Missing: [react.js] [next.js] [typescript] [graphql]
 *     </div>
 *   </div>
 *
 * @param {object}   props.job       View-model from `toJobCardShape(...)`
 * @param {boolean}  [props.featured] Show the FEATURED ribbon
 * @param {function} [props.onApply]  Optional handler; renders Apply button
 *                                    only when onApply is provided
 * @param {boolean}  [props.applied]  Render "Already Applied" pill instead
 *                                    of Apply button (defensive — applied
 *                                    jobs are already filtered server-side)
 */
import { useNavigate } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext.jsx';
import { useSavedJobs } from '../context/SavedJobsContext.jsx';

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18l-7-4-7 4V4z" />
    </svg>
  );
}

function MatchBadge({ score }) {
  let tone = '#5a6268', bg = 'rgba(90,98,104,.08)';
  if (score >= 75) { tone = 'var(--coral, #e8593b)'; bg = 'rgba(232,89,59,.12)'; }
  else if (score >= 60) { tone = 'var(--gold, #c08a3a)'; bg = 'rgba(192,138,58,.12)'; }
  return (
    <span
      className="job-tag match"
      title="Personalised match score"
      style={{ background: bg, color: tone, fontWeight: 600 }}
    >
      ★ {score}% match
    </span>
  );
}

export default function JobCard({ job, featured = false, onApply, applied = false }) {
  const navigate = useNavigate();
  const { isSaved, toggleSave } = useFavorites();
  const { isSavedForLater, toggleSave: toggleSavedForLater } = useSavedJobs();
  const saved = isSaved(job.id);
  const savedForLater = isSavedForLater(job.id);
  const score = job.matchScore;
  const visibleSkills = (job.tags || []).slice(0, 3);
  const extraSkills = Math.max(0, (job.tags || []).length - visibleSkills.length);
  const missing = Array.isArray(job.missing) ? job.missing : [];

  function openDetail() {
    navigate(`/jobs/${job.id}`);
  }

  function handleCardKey(e) {
    // Activate the whole card via keyboard (Enter / Space) to match
    // mouse click. Keeps the card accessible without a separate link.
    if (e.key === 'Enter' || e.key === ' ') {
      // Skip if focus is on an inner interactive element (button) — the
      // browser will fire that element's own activation, not the card's.
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input') return;
      e.preventDefault();
      openDetail();
    }
  }

  return (
    <div className="job-card-wrapper">
      <div
        className={`job-card clickable${featured && job.featured ? ' featured' : ''}`}
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={handleCardKey}
        aria-label={`Open details for ${job.title} at ${job.co}`}
      >
        {/*
          * Top-right action cluster. Order is:
          *
          *     [ FEATURED ]   [ ♥ Favourite ]   [ ⌘ Save-for-later ]
          *
          * The FEATURED badge used to sit at the card's top-LEFT via a
          * `::before` pseudo-element where it overlapped the company
          * logo. Moving it inline here keeps the head row clean and
          * lets the badge sit alongside the icons it visually relates
          * to. On narrow widths the cluster wraps to a second line so
          * the badge doesn't push the icons off the edge.
          */}
        <div className="job-card-actions" aria-label="Card actions">
          {featured && job.featured && (
            <span className="featured-badge" aria-label="Featured job">FEATURED</span>
          )}
          <button
            className={`job-icon-btn${saved ? ' is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleSave(job.id); }}
            title={saved ? 'Remove from favourites' : 'Add to favourites'}
            aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={saved}
            type="button"
          >
            <HeartIcon filled={saved} />
          </button>
          <button
            className={`job-icon-btn${savedForLater ? ' is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleSavedForLater(job.id); }}
            title={savedForLater ? 'Remove from saved' : 'Save for later'}
            aria-label={savedForLater ? 'Remove from saved' : 'Save for later'}
            aria-pressed={savedForLater}
            type="button"
          >
            <BookmarkIcon filled={savedForLater} />
          </button>
        </div>

        <div className="job-head">
          <div className={`job-logo ${job.cl}`}>{job.l}</div>
          <div className="job-head-text">
            <div className="job-co text-truncate" title={job.co}>{job.co}</div>
            <div className="job-loc text-truncate" title={job.loc}>{job.loc}</div>
          </div>
        </div>

        <div className="job-title text-clamp-2" title={job.title}>{job.title}</div>

        {/* Meta row — experience · job type · deadline */}
        <div className="job-meta-row">
          {job.experience && <span className="meta-chip" title={`Experience: ${job.experience}`}>{job.experience}</span>}
          {job.type && <span className="meta-chip" title={`Job type: ${job.type}`}>{job.type}</span>}
          {job.deadline && (
            <span
              className={`meta-chip${job.isExpired ? ' meta-chip-warn' : ''}`}
              title={job.deadlineRaw ? new Date(job.deadlineRaw).toLocaleString() : 'Apply deadline'}
            >
              {job.deadline}
            </span>
          )}
        </div>

        {/* Skills + match badge */}
        <div className="job-tags">
          {score != null && <MatchBadge score={score} />}
          {visibleSkills.map((t) => (
            <span key={t} className="job-tag" title={t}>{t}</span>
          ))}
          {extraSkills > 0 && (
            <span className="job-tag job-tag-more" title="More skills required for this role">+{extraSkills}</span>
          )}
        </div>

        {Array.isArray(job.reasons) && job.reasons.length > 0 && (
          <div className="job-reasons">
            {job.reasons.slice(0, 2).map((r, i) => (
              <span key={i} className="job-reason-chip">{r}</span>
            ))}
          </div>
        )}

        {/* spacer pushes footer + actions to the bottom of the card */}
        <div style={{ flex: 1 }} />

        <div className="job-foot">
          <div className="job-pay text-truncate" title={`${job.pay} · ${job.type}`}>
            {job.pay} <span>· {job.type}</span>
          </div>
          <div className="job-time">{job.time}</div>
        </div>

        {/* Apply row (View Details removed — whole card is clickable) */}
        <div className="job-actions-row">
          {applied ? (
            <span className="pill pill-applied" style={{ alignSelf: 'center' }}>Already Applied</span>
          ) : onApply ? (
            <button
              className="btn btn-coral btn-sm"
              onClick={(e) => { e.stopPropagation(); onApply(job); }}
              type="button"
              disabled={job.isExpired}
              style={{ width: '100%' }}
            >
              {job.isExpired ? 'Expired' : 'Apply now'}
            </button>
          ) : null}
        </div>
      </div>

      {/*
        * Missing-skills section — SIBLING of the card (not inside).
        * Rendering it outside the card guarantees the chips never get
        * clipped by the card's padding, border-radius, or any future
        * `overflow:hidden` styling. The section visually attaches to
        * the card via shared horizontal padding and a small top gap.
        */}
      {missing.length > 0 && (
        <div className="missing-skills-section" aria-label="Skills you're missing for this role">
          <span className="missing-skills-label">Missing:</span>
          <div className="missing-skills-chips">
            {missing.map((m) => (
              <span key={m} className="missing-chip" title={m}>{m}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
