/**
 * CompanyCard
 *
 * Whole-card click target — navigates to `/companies/:id`. Action
 * controls that ever get added inside the card must call
 * `e.stopPropagation()` to keep the parent navigation from firing.
 *
 * @param {object} props
 * @param {object} props.company  View-model from `toCompanyCardShape(...)`.
 */
import { useNavigate } from 'react-router-dom';

export default function CompanyCard({ company }) {
  const navigate = useNavigate();

  function open() {
    if (company?.id == null) return;
    navigate(`/companies/${company.id}`);
  }
  function onKey(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  return (
    <div
      className="co-card clickable"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      aria-label={`Open profile for ${company.n}`}
    >
      <div className="co-head">
        <div className={`co-logo ${company.cl}`}>{company.l}</div>
        <div>
          <div className="co-name">{company.n}</div>
          <div className="co-industry">{company.ind}</div>
        </div>
      </div>
      <div className="co-desc">{company.d}</div>
      <div className="co-stats">
        <div><span>Open roles</span><span>{company.jobs}</span></div>
        <div><span>Team size</span><span>{company.size}</span></div>
      </div>
    </div>
  );
}
