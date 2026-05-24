/**
 * Candidates page.
 *
 * Two distinct surfaces share one route:
 *   - **Guest / candidate viewers**: the original public discovery
 *     grid powered by `GET /public/candidates`.
 *   - **Employer viewers (role=employer)**: the AI-ranked
 *     "Recommended candidates" feed powered by
 *     `POST /employers/recommended-candidates`. The generic browse
 *     is intentionally hidden — companies should only see the
 *     candidates relevant to their active job board (match > 50%).
 *
 * The component picks the right branch by reading `useAuth().role`
 * and renders into the same `.cand-grid` either way, so the visual
 * language is consistent.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CandidateCard from '../components/CandidateCard.jsx';
import MessageModal from '../components/MessageModal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { publicApi, employersApi, candidatesApi } from '../api/index.js';
import { toCandidateCardShape } from '../api/adapters.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Adapt a row from `/employers/recommended-candidates` onto the
 * existing CandidateCard view-model + a `match` decoration. Keeps
 * the card component agnostic about which endpoint sourced the row.
 */
function toRecommendedShape(r, idx = 0) {
  const view = toCandidateCardShape({
    id: r.candidate_id,
    full_name: r.candidate_name,
    avatar_url: r.profile_image,
    headline: r.title,
    current_title: r.title,
    years_experience: r.experience,
    location: r.location,
    country: r.country,
    profile_strength: r.profile_strength,
    skills: (r.candidate_skills || []).map((name) => ({ name })),
  }, idx);
  if (!view) return null;
  // Replace the default rate string with "12 yrs" style so the match
  // card reads as a hiring view rather than a marketplace listing.
  if (r.experience != null) {
    view.rate = `${Math.round(Number(r.experience))} yrs`;
  }
  return {
    view,
    match: {
      score: r.match_score,
      jobTitle: r.matched_job?.job_title?.replace(/\s*\[match-seed-v1-\d+\]$/, '') || r.matched_job?.job_title,
      matched: r.matched_skills || [],
      missing: r.missing_skills || [],
      email: r.email,
    },
  };
}

/**
 * Adapt a row from `/candidates/similar` (candidate-role viewer)
 * onto the same `{ view, match }` shape so the card render below
 * doesn't need a separate code path. `match.jobTitle` doubles as
 * the "current title" line on the card so candidate-similarity
 * rows display their role instead of a non-existent matched job.
 */
function toSimilarShape(r, idx = 0) {
  const view = toCandidateCardShape({
    id: r.candidate_id,
    full_name: r.name,
    avatar_url: r.profile_image,
    headline: r.current_title,
    current_title: r.current_title,
    years_experience: r.experience_years,
    location: r.location,
    skills: (r.skills || []).map((name) => ({ name })),
  }, idx);
  if (!view) return null;
  if (r.experience_years != null) {
    view.rate = `${Math.round(Number(r.experience_years))} yrs`;
  }
  return {
    view,
    match: {
      score: r.similarity_score,
      jobTitle: r.current_title || null,
      matched: r.matched_skills || [],
      // For similarity feed, "missing" repurposed as "different skills
      // they have" — surfaces what the viewer could learn from them.
      missing: (r.skills_they_have || []).slice(0, 3),
      raw: r,
    },
  };
}

export default function Candidates() {
  const { role } = useAuth();
  const isEmployer = role === 'employer';
  const isCandidate = role === 'candidate';

  const [filters, setFilters] = useState({ keyword: '', skill: '', remote: null });
  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Candidate-only: target row for the MessageModal. When null, the
  // modal isn't rendered. The full row is kept (not just the id) so
  // the modal can show the recipient's name + title at the top.
  const [messageTarget, setMessageTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isEmployer) {
          // Employer branch — AI recommendations for the company's
          // active jobs.
          const res = await employersApi.recommendedCandidates({ limit: 100 });
          if (cancelled) return;
          setCandidates(
            (res?.records || []).map((r, i) => toRecommendedShape(r, i)).filter(Boolean)
          );
          setTotal(res?.total ?? null);
        } else if (isCandidate) {
          // Candidate branch — "Similar Professionals" only, never
          // the full candidate list. Server enforces is_public +
          // role + similarity > 50%; client just renders.
          const res = await candidatesApi.similarCandidates({ limit: 100 });
          if (cancelled) return;
          setCandidates(
            (res?.records || []).map((r, i) => toSimilarShape(r, i)).filter(Boolean)
          );
          setTotal(res?.total ?? null);
        } else {
          // Guests fall through to the existing public discovery
          // surface. No behaviour change.
          const params = { page: 1, limit: 24 };
          if (filters.keyword) params.keyword = filters.keyword;
          if (filters.skill) params.skill = filters.skill;
          if (filters.remote === true) params.remote = true;
          const res = await publicApi.candidates(params);
          if (cancelled) return;
          setCandidates(
            (res?.records || []).map((c, i) => ({ view: toCandidateCardShape(c, i), match: null }))
              .filter((x) => x.view)
          );
          setTotal(res?.pagination?.total ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isEmployer, isCandidate, filters]);

  function update(patch) { setFilters((f) => ({ ...f, ...patch })); }

  function handleContact(rowIdx) {
    const row = candidates[rowIdx];
    if (!row?.match?.email) {
      window.alert(`No email available for ${row?.view?.n}. Use the candidate detail page.`);
      return;
    }
    // Open the user's default mail client. A proper in-app messaging
    // flow can replace this when the chat surface ships.
    const subject = `MatchHire: ${row.match.jobTitle || 'A role at our company'}`;
    window.location.href = `mailto:${row.match.email}?subject=${encodeURIComponent(subject)}`;
  }

  return (
    <section className="view active" id="view-candidates">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            {isEmployer
              ? `★ AI matched · ${total != null ? Number(total).toLocaleString() : '—'} above 50%`
              : isCandidate
                ? `★ Similar to you · ${total != null ? Number(total).toLocaleString() : '—'} matches`
                : `★ For employers · ${total != null ? Number(total).toLocaleString() : '—'} candidates`}
          </span>
          <h1
            className="display"
            data-testid={isCandidate ? 'similar-professionals-heading' : undefined}
          >
            {isEmployer ? (
              <>Recommended <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>candidates</span>.</>
            ) : isCandidate ? (
              <>Similar <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>professionals</span>.</>
            ) : (
              <>Hand-picked <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>talent</span>, ready to interview.</>
            )}
          </h1>
          <p>
            {isEmployer
              ? 'Candidates matching your active posted jobs above 50% — ranked highest match first.'
              : isCandidate
                ? 'Candidates with skills and experience similar to your profile. Message anyone above 50% similarity to network professionally.'
                : 'Browse our highest-rated open candidates. Every profile is verified, references checked, and actively job-hunting.'}
          </p>
        </div>
      </div>

      {/* Filters bar — only renders on the public (guest) branch.
          Employer + candidate branches are both server-ranked feeds
          where keyword/skill re-filtering doesn't add real value. */}
      {!isEmployer && !isCandidate && (
        <div className="container" style={{ padding: '32px 0 24px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <input
              placeholder="Search by name or headline"
              value={filters.keyword}
              onChange={(e) => update({ keyword: e.target.value })}
              style={{ flex: '1 1 240px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e0db' }}
            />
            <input
              placeholder="Skill (e.g. React)"
              value={filters.skill}
              onChange={(e) => update({ skill: e.target.value })}
              style={{ flex: '1 1 180px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e0db' }}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={filters.remote === true}
                onChange={(e) => update({ remote: e.target.checked ? true : null })}
              />
              Open to remote
            </label>
          </div>
        </div>
      )}

      <div className="container" style={{ padding: (isEmployer || isCandidate) ? '32px 0 80px' : '0 0 80px' }}>
        {loading
          ? <LoadingState label={
              isEmployer ? 'Scoring candidates against your jobs…'
              : isCandidate ? 'Finding professionals similar to you…'
              : 'Loading candidates…'
            } />
          : error
            ? <ErrorState error={error} />
            : candidates.length === 0
              ? (
                <EmptyState
                  title={isEmployer
                    ? 'No strong candidate matches found yet'
                    : isCandidate
                      ? 'No similar professionals found yet'
                      : 'No candidates match these filters'}
                  message={isEmployer
                    ? 'No active jobs at your company score above 50% against the current public candidate pool. Add more required skills to your postings or check back as more candidates join.'
                    : isCandidate
                      ? 'No similar professionals found yet. Update your skills and experience to get better recommendations.'
                      : 'Try adjusting your filters or check back as more talent joins.'}
                />
              )
              : (
                <div className="cand-grid">
                  {candidates.map((row, i) => (
                    <CandidateCard
                      key={row.view.id}
                      candidate={row.view}
                      rankTop={!isEmployer && !isCandidate && i < 3}
                      match={row.match}
                      onContact={
                        isEmployer
                          ? () => handleContact(i)
                          : isCandidate
                            ? () => setMessageTarget({
                                id: row.view.id,
                                name: row.view.n,
                                current_title: row.match?.jobTitle || null,
                              })
                            : null
                      }
                      contactLabel={isCandidate ? 'Message' : 'Contact'}
                    />
                  ))}
                </div>
              )}

        {isEmployer && candidates.length === 0 && (
          <div style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>
            Tip: open <Link to="/dashboard/company" style={{ color: 'var(--coral)' }}>your dashboard</Link> to manage active postings.
          </div>
        )}
      </div>

      {messageTarget && (
        <MessageModal
          candidate={messageTarget}
          onClose={() => setMessageTarget(null)}
        />
      )}
    </section>
  );
}
