/**
 * SavedJobs page (/saved-jobs)
 *
 * The "apply later" surface — distinct from Favorites (which expresses
 * interest with no expiry). Each row carries an `expires_at` snapshot
 * of the job's application_deadline at save-time; the backend filters
 * expired rows out of the active list automatically so we never show
 * a Save the candidate can't act on.
 *
 * Apply button is gated by a pre-flight eligibility dry-run:
 *   - `can_apply=true`  → opens the existing Apply modal / posts to
 *                         `/applications/:jobId`.
 *   - `can_apply=false` → shows the verdict message inline ("missing
 *                         skills X, Y", "already applied", etc.) so
 *                         the candidate knows WHY before submitting.
 *
 * Layout intentionally mirrors Favorites.jsx so candidates see the
 * two surfaces as parallel siblings on the dashboard.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { candidatesApi, publicApi } from '../api/index.js';
import { toJobCardShape, filterActiveJobs } from '../api/adapters.js';
import { useSavedJobs } from '../context/SavedJobsContext.jsx';
import JobCard from '../components/JobCard.jsx';

/**
 * Bucket a saved row into a dashboard filter bucket. Mirrors the
 * favourites page categorisation so both surfaces speak the same
 * language: active / expiring-within-7d / expired. Pure helper so
 * the page render path stays declarative.
 */
function bucketFor(row) {
  if (row?.isExpired) return 'expired';
  const iso = row?.expires_at || row?.deadlineRaw;
  if (!iso) return 'active';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  if (ms <= 7 * 86400000) return 'expiring';
  return 'active';
}

// SavedJobs joins the `saved_jobs` row's metadata (`expires_at`,
// `saved_at`) onto each card shape, so we can't use the generic
// `filterActiveJobs` helper — it would lose those fields. We
// reproduce the same active-only filter inline below.

export default function SavedJobs() {
  const { savedIds } = useSavedJobs();
  const [saved, setSaved] = useState([]);
  // Companion rail at the bottom of the page — mirrors the
  // Favourites surface so both dashboards feel like siblings.
  // Populated from `publicApi.featuredJobs(...)` and filtered so a
  // job the candidate already has saved doesn't show twice.
  const [similar, setSimilar] = useState([]);
  // Which summary tile is the active filter for the grid. `all`
  // shows every saved row regardless of bucket.
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Per-job toast for apply / eligibility / remove feedback. Keyed by
  // jobId so multiple actions can show their results independently.
  const [perJobMessage, setPerJobMessage] = useState({});
  const [actingId, setActingId] = useState(null);
  // Jobs the candidate applied to inside this session. Used to swap
  // the JobCard's Apply button to "Already Applied" without removing
  // the row (so the message can still be read before it disappears).
  const [appliedIds, setAppliedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // `include_expired: true` so the dashboard can surface the
        // "Expired Saved" filter without a second request — the
        // bucket helper below tags rows accordingly. Similar-roles
        // rail uses the same `featuredJobs` endpoint as Favourites.
        const [data, simData] = await Promise.all([
          candidatesApi.savedJobs.list({ page: 1, limit: 100, include_expired: true }),
          publicApi.featuredJobs(6).catch(() => ({ records: [] })),
        ]);
        if (cancelled) return;
        const rows = (data?.records || [])
          .map((r) => {
            const shape = toJobCardShape(r);
            if (!shape) return null;
            return { ...shape, expires_at: r.expires_at || null, saved_at: r.saved_at };
          })
          .filter(Boolean);
        setSaved(rows);
        const savedIdSet = new Set(rows.map((r) => Number(r.id)));
        const similarRaw = (simData?.records || []).filter((r) => !savedIdSet.has(Number(r.id)));
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

  // When JobCard's bookmark toggle removes a row from SavedJobsContext,
  // filter the visible list so the row disappears immediately.
  useEffect(() => {
    setSaved((rows) => rows.filter((r) => savedIds.has(Number(r.id))));
  }, [savedIds]);

  // Pre-bucketed list — re-derived whenever the saved set changes
  // so the summary tiles + filtered grid never disagree.
  const buckets = useMemo(() => {
    const next = { active: [], expiring: [], expired: [] };
    saved.forEach((row) => { next[bucketFor(row)].push(row); });
    return next;
  }, [saved]);

  const counts = useMemo(() => ({
    all: saved.length,
    active: buckets.active.length,
    expiring: buckets.expiring.length,
    expired: buckets.expired.length,
  }), [saved.length, buckets]);

  // Visible grid honours the selected filter chip. Falls back to
  // the full list when 'all' is selected so the count and the grid
  // always match the highlighted tile.
  const visibleSaved = useMemo(() => {
    if (filter === 'all') return saved;
    return buckets[filter] || [];
  }, [filter, saved, buckets]);

  function showMessage(jobId, message) {
    setPerJobMessage((prev) => ({ ...prev, [jobId]: message }));
    setTimeout(() => {
      setPerJobMessage((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }, 6000);
  }

  /** Pre-flight + apply. Eligibility verdict gates the actual POST. */
  async function handleApply(job) {
    if (job?.isExpired) return;
    setActingId(job.id);
    try {
      const verdict = await candidatesApi.savedJobs.eligibility(job.id);
      if (!verdict?.can_apply) {
        showMessage(job.id, {
          ok: false,
          text: verdict?.message
            || 'Your profile does not yet meet this role\'s minimum requirements.',
        });
        return;
      }
      // Match cleared the bar — submit the application.
      await candidatesApi.applications.apply(job.id, {});
      setAppliedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
      showMessage(job.id, { ok: true, text: `Application submitted to ${job.co}.` });
      // Best-effort cleanup of the backing saved_jobs row so the
      // backend list stays consistent on the next fetch. Errors here
      // don't affect the apply outcome.
      candidatesApi.savedJobs.remove(job.id).catch(() => {});
    } catch (err) {
      showMessage(job.id, { ok: false, text: err.message || 'Could not submit application.' });
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your saved jobs…" />
        </div>
      </section>
    );
  }

  return (
    <section className="view active" id="view-saved-jobs">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ⌘ Saved for later · {saved.length} {saved.length === 1 ? 'job' : 'jobs'}
          </span>
          <h1 className="display">
            Jobs you're planning to <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>apply to</span>.
          </h1>
          <p>Each save tracks the job's apply deadline — rows drop off automatically once a posting closes.</p>
        </div>
      </div>

      <div className="container" style={{ padding: '40px 0 80px' }}>
        {error && <ErrorState error={error} />}

        {/*
          * Summary tiles double as filter chips. Each one shows its
          * bucket count and, when clicked, narrows the grid below to
          * that bucket. `aria-pressed` + `.is-active` mark the
          * current selection so the row reads as a toolbar to AT
          * users and as a tab set visually.
          */}
        {saved.length > 0 && (
          <div className="fav-summary" role="group" aria-label="Filter saved jobs">
            {[
              { key: 'all',      icon: '⌘', label: 'Total saved',   value: counts.all },
              { key: 'active',   icon: '◉', label: 'Active saved',  value: counts.active },
              { key: 'expiring', icon: '⏳', label: 'Expiring soon', value: counts.expiring },
              { key: 'expired',  icon: '×', label: 'Expired saved', value: counts.expired },
            ].map((tile) => (
              <button
                key={tile.key}
                type="button"
                className={`fav-stat${filter === tile.key ? ' is-active' : ''}`}
                onClick={() => setFilter(tile.key)}
                aria-pressed={filter === tile.key}
                data-testid={`saved-filter-${tile.key}`}
              >
                <div className="fav-stat-icon">{tile.icon}</div>
                <div className="fav-stat-value">{tile.value}</div>
                <div className="fav-stat-label">{tile.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Any active per-job messages render above the grid so the
            saved card stays visually clean. */}
        {Object.entries(perJobMessage).map(([id, m]) => (
          <div
            key={`m-${id}`}
            role="status"
            style={{
              margin: '0 0 12px', padding: '10px 12px', borderRadius: 8, fontSize: 13,
              background: m.ok ? '#e6f4ea' : '#fde9e3',
              color: m.ok ? '#0f5132' : '#b3361b',
            }}
          >
            {m.text}
          </div>
        ))}

        {saved.length === 0 ? (
          <div className="fav-empty">
            <div className="fav-empty-icon">⌘</div>
            <h3>Nothing saved for later yet</h3>
            <p>
              When you find a role you want to apply to (but not right this second), tap the
              Save button on it. We'll keep it here until the deadline passes.
            </p>
            <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
          </div>
        ) : visibleSaved.length === 0 ? (
          // Empty bucket: the candidate has saved jobs but none in
          // the currently selected filter. Surface a soft empty
          // state plus a "show all" escape hatch.
          <div className="fav-empty" data-testid="saved-empty-bucket">
            <div className="fav-empty-icon">○</div>
            <h3>No saved jobs in this view</h3>
            <p>Try a different filter above, or browse all of your saved roles.</p>
            <button type="button" className="btn btn-coral" onClick={() => setFilter('all')}>
              Show all saved
            </button>
          </div>
        ) : (
          <div className="jobs-grid">
            {visibleSaved.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                featured
                onApply={handleApply}
                applied={appliedIds.has(j.id)}
                applyingId={actingId}
              />
            ))}
          </div>
        )}

        {/*
          * Similar roles rail — mirrors the Favourites surface so
          * a candidate sitting on Saved Jobs always has something
          * actionable below the fold. Hidden when the API returned
          * nothing fresh so the page doesn't end on an empty band.
          */}
        {similar.length > 0 && (
          <div style={{ paddingTop: 24, marginTop: 24, borderTop: '1px solid var(--line)' }}>
            <div className="section-head" style={{ marginBottom: 32 }}>
              <div>
                <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ More like your saved roles</span>
                <h2 className="display" style={{ fontSize: 36 }}>
                  Similar roles you might <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>love</span>.
                </h2>
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
                  applyingId={actingId}
                />
              ))}
            </div>
          </div>
        )}

        {!error && saved.length === 0 && similar.length === 0 && (
          <EmptyState title="Nothing here yet" />
        )}
      </div>
    </section>
  );
}
