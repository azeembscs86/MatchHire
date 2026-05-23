/**
 * CandidateCard
 *
 * Whole-card click target. Navigates to `/candidates/:id` on click;
 * keyboard activation (Enter / Space) works via the matching role +
 * tabIndex. Action buttons embedded in the card MUST call
 * `e.stopPropagation()` so they don't trigger this navigation — see
 * the JobCard component for the same pattern.
 *
 * @param {object} props
 * @param {object} props.candidate    View-model from `toCandidateCardShape(...)`.
 * @param {boolean} [props.rankTop]   Coral-highlight the rank pill (top 3).
 */
import { useNavigate } from 'react-router-dom';

export default function CandidateCard({ candidate, rankTop = false }) {
  const navigate = useNavigate();

  function open() {
    if (candidate?.id == null) return;
    navigate(`/candidates/${candidate.id}`);
  }
  function onKey(e) {
    // Skip if focus is on an inner interactive element so its own
    // activation isn't shadowed by the card's.
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  return (
    <div
      className="cand-card clickable"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`Open profile for ${candidate.n}`}
    >
      <span className={`cand-rank${rankTop ? ' top' : ''}`}>{candidate.rank}</span>
      <div className={`cand-avatar ${candidate.cl}`}>{candidate.a}</div>
      <div className="cand-name">{candidate.n}</div>
      <div className="cand-role">{candidate.role}</div>
      <div className="cand-skills">
        {candidate.skills.map((s) => <span key={s} className="cand-skill">{s}</span>)}
      </div>
      <div className="cand-meta">
        <div><span>Based in</span><span>{candidate.loc}</span></div>
        <div><span>Asking</span><span>{candidate.rate}</span></div>
        <div><span>Rated</span><span className="cand-rating">{candidate.rating}</span></div>
      </div>
    </div>
  );
}
