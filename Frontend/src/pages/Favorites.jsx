/**
 * Favorites page.
 *
 * Pulls the candidate's saved jobs from `/candidates/favorites/list`
 * and a small "similar roles" rail from `/public/featured-jobs`.
 * Toggling a heart writes through `FavoritesContext` (API-backed) so
 * removing a card here also updates the header badge and any visible
 * JobCard elsewhere.
 *
 * Apply action posts to `/candidates/applications/:jobId`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext.jsx';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { candidatesApi, publicApi } from '../api/index.js';
import { toJobCardShape } from '../api/adapters.js';

function HeartFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function Favorites() {
  const { toggleSave } = useFavorites();
  const [favs, setFavs] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applyMessage, setApplyMessage] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  // Tracks which favourited jobs the candidate just applied to so the
  // card can flip its Apply button to "Already Applied" without
  // disappearing — favourites is an interest surface, not a pipeline
  // one, so the row stays.
  const [appliedIds, setAppliedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [favData, simData] = await Promise.all([
          candidatesApi.favorites.list({ page: 1, limit: 100 }),
          publicApi.featuredJobs(6).catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        setFavs((favData?.records || []).map(toJobCardShape).filter(Boolean));
        const favIds = new Set((favData?.records || []).map((r) => Number(r.id)));
        const similarRaw = (simData?.records || []).filter((r) => !favIds.has(Number(r.id)));
        setSimilar(similarRaw.map(toJobCardShape).filter(Boolean).slice(0, 3));
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const insights = useMemo(() => {
    if (favs.length === 0) return null;
    const remoteCount = favs.filter((j) => /Remote/i.test(j.loc)).length;
    const remotePct = Math.round((remoteCount / favs.length) * 100);
    const stack = (favs.flatMap((j) => j.tags || []).slice(0, 4)).join(' · ') || 'Open';
    return { remotePct, stack, count: favs.length };
  }, [favs]);

  async function handleApply(job) {
    if (job?.isExpired) return;
    if (appliedIds.has(job.id)) return;
    setApplyingId(job.id);
    setApplyMessage(null);
    try {
      await candidatesApi.applications.apply(job.id, {});
      setAppliedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
      setApplyMessage({ ok: true, text: `Application submitted to ${job.co}.` });
      // Don't drop the row from the Favorites list — favourites express
      // interest, not pipeline state. But DO drop it from the similar-
      // roles rail so a freshly-applied job doesn't show "Apply" again.
      setSimilar((rows) => rows.filter((r) => r.id !== job.id));
    } catch (err) {
      setApplyMessage({ ok: false, text: err.message || 'Could not submit application.' });
    } finally {
      setApplyingId(null);
      setTimeout(() => setApplyMessage(null), 4000);
    }
  }

  if (loading) {
    return (
      <section className="view active" id="view-favorites">
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your favorites…" />
        </div>
      </section>
    );
  }

  return (
    <section className="view active" id="view-favorites">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Your saved jobs · {favs.length} favorites</span>
          <h1 className="display">Jobs you <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>loved</span>.</h1>
          <p>Tap the heart on any role to keep it here. We surface similar roles automatically.</p>
        </div>
      </div>

      <div className="container" style={{ padding: '40px 0 80px' }}>
        {error && <ErrorState error={error} />}

        <div className="fav-summary">
          <div className="fav-stat coral">
            <div className="fav-stat-icon">♥</div>
            <div className="fav-stat-value">{favs.length}</div>
            <div className="fav-stat-label">Total saved jobs</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">★</div>
            <div className="fav-stat-value">{favs.filter((j) => j.featured).length}</div>
            <div className="fav-stat-label">Featured saved</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">⌂</div>
            <div className="fav-stat-value">{insights?.remotePct ?? 0}%</div>
            <div className="fav-stat-label">Remote share</div>
          </div>
          <div className="fav-stat">
            <div className="fav-stat-icon">⊕</div>
            <div className="fav-stat-value">{similar.length}</div>
            <div className="fav-stat-label">Similar roles</div>
          </div>
        </div>

        {insights && (
          <div className="fav-insights">
            <span className="pref-eyebrow"><span className="dot"></span>What your favorites tell us</span>
            <h3>Based on your saved jobs, you lean toward <span className="ital">{insights.stack}</span>.</h3>
            <p>Tweak in <Link to="/preferences" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>Preferences</Link> if this feels off.</p>
          </div>
        )}

        {applyMessage && (
          <div
            role="status"
            style={{
              margin: '16px 0', padding: '10px 12px', borderRadius: 8,
              background: applyMessage.ok ? '#e6f4ea' : '#fde9e3',
              color: applyMessage.ok ? '#0f5132' : '#b3361b',
              fontSize: 13,
            }}
          >
            {applyMessage.text}
          </div>
        )}

        <div className="fav-grid">
          {favs.length === 0 ? (
            <div className="fav-empty" style={{ gridColumn: '1/-1' }}>
              <div className="fav-empty-icon">♡</div>
              <h3>No jobs saved yet</h3>
              <p>Browse jobs and tap the heart icon on any role you like — it'll show up here for easy access later.</p>
              <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
            </div>
          ) : favs.map((j) => (
            <div key={j.id} className="fav-card">
              <button className="heart-btn saved" onClick={(e) => { e.stopPropagation(); toggleSave(j.id); }}>
                <HeartFilled />
              </button>
              {j.featured && <span className="fav-card-collection col-top">★ Top pick</span>}
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
                {(j.tags || []).map((t) => <span key={t} className="job-tag">{t}</span>)}
              </div>
              <div className="job-foot">
                <div className="job-pay">{j.pay} <span>· {j.type}</span></div>
                <div className="job-time">Saved · {j.time}</div>
              </div>
              <div className="fav-card-actions">
                {appliedIds.has(j.id) ? (
                  <button
                    className="btn btn-coral apply-btn apply-btn-applied"
                    type="button"
                    disabled
                    aria-disabled="true"
                  >
                    ✓ Already Applied
                  </button>
                ) : j.isExpired ? (
                  <button
                    className="btn btn-coral apply-btn apply-btn-expired"
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="This job is no longer accepting applications"
                  >
                    Job Expired
                  </button>
                ) : (
                  <button
                    className="btn btn-coral apply-btn"
                    onClick={() => handleApply(j)}
                    disabled={applyingId === j.id}
                    aria-busy={applyingId === j.id}
                    type="button"
                  >
                    {applyingId === j.id ? 'Applying…' : 'Apply Now'}
                  </button>
                )}
                <Link to={`/jobs/${j.id}`} className="btn btn-ghost">View role</Link>
              </div>
            </div>
          ))}
        </div>

        {similar.length > 0 && (
          <div style={{ paddingTop: 24, borderTop: '1px solid var(--line)' }}>
            <div className="section-head" style={{ marginBottom: 32 }}>
              <div>
                <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ More like your favorites</span>
                <h2 className="display" style={{ fontSize: 36 }}>Similar roles you might <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>love</span>.</h2>
              </div>
              <Link to="/jobs" className="section-link">Browse all →</Link>
            </div>
            <div className="jobs-grid">
              {similar.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  featured
                  onApply={handleApply}
                  applyingId={applyingId}
                />
              ))}
            </div>
          </div>
        )}

        {!error && favs.length === 0 && similar.length === 0 && (
          <EmptyState title="Nothing here yet" />
        )}
      </div>
    </section>
  );
}
