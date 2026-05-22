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

function BookmarkIcon({ filled = true }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18l-7-4-7 4V4z" />
    </svg>
  );
}

/** "Expires in 4d", "Expires today", or null when no deadline. */
function expiryLabel(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = ts - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days}d`;
}

export default function SavedJobs() {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Per-job toast for apply / eligibility / remove feedback. Keyed by
  // jobId so multiple actions can show their results independently.
  const [perJobMessage, setPerJobMessage] = useState({});
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await candidatesApi.savedJobs.list({ page: 1, limit: 100 });
        if (cancelled) return;
        const rows = (data?.records || []).map((r) => ({
          ...toJobCardShape(r),
          expires_at: r.expires_at || null,
          saved_at: r.saved_at,
        })).filter(Boolean);
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
      showMessage(job.id, { ok: true, text: `Application submitted to ${job.co}.` });
    } catch (err) {
      showMessage(job.id, { ok: false, text: err.message || 'Could not submit application.' });
    } finally {
      setActingId(null);
    }
  }

  /** Remove the saved-for-later row; optimistic update + rollback. */
  async function handleRemove(job) {
    const prev = saved;
    setSaved((rows) => rows.filter((r) => r.id !== job.id));
    try {
      await candidatesApi.savedJobs.remove(job.id);
    } catch (err) {
      setSaved(prev);
      showMessage(job.id, { ok: false, text: err.message || 'Could not remove saved job.' });
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

        <div className="fav-grid">
          {saved.length === 0 ? (
            <div className="fav-empty" style={{ gridColumn: '1/-1' }}>
              <div className="fav-empty-icon">⌘</div>
              <h3>Nothing saved for later yet</h3>
              <p>
                When you find a role you want to apply to (but not right this second), tap the
                Save button on it. We'll keep it here until the deadline passes.
              </p>
              <Link to="/jobs" className="btn btn-coral">Browse jobs →</Link>
            </div>
          ) : saved.map((j) => {
            const exp = expiryLabel(j.expires_at);
            const msg = perJobMessage[j.id];
            return (
              <div key={j.id} className="fav-card">
                <button
                  className="heart-btn saved"
                  onClick={() => handleRemove(j)}
                  title="Remove from saved"
                  type="button"
                  style={{ color: 'var(--coral, #e85d3c)' }}
                >
                  <BookmarkIcon filled />
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
                  <div className="job-time">
                    {exp
                      ? <span style={{ color: exp === 'Expires today' || exp === 'Expires tomorrow' ? 'var(--coral, #e85d3c)' : 'inherit' }}>{exp}</span>
                      : 'No deadline'}
                  </div>
                </div>

                {msg && (
                  <div
                    role="status"
                    style={{
                      marginTop: 10, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                      background: msg.ok ? '#e6f4ea' : '#fde9e3',
                      color: msg.ok ? '#0f5132' : '#b3361b',
                    }}
                  >
                    {msg.text}
                  </div>
                )}

                <div className="fav-card-actions">
                  <button
                    className="btn btn-coral"
                    onClick={() => handleApply(j)}
                    disabled={actingId === j.id}
                    type="button"
                  >
                    {actingId === j.id ? 'Checking…' : 'Apply now'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleRemove(j)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {!error && saved.length === 0 && (
          <EmptyState title="Nothing here yet" />
        )}
      </div>
    </section>
  );
}
