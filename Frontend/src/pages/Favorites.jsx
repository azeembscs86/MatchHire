/**
 * Favorites page.
 *
 * Reads the saved-jobs Set from FavoritesContext, partitions it by
 * collection (Top picks / Apply soon / Maybe later), and renders an
 * insights panel above the grid. A "similar roles" rail at the
 * bottom surfaces the first few jobs the user hasn't saved yet.
 *
 * The collection assignments and per-job deadline strings come from
 * `data/jobs.js` — they're static for now. Replace with API-driven
 * metadata once the backend supports user-defined collections.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { jobs, jobCollections, collectionLabels, deadlines } from '../data/jobs.js';
import { useFavorites } from '../context/FavoritesContext.jsx';
import JobCard from '../components/JobCard.jsx';

const TABS = [
  { key: 'all', label: 'All saved', count: 12 },
  { key: 'top', label: '★ Top picks', count: 4 },
  { key: 'soon', label: '⏰ Apply soon', count: 3 },
  { key: 'maybe', label: '◐ Maybe later', count: 5 },
];

function HeartFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function Favorites() {
  const [filter, setFilter] = useState('all');
  const { savedJobs, toggleSave } = useFavorites();

  const ids = useMemo(() => {
    return [...savedJobs].filter((id) => {
      if (filter === 'all') return true;
      return jobCollections[id] === filter;
    });
  }, [savedJobs, filter]);

  const unsavedJobs = useMemo(
    () => jobs.map((j, i) => ({ j, i })).filter((x) => !savedJobs.has(x.i)).slice(0, 3),
    [savedJobs]
  );

  return (
    <section className="view active" id="view-favorites">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Your saved jobs · {savedJobs.size} favorites</span>
          <h1 className="display">Jobs you <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>loved</span>.</h1>
          <p>Organize them into collections, set apply reminders, and we'll surface similar roles automatically.</p>
        </div>
      </div>

      <div className="container" style={{ padding: '40px 0 80px' }}>
        <div className="fav-summary">
          <div className="fav-stat coral">
            <div className="fav-stat-icon">♥</div>
            <div className="fav-stat-value">{savedJobs.size}</div>
            <div className="fav-stat-label">Total saved jobs</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">★</div>
            <div className="fav-stat-value">4</div>
            <div className="fav-stat-label">Top picks</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">⏰</div>
            <div className="fav-stat-value">3</div>
            <div className="fav-stat-label">Closing this week</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">$</div>
            <div className="fav-stat-value">$192K</div>
            <div className="fav-stat-label">Avg salary saved</div>
          </div>
        </div>

        <div className="fav-insights">
          <span className="pref-eyebrow"><span className="dot"></span>What your favorites tell us</span>
          <h3>Based on your saved jobs, you<br />tend to prefer <span className="ital">senior remote roles</span><br />at funded startups with strong equity.</h3>
          <p>We've used these patterns to refine your matches. Tweak in <Link to="/preferences" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>Preferences</Link> if this feels off.</p>
          <div className="insight-row">
            <div className="insight-item"><small>Common role</small><strong>Senior Frontend</strong></div>
            <div className="insight-item"><small>Salary band</small><strong>$170K – $230K</strong></div>
            <div className="insight-item"><small>Top stack</small><strong>React · TypeScript</strong></div>
            <div className="insight-item"><small>Work mode</small><strong>Remote (83%)</strong></div>
          </div>
        </div>

        <div className="fav-toolbar">
          <div className="fav-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`fav-tab${filter === t.key ? ' active' : ''}`}
                onClick={() => setFilter(t.key)}
              >
                {t.label} <span className="count">{t.count}</span>
              </button>
            ))}
            <button className="fav-tab add">+ New collection</button>
          </div>
          <div className="fav-sort">
            <span>Sort by</span>
            <select>
              <option>Recently saved</option>
              <option>Match score</option>
              <option>Salary (high to low)</option>
              <option>Closing soon</option>
            </select>
          </div>
        </div>

        <div className="fav-grid">
          {ids.length === 0 ? (
            <div className="fav-empty" style={{ gridColumn: '1/-1' }}>
              <div className="fav-empty-icon">♡</div>
              <h3>No jobs in this collection yet</h3>
              <p>Browse jobs and tap the heart icon on any role you like — it'll show up here for easy access later.</p>
              <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
            </div>
          ) : ids.map((id) => {
            const j = jobs[id];
            if (!j) return null;
            const col = jobCollections[id] || 'maybe';
            const colMeta = collectionLabels[col];
            const deadline = deadlines[id];
            return (
              <div key={id} className="fav-card">
                <button className="heart-btn saved" onClick={(e) => { e.stopPropagation(); toggleSave(id); }}>
                  <HeartFilled />
                </button>
                <span className={`fav-card-collection ${colMeta.cls}`}>{colMeta.icon} {colMeta.name}</span>
                <div className="job-head">
                  <div className={`job-logo ${j.cl}`}>{j.l}</div>
                  <div>
                    <div className="job-co">{j.co}</div>
                    <div className="job-loc">{j.loc}</div>
                  </div>
                </div>
                <div className="job-title">{j.title}</div>
                <div className="job-tags">
                  {j.match && <span className="job-tag match">★ {j.match}</span>}
                  {j.tags.map((t) => <span key={t} className="job-tag">{t}</span>)}
                </div>
                <div className="job-foot">
                  <div className="job-pay">{j.pay} <span>· {j.type}</span></div>
                  <div className="job-time">Saved · {j.time}</div>
                </div>
                {deadline && <div className="fav-deadline">⏰ {deadline}</div>}
                <div className="fav-card-actions">
                  <button className="btn btn-coral">Apply now</button>
                  <button className="btn btn-ghost">View role</button>
                  <button className="icon-mini" title="Move to another collection">⇄</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ paddingTop: 24, borderTop: '1px solid var(--line)' }}>
          <div className="section-head" style={{ marginBottom: 32 }}>
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ More like your favorites</span>
              <h2 className="display" style={{ fontSize: 36 }}>Similar roles you might <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>love</span>.</h2>
            </div>
            <Link to="/jobs" className="section-link">Browse all →</Link>
          </div>
          <div className="jobs-grid">
            {unsavedJobs.map(({ j, i }) => <JobCard key={i} job={j} idx={i} featured />)}
          </div>
        </div>

      </div>
    </section>
  );
}
