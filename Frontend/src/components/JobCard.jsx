/**
 * JobCard
 *
 * Compact card for a single job. Used on Home, Jobs, Favorites' similar
 * rail, and the company dashboard. The heart icon reads/writes
 * `FavoritesContext` (API-backed) so toggling here updates every other
 * card and the header badge in real time.
 *
 * The card itself is design-neutral - prop shape comes from
 * `toJobCardShape(...)` in `api/adapters.js`, which maps backend records
 * into the legacy field names (`co`, `l`, `cl`, `pay`, `tags`, ...).
 *
 * @param {object} props
 * @param {object} props.job        - View-model produced by `toJobCardShape`.
 *                                    Must carry `id` (real job id, used
 *                                    by favorites + apply).
 * @param {boolean} [props.featured] - Show the FEATURED ribbon when
 *                                     `job.featured` is truthy.
 * @param {function} [props.onApply] - Optional callback fired when the
 *                                     Apply action is invoked.
 */
import { useFavorites } from '../context/FavoritesContext.jsx';

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function JobCard({ job, featured = false, onApply }) {
  const { isSaved, toggleSave } = useFavorites();
  const saved = isSaved(job.id);
  return (
    <div className={`job-card${featured && job.featured ? ' featured' : ''}`}>
      <button
        className={`heart-btn${saved ? ' saved' : ''}`}
        onClick={(e) => { e.stopPropagation(); toggleSave(job.id); }}
        title={saved ? 'Remove from favorites' : 'Save to favorites'}
        type="button"
      >
        <HeartIcon filled={saved} />
      </button>
      <div className="job-head">
        <div className={`job-logo ${job.cl}`}>{job.l}</div>
        <div>
          <div className="job-co">{job.co}</div>
          <div className="job-loc">{job.loc}</div>
        </div>
      </div>
      <div className="job-title">{job.title}</div>
      <div className="job-tags">
        {job.match && <span className="job-tag match">★ {job.match}</span>}
        {(job.tags || []).map((t) => <span key={t} className="job-tag">{t}</span>)}
      </div>
      <div className="job-foot">
        <div className="job-pay">{job.pay} <span>· {job.type}</span></div>
        <div className="job-time">{job.time}</div>
      </div>
      {onApply && (
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-coral"
            onClick={(e) => { e.stopPropagation(); onApply(job); }}
            type="button"
            style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
          >
            Apply now
          </button>
        </div>
      )}
    </div>
  );
}
