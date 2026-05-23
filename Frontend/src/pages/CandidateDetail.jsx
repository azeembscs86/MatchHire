/**
 * CandidateDetail page (/candidates/:id)
 *
 * Public candidate profile — the destination for the whole-card click
 * on the Candidates discovery page. Data: `GET /public/candidates/:id`
 * (returns user + profile + skills + experiences when the profile is
 * marked public). Visibility is enforced server-side via
 * `candidate_profiles.is_public = 1`; this page just renders what the
 * API hands back.
 *
 * Layout mirrors JobDetail so the brand reads as one product:
 *   - hero (avatar + name + headline + meta-chips)
 *   - two-column body: main (summary, skills, experience) + side
 *     (quick facts, profile-strength bar, contact links)
 *
 * Loading: skeleton silhouette so the layout doesn't reflow.
 * Empty / 404: shared "not found" copy + back link.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { publicApi, employersApi } from '../api/index.js';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import MatchingJobsPanel from '../components/MatchingJobsPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function initials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join('') || '··';
}

function formatRange(start, end, isCurrent) {
  const opt = { year: 'numeric', month: 'short' };
  const s = start ? new Date(start).toLocaleDateString(undefined, opt) : '—';
  const e = isCurrent ? 'Present' : (end ? new Date(end).toLocaleDateString(undefined, opt) : 'Present');
  return `${s} – ${e}`;
}

export default function CandidateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isEmployer = role === 'employer';
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Resume-download UX state. `downloading` shows the spinner +
  // disables the button; `downloadError` surfaces a tight inline
  // message under the action row when the signed-URL call 404s or
  // fails for any other reason.
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  async function handleDownloadResume() {
    if (!candidate || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const data = await employersApi.downloadCandidateResume(candidate.id);
      if (!data?.url) throw new Error('Resume download URL missing.');
      // Open in a new tab so the original profile stays in place.
      // The signed URL points at the same API host so the browser
      // will respect the bucket's Content-Disposition: attachment.
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      // Surface the server's wording verbatim on 404 (covers both
      // "candidate not found" and the spec-mandated "Primary resume
      // is not available."). Generic fallback for everything else.
      setDownloadError(
        err?.httpStatus === 404
          ? (err.message || 'Primary resume is not available.')
          : (err?.message || 'Could not start the resume download.')
      );
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    publicApi.candidate(Number(id))
      .then((data) => { if (!cancelled) setCandidate(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '60px 0' }}>
          <LoadingState label="Loading candidate…" />
        </div>
      </section>
    );
  }

  // 404 from the API surface lands here. The backend throws a 404
  // when the candidate doesn't exist OR when their profile isn't
  // marked public — we surface the same "not available" copy either
  // way so we don't accidentally leak existence.
  const notFound = error?.httpStatus === 404 || (!error && !candidate);
  if (notFound) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '40px 0' }}>
          <EmptyState
            title="This profile isn't available"
            message="The candidate may have set their profile to private or the link is out of date."
          />
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" type="button" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '40px 0' }}>
          <ErrorState error={error} />
        </div>
      </section>
    );
  }

  const c = candidate;
  const skills = Array.isArray(c.skills) ? c.skills : [];
  const experiences = Array.isArray(c.experiences) ? c.experiences : [];
  const profileStrength = Number(c.profile_strength || 0);

  return (
    <section className="view active" id="view-candidate-detail">
      <div className="container" style={{ padding: '32px 0 80px' }}>

        <div className="jd-breadcrumb">
          <Link to="/candidates">← All candidates</Link>
        </div>

        <header className="jd-hero">
          <div className="jd-hero-main">
            <div className="cand-detail-avatar" aria-hidden="true">
              {c.avatar_url
                ? <img src={c.avatar_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                : initials(c.full_name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="jd-eyebrow">
                {c.current_title || c.headline || 'Open to roles'}
                {c.open_to_remote ? <span className="jd-eyebrow-badge">Open to remote</span> : null}
              </div>
              <h1 className="jd-title">{c.full_name}</h1>
              <div className="jd-meta-row">
                {c.location && <span className="meta-chip">{c.location}</span>}
                {c.country && c.country !== c.location && <span className="meta-chip">{c.country}</span>}
                {c.years_experience != null && (
                  <span className="meta-chip">{c.years_experience}+ yrs experience</span>
                )}
                {c.availability && (
                  <span className="meta-chip">Available: {c.availability.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
            {/*
              * Employer-only action cluster: Contact + Download
              * resume. Contact uses the email the backend decorated
              * onto the response; Download asks the backend for a
              * short-lived signed URL (the storage path itself never
              * reaches the browser) and opens it in a new tab.
              *
              * Visibility:
              *   - Contact     → employer viewer only
              *   - Download    → employer viewer only AND candidate
              *                   has a resume on file (server reports
              *                   `c.has_resume` for employer viewers)
              */}
            {isEmployer && (
              <div className="jd-hero-actions">
                <div className="jd-action-row">
                  <button
                    type="button"
                    className="btn btn-coral jd-contact-btn"
                    onClick={() => {
                      if (!c.email) {
                        window.alert(`No contact email available for ${c.full_name}.`);
                        return;
                      }
                      const subject = `MatchHire: A role at our company`;
                      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent(subject)}`;
                    }}
                  >
                    Contact
                  </button>
                  {c.has_resume && (
                    <button
                      type="button"
                      className="btn btn-coral jd-resume-btn"
                      onClick={handleDownloadResume}
                      disabled={downloading}
                      aria-busy={downloading}
                    >
                      {downloading ? 'Preparing…' : 'Download Resume ↓'}
                    </button>
                  )}
                </div>
                {downloadError && (
                  <div role="status" className="jd-action-error">{downloadError}</div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="jd-grid">
          <div className="jd-main">
            {c.summary && (
              <section className="jd-section">
                <h2>About</h2>
                <p style={{ whiteSpace: 'pre-line' }}>{c.summary}</p>
              </section>
            )}

            {skills.length > 0 && (
              <section className="jd-section">
                <h2>Skills</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {skills.map((s) => (
                    <span key={s.id || s.name} className="job-tag" style={{ fontSize: 12 }}>
                      {s.name}{s.years_experience != null ? ` · ${s.years_experience}y` : ''}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {experiences.length > 0 && (
              <section className="jd-section">
                <h2>Experience</h2>
                <ul className="exp-list">
                  {experiences.map((e) => (
                    <li key={e.id} className="exp-item">
                      <div className="exp-bar" aria-hidden="true" />
                      <div className="exp-body">
                        <div className="exp-head">
                          <strong>{e.title || 'Role'}</strong>
                          <span className="muted">·</span>
                          <span>{e.company || 'Company'}</span>
                        </div>
                        <div className="exp-dates">
                          {formatRange(e.start_date, e.end_date, e.is_current)}
                        </div>
                        {e.description && (
                          <p className="exp-desc">{e.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!c.summary && skills.length === 0 && experiences.length === 0 && (
              <EmptyState
                title="Not much to show yet"
                message="This candidate hasn't published a full profile yet."
              />
            )}
          </div>

          <aside className="jd-side">
            {/*
              * "Matching jobs from your company" — visible only when
              * the viewer is the logged-in employer. The panel hides
              * itself when there are no matches above 60%, so we
              * always render it for employers and let it decide
              * what to show.
              */}
            {isEmployer && c.id && (
              <MatchingJobsPanel candidateId={c.id} />
            )}

            <div className="jd-card">
              <h3>Quick facts</h3>
              <dl className="jd-facts">
                <div><dt>Location</dt><dd>{c.location || '—'}</dd></div>
                <div><dt>Country</dt><dd>{c.country || '—'}</dd></div>
                <div><dt>Experience</dt><dd>{c.years_experience != null ? `${c.years_experience}+ yrs` : '—'}</dd></div>
                <div><dt>Availability</dt><dd>{c.availability ? c.availability.replace(/_/g, ' ') : '—'}</dd></div>
                <div><dt>Remote</dt><dd>{c.open_to_remote ? 'Yes' : 'No / hybrid'}</dd></div>
                {c.languages && <div><dt>Languages</dt><dd>{c.languages}</dd></div>}
                <div><dt>Member since</dt><dd>{c.created_at ? new Date(c.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—'}</dd></div>
              </dl>
            </div>

            {profileStrength > 0 && (
              <div className="jd-card">
                <h3>Profile strength</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 28 }}>{profileStrength}%</strong>
                  <span className="muted" style={{ fontSize: 12 }}>complete</span>
                </div>
                <div style={{ height: 6, background: 'var(--bone-2)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ width: `${profileStrength}%`, height: '100%', background: 'var(--coral)', borderRadius: 100 }} />
                </div>
              </div>
            )}

            {(c.linkedin_url || c.portfolio_url || c.github_url) && (
              <div className="jd-card">
                <h3>Links</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.linkedin_url && <a className="btn btn-ghost btn-sm" href={c.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}
                  {c.portfolio_url && <a className="btn btn-ghost btn-sm" href={c.portfolio_url} target="_blank" rel="noopener noreferrer">Portfolio ↗</a>}
                  {c.github_url && <a className="btn btn-ghost btn-sm" href={c.github_url} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
