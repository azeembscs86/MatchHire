/**
 * JobCard — premium, compact, candidate-facing job card.
 *
 * Single source of truth for the job card design used on every
 * candidate-facing surface:
 *
 *   - Home (Recommended, Latest matched, Featured rails)
 *   - Jobs listing page (smart auth-aware feed)
 *   - JobDetail page recommendations rail
 *   - Favourites page (replaces the old custom `.fav-card`)
 *   - Saved-for-later page (replaces the old custom `.fav-card`)
 *   - Dashboard "New matches" rail
 *
 * Design pass (Nov 2026)
 * ----------------------
 *  - Card padding reduced by ~20% and `min-height` lowered so the grid
 *    fits more roles per scroll while staying premium.
 *  - "Missing skills" moved INSIDE the card, sitting under the AI match
 *    badge as compact warning chips. No more sibling-of-card layout that
 *    visually detached the chips from the role.
 *  - Match badge becomes a tiered, labelled control. Tier comes from
 *    `matchScore`: 85+ Strong, 70+ Good, 50+ Moderate, <50 Low. Colour
 *    is restrained so the card still reads as one calm tile.
 *  - "Why recommended" replaces the plain reason pills with a compact
 *    check/cross checklist (✓ matched, ✖ missing).
 *  - Trust badges (Featured / Remote / Closing soon) live in a single
 *    cluster at top-right next to the action icons so nothing overlaps.
 *  - Apply / Already Applied / Job Expired states share one row with
 *    44–48px min height and centred labels.
 *
 * Click target: the card body navigates to `/jobs/:id`. The action
 * buttons (Apply, ♥ favourite, ⌘ save) all call `e.stopPropagation()`
 * so the parent click never fires when their own activation does.
 *
 * @param {object}   props.job          View-model from `toJobCardShape(...)`.
 * @param {boolean}  [props.featured]   Honour the FEATURED ribbon when
 *                                       the job is flagged featured.
 * @param {function} [props.onApply]    Apply handler. Renders the Apply
 *                                       button only when supplied —
 *                                       parent gates this on
 *                                       logged-in-candidate so guests,
 *                                       employers, and admins never
 *                                       see it.
 * @param {boolean}  [props.applied]    Render the "Already Applied"
 *                                       pill instead of Apply.
 * @param {number}   [props.applyingId] When equal to job.id, render the
 *                                       Apply button in its loading
 *                                       state.
 * @param {string}   [props.variant]    `"grid"` (default) or `"row"`.
 *                                       `"row"` collapses the card into
 *                                       a horizontal list-style row
 *                                       suitable for the dashboard
 *                                       matches rail.
 */
import { useNavigate } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext.jsx';
import { useSavedJobs } from '../context/SavedJobsContext.jsx';

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18l-7-4-7 4V4z" />
    </svg>
  );
}

/**
 * Tiered match badge. Tiers come from the spec colour-logic:
 *   85+  → Strong fit   (coral)
 *   70+  → Good fit     (gold)
 *   50+  → Moderate fit (sage)
 *   <50  → Low fit      (muted)
 *
 * Tier label and tint are restrained — the spec calls out "elegant,
 * not too colorful" — so each tier gets a soft tinted background and
 * the same neutral border weight.
 */
function matchTier(score) {
  if (score == null) return null;
  if (score >= 85) return { key: 'strong', label: 'Strong fit', short: 'Excellent match for your profile' };
  if (score >= 70) return { key: 'good',   label: 'Good fit',   short: 'Good fit for your profile' };
  if (score >= 50) return { key: 'mod',    label: 'Moderate fit', short: 'Moderate match — worth a look' };
  return { key: 'low', label: 'Low fit', short: 'Below your usual match range' };
}

function MatchBadge({ score }) {
  const tier = matchTier(score);
  if (!tier) return null;
  return (
    <div className={`match-badge match-badge-${tier.key}`} title={tier.short}>
      <div className="match-badge-row">
        <div className="match-badge-score">
          <strong>{score}%</strong>
          <span>match</span>
        </div>
        <div className="match-badge-meta">
          <span className="match-badge-label">{tier.label}</span>
          <span className="match-badge-sub">{tier.short}</span>
        </div>
      </div>
      <div className="match-badge-track" aria-hidden="true">
        <div className="match-badge-fill" style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

/**
 * Recommended-because checklist. Compact alternative to the old
 * reason-chip row. Renders up to 3 matched reasons (✓) then up to 2
 * missing skills (✖). Nothing renders if neither set has data.
 */
function WhyRecommended({ reasons = [], missing = [] }) {
  const positives = (reasons || []).filter(Boolean).slice(0, 3);
  const negatives = (missing || []).slice(0, 2);
  if (positives.length === 0 && negatives.length === 0) return null;
  return (
    <ul className="why-list" aria-label="Why we're recommending this role">
      {positives.map((r, i) => (
        <li key={`p-${i}`} className="why-item why-item-yes">
          <span className="why-icon" aria-hidden="true">✓</span>
          <span className="why-text">{r}</span>
        </li>
      ))}
      {negatives.map((m, i) => (
        <li key={`n-${i}`} className="why-item why-item-no">
          <span className="why-icon" aria-hidden="true">✖</span>
          <span className="why-text">Missing {m}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Inline trust badges row — Remote / Global remote / Closing soon.
 *
 * The Featured badge used to live in this row but moved into the
 * top-right action cluster (next to the heart + bookmark icons) so
 * the most prominent flag sits at eye level with the actions a
 * candidate is about to take. This row only renders when at least
 * one of the remaining flags applies, keeping the card clean for
 * unflagged roles.
 */
function TrustBadges({ job }) {
  const badges = [];
  if (job.isGlobalRemote) badges.push({ key: 'gr', cls: 'remote', label: 'Global remote' });
  else if (/remote/i.test(job.loc || '')) badges.push({ key: 'rm', cls: 'remote', label: 'Remote' });
  if (job.closingSoon && !job.isExpired) badges.push({ key: 'cs', cls: 'soon', label: job.deadline || 'Closing soon' });
  if (badges.length === 0) return null;
  return (
    <div className="trust-row" aria-label="Job badges">
      {badges.map((b) => (
        <span key={b.key} className={`trust-chip trust-${b.cls}`}>{b.label}</span>
      ))}
    </div>
  );
}

export default function JobCard({
  job,
  featured = false,
  onApply,
  applied = false,
  applyingId = null,
  variant = 'grid',
}) {
  const navigate = useNavigate();
  const { isSaved, toggleSave } = useFavorites();
  const { isSavedForLater, toggleSave: toggleSavedForLater } = useSavedJobs();
  const saved = isSaved(job.id);
  const savedForLater = isSavedForLater(job.id);
  const score = job.matchScore;
  const visibleSkills = (job.tags || []).slice(0, variant === 'row' ? 2 : 3);
  const extraSkills = Math.max(0, (job.tags || []).length - visibleSkills.length);
  const missing = Array.isArray(job.missing) ? job.missing : [];
  const reasons = Array.isArray(job.reasons) ? job.reasons : [];

  function openDetail() { navigate(`/jobs/${job.id}`); }

  function handleCardKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input') return;
      e.preventDefault();
      openDetail();
    }
  }

  const isRow = variant === 'row';
  const rowAttrs = {
    className: `job-card clickable${featured && job.featured ? ' featured' : ''}${isRow ? ' job-card-row' : ''}`,
    role: 'button',
    tabIndex: 0,
    onClick: openDetail,
    onKeyDown: handleCardKey,
    'aria-label': `Open details for ${job.title} at ${job.co}`,
  };

  return (
    <div className={`job-card-wrapper${isRow ? ' job-card-wrapper-row' : ''}`}>
      <div {...rowAttrs}>
        {/*
          * Top-right action cluster: [ Featured? ]  [ ♥ ]  [ ⌘ ].
          *
          * Featured sits BEFORE the icons (not after) so the eye lands
          * on it on the way in to tap heart / bookmark. The badge is a
          * non-interactive `<span>` — only the heart and bookmark are
          * keyboard-focusable, and both `stopPropagation()` so the
          * whole-card click never fires.
          *
          * On narrow widths the row wraps via `flex-wrap`; the badge
          * collapses to a second line above the icons so it never
          * pushes the icons off the edge.
          */}
        <div className="job-card-actions" aria-label="Card actions">
          {featured && job.featured && (
            <span className="featured-pill" aria-label="Featured job">★ Featured</span>
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

        {/* Trust badges row — only renders when at least one badge applies. */}
        <TrustBadges job={job} />

        {/*
          * Match badge — only when a score exists (signed-in candidate
          * surface). The tiered badge collapses to a single chip line
          * in row variant to keep the dashboard rail tight.
          */}
        {score != null && !isRow && <MatchBadge score={score} />}
        {score != null && isRow && (
          <span className={`match-chip match-chip-${matchTier(score)?.key}`} title={matchTier(score)?.short}>
            {score}% {matchTier(score)?.label}
          </span>
        )}

        {/*
          * Why recommended — compact ✓/✖ checklist. Hidden in row
          * variant so the rail rows stay short and uniform.
          */}
        {!isRow && <WhyRecommended reasons={reasons} missing={missing} />}

        {/* Meta row — experience · type · deadline */}
        <div className="job-meta-row">
          {job.experience && <span className="meta-chip" title={`Experience: ${job.experience}`}>{job.experience}</span>}
          {job.type && <span className="meta-chip" title={`Job type: ${job.type}`}>{job.type}</span>}
          {job.deadline && !job.closingSoon && (
            <span
              className={`meta-chip${job.isExpired ? ' meta-chip-warn' : ''}`}
              title={job.deadlineRaw ? new Date(job.deadlineRaw).toLocaleString() : 'Apply deadline'}
            >
              {job.deadline}
            </span>
          )}
        </div>

        {/* Skills tags */}
        {visibleSkills.length > 0 && (
          <div className="job-tags">
            {visibleSkills.map((t) => (
              <span key={t} className="job-tag" title={t}>{t}</span>
            ))}
            {extraSkills > 0 && (
              <span className="job-tag job-tag-more" title="More skills required for this role">+{extraSkills}</span>
            )}
          </div>
        )}

        {/* spacer pushes footer + actions to the bottom of the card */}
        <div style={{ flex: 1 }} />

        <div className="job-foot">
          <div className="job-pay text-truncate" title={`${job.pay} · ${job.type}`}>
            {job.pay}
          </div>
          <div className="job-time">{job.time}</div>
        </div>

        {/*
          * Apply row.
          *
          * Three mutually-exclusive states. The whole row only renders
          * when the parent supplies `onApply` (or `applied=true`),
          * which the parent gates on logged-in-candidate so guests,
          * employers, and admins never see the button.
          */}
        {(applied || onApply) && (
          <div className="job-actions-row">
            {applied ? (
              <button
                className="btn btn-coral btn-sm apply-btn apply-btn-applied"
                type="button"
                disabled
                aria-disabled="true"
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%' }}
              >
                ✓ Already Applied
              </button>
            ) : job.isExpired ? (
              <button
                className="btn btn-coral btn-sm apply-btn apply-btn-expired"
                type="button"
                disabled
                aria-disabled="true"
                onClick={(e) => e.stopPropagation()}
                title="This job is no longer accepting applications"
                style={{ width: '100%' }}
              >
                Job Expired
              </button>
            ) : (
              <button
                className="btn btn-coral btn-sm apply-btn"
                onClick={(e) => { e.stopPropagation(); onApply(job); }}
                type="button"
                disabled={applyingId === job.id}
                aria-busy={applyingId === job.id}
                style={{ width: '100%' }}
              >
                {applyingId === job.id ? 'Applying…' : 'Apply Now'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
