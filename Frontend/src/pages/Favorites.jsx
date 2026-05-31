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
 *
 * Nov 2026 — the bespoke `.fav-card` markup was replaced with the
 * shared `<JobCard />` so every candidate-facing surface shares one
 * card design. Visible rows sync to `FavoritesContext.savedJobs` so
 * un-hearting a card here removes it from the grid immediately.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext.jsx';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { candidatesApi, publicApi } from '../api/index.js';
import { filterActiveJobs, toJobCardShape } from '../api/adapters.js';

/**
 * Bucket a favourited job into a dashboard filter bucket. Keeps the
 * Favourites surface in lockstep with Saved Jobs so the two
 * dashboards share the same vocabulary (active / expiring / expired)
 * across the same time horizon (7 days). Expiry source is the
 * application deadline that `toJobCardShape` already preserves.
 */
function bucketFor(row) {
  if (row?.isExpired) return 'expired';
  const iso = row?.deadlineRaw;
  if (!iso) return 'active';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  if (ms <= 7 * 86400000) return 'expiring';
  return 'active';
}

export default function Favorites() {
  const { savedJobs: favoriteIds } = useFavorites();
  const [favs, setFavs] = useState([]);
  const [similar, setSimilar] = useState([]);
  // Active filter chip — drives both the summary tile highlight
  // and which rows pass through to the grid below.
  const [filter, setFilter] = useState('all');
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
        // `include_expired: true` so the dashboard can show
        // "Expired favourites" as a real, filterable bucket — the
        // backend repo gates the deadline / status checks behind
        // this flag (mirrors saved-jobs). The card itself still
        // renders an "Expired" pill + disabled apply, so passing
        // expired rows through is safe.
        const [favData, simData] = await Promise.all([
          candidatesApi.favorites.list({ page: 1, limit: 100, include_expired: true }),
          publicApi.featuredJobs(6).catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        const allFavs = (favData?.records || [])
          .map(toJobCardShape)
          .filter(Boolean);
        setFavs(allFavs);
        const favIds = new Set(allFavs.map((r) => Number(r.id)));
        const similarRaw = (simData?.records || []).filter((r) => !favIds.has(Number(r.id)));
        setSimilar(filterActiveJobs(similarRaw).slice(0, 3));
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Sync the visible list with FavoritesContext so un-hearting a card
  // (via JobCard's heart button) removes it from the grid instantly.
  // We only filter — never re-add — so a freshly favourited job
  // elsewhere doesn't sneak into the local list without a refresh.
  useEffect(() => {
    setFavs((rows) => rows.filter((r) => favoriteIds.has(Number(r.id))));
  }, [favoriteIds]);

  // Bucketed view of the favourites list — drives both the summary
  // tiles' counts and the filtered grid below. Keeps the source of
  // truth (`favs`) intact so the FavoritesContext sync above can
  // continue to remove rows on heart-toggle.
  const buckets = useMemo(() => {
    const next = { active: [], expiring: [], expired: [] };
    favs.forEach((row) => { next[bucketFor(row)].push(row); });
    return next;
  }, [favs]);

  const counts = useMemo(() => ({
    all: favs.length,
    active: buckets.active.length,
    expiring: buckets.expiring.length,
    expired: buckets.expired.length,
  }), [favs.length, buckets]);

  const visibleFavs = useMemo(() => {
    if (filter === 'all') return favs;
    return buckets[filter] || [];
  }, [filter, favs, buckets]);

  // Lightweight "what your favourites tell us" insight strip below
  // the tiles. Computed only from active rows so a stash of expired
  // saves doesn't skew the snapshot.
  const insights = useMemo(() => {
    const source = buckets.active;
    if (source.length === 0) return null;
    const remoteCount = source.filter((j) => /Remote/i.test(j.loc)).length;
    const remotePct = Math.round((remoteCount / source.length) * 100);
    const stack = (source.flatMap((j) => j.tags || []).slice(0, 4)).join(' · ') || 'Open';
    return { remotePct, stack, count: source.length };
  }, [buckets.active]);

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

        {/*
          * Summary tiles double as filter chips — mirrors Saved Jobs
          * so the two dashboards behave identically. Each tile is a
          * proper button (aria-pressed + `.is-active`) so the picked
          * filter reads as a tab to both visual + AT users.
          */}
        <div className="fav-summary" role="group" aria-label="Filter favourites">
          {[
            { key: 'all',      icon: '♥', label: 'Total favourites',   value: counts.all },
            { key: 'active',   icon: '◉', label: 'Active favourites',  value: counts.active },
            { key: 'expiring', icon: '⏳', label: 'Expiring soon',      value: counts.expiring },
            { key: 'expired',  icon: '×', label: 'Expired favourites', value: counts.expired },
          ].map((tile) => (
            <button
              key={tile.key}
              type="button"
              className={`fav-stat${filter === tile.key ? ' is-active' : ''}`}
              onClick={() => setFilter(tile.key)}
              aria-pressed={filter === tile.key}
              data-testid={`fav-filter-${tile.key}`}
            >
              <div className="fav-stat-icon">{tile.icon}</div>
              <div className="fav-stat-value">{tile.value}</div>
              <div className="fav-stat-label">{tile.label}</div>
            </button>
          ))}
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

        {favs.length === 0 ? (
          <div className="fav-empty">
            <div className="fav-empty-icon">♡</div>
            <h3>No jobs saved yet</h3>
            <p>Browse jobs and tap the heart icon on any role you like — it'll show up here for easy access later.</p>
            <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
          </div>
        ) : visibleFavs.length === 0 ? (
          // Empty bucket: the candidate has favourites but none in
          // the currently selected filter. Soft empty state with a
          // "show all" escape hatch to match Saved Jobs.
          <div className="fav-empty" data-testid="fav-empty-bucket">
            <div className="fav-empty-icon">○</div>
            <h3>No favourites in this view</h3>
            <p>Try a different filter above, or browse all of your favourites.</p>
            <button type="button" className="btn btn-coral" onClick={() => setFilter('all')}>
              Show all favourites
            </button>
          </div>
        ) : (
          <div className="jobs-grid">
            {visibleFavs.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                featured
                onApply={handleApply}
                applied={appliedIds.has(j.id)}
                applyingId={applyingId}
              />
            ))}
          </div>
        )}

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
