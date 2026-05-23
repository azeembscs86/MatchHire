/**
 * CandidateCard
 *
 * Whole-card click target. Navigates to `/candidates/:id` on click;
 * keyboard activation (Enter / Space) works via the matching role +
 * tabIndex. Action buttons embedded in the card MUST call
 * `e.stopPropagation()` so they don't trigger this navigation.
 *
 * Two surfaces share the component:
 *   - Public candidate browse (guests, candidates) — `match` prop
 *     is undefined, the card renders the basic identity block.
 *   - Employer "Recommended candidates" feed — `match` carries
 *     `{ score, jobTitle, matched[], missing[] }` and the card grows
 *     a match-badge + matched job + green/coral skill pills.
 *
 * @param {object}   props
 * @param {object}   props.candidate    View-model from `toCandidateCardShape(...)`.
 * @param {boolean}  [props.rankTop]    Coral-highlight the rank pill (top 3).
 * @param {object}   [props.match]      Optional match decoration.
 * @param {function} [props.onContact]  Optional Contact handler (employer view).
 */
import { useNavigate } from 'react-router-dom';

function matchTier(score) {
  if (score == null) return null;
  if (score >= 85) return { key: 'strong', label: 'Strong' };
  if (score >= 70) return { key: 'good',   label: 'Good' };
  return { key: 'mod',    label: 'Potential' };
}

export default function CandidateCard({ candidate, rankTop = false, match = null, onContact = null }) {
  const navigate = useNavigate();

  function open() {
    if (candidate?.id == null) return;
    navigate(`/candidates/${candidate.id}`);
  }
  function onKey(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  const tier = match ? matchTier(match.score) : null;
  const matched = match?.matched?.slice(0, 4) || [];
  const missing = match?.missing?.slice(0, 3) || [];

  return (
    <div
      className="cand-card clickable"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`Open profile for ${candidate.n}`}
    >
      {tier ? (
        <span className={`cand-match-pill match-chip-${tier.key}`} title={tier.label + ' match'}>
          {match.score}% · {tier.label}
        </span>
      ) : (
        <span className={`cand-rank${rankTop ? ' top' : ''}`}>{candidate.rank}</span>
      )}
      <div className={`cand-avatar ${candidate.cl}`}>{candidate.a}</div>
      <div className="cand-name">{candidate.n}</div>
      <div className="cand-role">{candidate.role}</div>

      {match?.jobTitle && (
        <div className="cand-match-job" title={`Best match: ${match.jobTitle}`}>
          <span className="cand-match-job-label">For</span> {match.jobTitle}
        </div>
      )}

      {match ? (
        <>
          {matched.length > 0 && (
            <div className="cand-skill-row">
              {matched.map((s) => (
                <span key={`m-${s}`} className="match-tag match-tag-yes">{s}</span>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div className="cand-skill-row">
              {missing.map((s) => (
                <span key={`x-${s}`} className="match-tag match-tag-no">{s}</span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="cand-skills">
          {candidate.skills.map((s) => <span key={s} className="cand-skill">{s}</span>)}
        </div>
      )}

      <div className="cand-meta">
        <div><span>Based in</span><span>{candidate.loc}</span></div>
        <div><span>{match ? 'Experience' : 'Asking'}</span><span>{match ? candidate.rate : candidate.rate}</span></div>
        {!match && <div><span>Rated</span><span className="cand-rating">{candidate.rating}</span></div>}
      </div>

      {onContact && (
        <div className="cand-card-actions">
          <button
            type="button"
            className="btn btn-coral btn-sm"
            onClick={(e) => { e.stopPropagation(); onContact(candidate); }}
            aria-label={`Contact ${candidate.n}`}
          >
            Contact
          </button>
        </div>
      )}
    </div>
  );
}
