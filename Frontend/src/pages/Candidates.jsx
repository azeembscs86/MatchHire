/**
 * Candidates discovery page - grid of top-rated open candidates,
 * shown to employers as the "Find candidates" funnel entry point.
 *
 * Sourced from `/public/candidates`. The page exposes a small filter
 * surface (keyword, skill, remote) so employers can refine the list
 * before reaching out.
 */
import { useEffect, useState } from 'react';
import CandidateCard from '../components/CandidateCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { publicApi } from '../api/index.js';
import { toCandidateCardShape } from '../api/adapters.js';

export default function Candidates() {
  const [filters, setFilters] = useState({ keyword: '', skill: '', remote: null });
  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = { page: 1, limit: 24 };
        if (filters.keyword) params.keyword = filters.keyword;
        if (filters.skill) params.skill = filters.skill;
        if (filters.remote === true) params.remote = true;
        const res = await publicApi.candidates(params);
        if (cancelled) return;
        setCandidates((res?.records || []).map((c, i) => toCandidateCardShape(c, i)).filter(Boolean));
        setTotal(res?.pagination?.total ?? null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters]);

  function update(patch) { setFilters((f) => ({ ...f, ...patch })); }

  return (
    <section className="view active" id="view-candidates">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ★ For employers · {total != null ? Number(total).toLocaleString() : '—'} candidates
          </span>
          <h1 className="display">Hand-picked <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>talent</span>, ready to interview.</h1>
          <p>Browse our highest-rated open candidates. Every profile is verified, references checked, and actively job-hunting.</p>
        </div>
      </div>
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
      <div className="container" style={{ padding: '0 0 80px' }}>
        {loading
          ? <LoadingState label="Loading candidates…" />
          : error
            ? <ErrorState error={error} />
            : candidates.length === 0
              ? <EmptyState title="No candidates match these filters" />
              : (
                <div className="cand-grid">
                  {candidates.map((c, i) => <CandidateCard key={c.id} candidate={c} rankTop={i < 3} />)}
                </div>
              )}
      </div>
    </section>
  );
}
