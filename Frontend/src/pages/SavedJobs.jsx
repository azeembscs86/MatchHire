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
import { candidatesApi } from '../api/index.js';
import { toJobCardShape } from '../api/adapters.js';
import { useSavedJobs } from '../context/SavedJobsContext.jsx';
import JobCard from '../components/JobCard.jsx';

// SavedJobs joins the `saved_jobs` row's metadata (`expires_at`,
// `saved_at`) onto each card shape, so we can't use the generic
// `filterActiveJobs` helper — it would lose those fields. We
// reproduce the same active-only filter inline below.

export default function SavedJobs() {
  const { savedIds } = useSavedJobs();
  const [saved, setSaved] = useState([]);
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
        const data = await candidatesApi.savedJobs.list({ page: 1, limit: 100 });
        if (cancelled) return;
        // Map to JobCard shape and merge the saved_jobs row's own
        // metadata. The `.filter()` drops anything the adapter
        // couldn't shape AND any row whose underlying job is expired,
        // closed, or whose company went inactive — a backstop in case
        // a stale cache leaks one through.
        const rows = (data?.records || [])
          .map((r) => {
            const shape = toJobCardShape(r);
            if (!shape) return null;
            return { ...shape, expires_at: r.expires_at || null, saved_at: r.saved_at };
          })
          .filter((r) => r && !r.isExpired);
        setSaved(rows);
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

  const insights = useMemo(() => {
    if (saved.length === 0) return null;
    const expiringSoon = saved.filter((j) => {
      if (!j.expires_at) return false;
      const days = (new Date(j.expires_at).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 7;
    }).length;
    return { count: saved.length, expiringSoon };
  }, [saved]);

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

        {insights && (
          <div className="fav-summary">
            <div className="fav-stat coral">
              <div className="fav-stat-icon">⌘</div>
              <div className="fav-stat-value">{insights.count}</div>
              <div className="fav-stat-label">Saved for later</div>
            </div>
            <div className="fav-stat">
              <div className="fav-stat-icon">⏳</div>
              <div className="fav-stat-value">{insights.expiringSoon}</div>
              <div className="fav-stat-label">Expiring this week</div>
            </div>
            <div className="fav-stat">
              <div className="fav-stat-icon">♥</div>
              <div className="fav-stat-value">
                <Link to="/favorites" style={{ color: 'inherit' }}>View →</Link>
              </div>
              <div className="fav-stat-label">Favourites</div>
            </div>
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
        ) : (
          <div className="jobs-grid">
            {saved.map((j) => (
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

        {!error && saved.length === 0 && (
          <EmptyState title="Nothing here yet" />
        )}
      </div>
    </section>
  );
}
