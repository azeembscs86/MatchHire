/**
 * MatchingJobsPanel
 *
 * "Matching jobs from your company" — shown on the CandidateDetail
 * page when the viewer is the logged-in employer. Fetches active
 * postings at the viewer's company that score above 60% for the
 * candidate; the section hides itself entirely when the response is
 * empty so unmatched candidates don't show an awkward zero state
 * inline.
 *
 * Security is enforced server-side: the endpoint sources the company
 * id from the auth context and only returns rows for that company.
 *
 * @param {number} props.candidateId  ID of the candidate being viewed.
 * @param {function} [props.onContact] Optional contact-button handler.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { employersApi } from '../api/index.js';

function tierFor(score) {
  if (score == null) return null;
  if (score >= 85) return { key: 'strong', label: 'Strong match' };
  if (score >= 70) return { key: 'good',   label: 'Good match' };
  return { key: 'mod',    label: 'Potential match' };
}

function formatSalary(min, max, currency = 'USD', period = 'year') {
  if (!min && !max) return 'Competitive';
  const sym = currency === 'USD' ? '$' : `${currency} `;
  const k = (n) => `${Math.round(Number(n) / 1000)}K`;
  const range = min && max ? `${sym}${k(min)} – ${k(max)}` : (min ? `From ${sym}${k(min)}` : `Up to ${sym}${k(max)}`);
  return `${range} / ${period}`;
}

export default function MatchingJobsPanel({ candidateId, onContact }) {
  const [state, setState] = useState({ records: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ records: [], loading: true, error: null });
    employersApi.matchingJobsForCandidate(candidateId)
      .then((data) => {
        if (cancelled) return;
        setState({ records: data?.records || [], loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ records: [], loading: false, error: err });
      });
    return () => { cancelled = true; };
  }, [candidateId]);

  // While loading, render a tight skeleton so the layout doesn't jump
  // when the response lands.
  if (state.loading) {
    return (
      <section className="match-panel" aria-busy="true">
        <header className="match-panel-head">
          <h3>Matching jobs from your company</h3>
        </header>
        <div className="skel-card" style={{ minHeight: 96 }}>
          <div className="skel-line w-50" />
          <div className="skel-line sm w-30" />
        </div>
      </section>
    );
  }

  // Errors that aren't simply "no matches" are surfaced subtly — we
  // never block the rest of the candidate detail page on this panel.
  if (state.error) {
    return (
      <section className="match-panel">
        <header className="match-panel-head">
          <h3>Matching jobs from your company</h3>
        </header>
        <p className="muted" style={{ fontSize: 13 }}>
          We couldn't load matches right now. Try refreshing.
        </p>
      </section>
    );
  }

  const records = state.records;

  return (
    <section className="match-panel">
      <header className="match-panel-head">
        <h3>Matching jobs from your company</h3>
        <small className="muted">{records.length} above 60%</small>
      </header>

      {records.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          No strong matches found with your active jobs yet.
        </p>
      ) : (
        <ul className="match-list">
          {records.map((r) => {
            const tier = tierFor(r.match_score);
            const matched = (r.matched_skills || []).slice(0, 4);
            const missing = (r.missing_skills || []).slice(0, 3);
            return (
              <li key={r.job_id} className="match-row">
                <div className="match-row-head">
                  <Link to={`/jobs/${r.job_id}`} className="match-row-title">{r.job_title}</Link>
                  <span className={`match-chip match-chip-${tier?.key || 'mod'}`}>
                    {r.match_score}% · {tier?.label}
                  </span>
                </div>
                <div className="match-row-meta">
                  {r.category_name && <span>{r.category_name}</span>}
                  {r.location && <span>· {r.location}</span>}
                  {r.work_mode && <span>· {r.work_mode}</span>}
                  <span>· {formatSalary(r.salary_min, r.salary_max, r.salary_currency, r.salary_period)}</span>
                </div>
                {matched.length > 0 && (
                  <div className="match-row-skills">
                    <span className="match-row-skills-label">Matched:</span>
                    {matched.map((s) => <span key={`m-${s}`} className="match-tag match-tag-yes">{s}</span>)}
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="match-row-skills">
                    <span className="match-row-skills-label">Missing:</span>
                    {missing.map((s) => <span key={`x-${s}`} className="match-tag match-tag-no">{s}</span>)}
                  </div>
                )}
                {onContact && (
                  <div className="match-row-actions">
                    <button
                      type="button"
                      className="btn btn-coral btn-sm"
                      onClick={() => onContact(r)}
                    >
                      Contact about this role
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
