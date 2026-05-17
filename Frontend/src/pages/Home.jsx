/**
 * Home page.
 *
 * Above-the-fold hero, search bar, and a "Recommended for you" rail.
 *
 * Dynamic data:
 *   - Hero stats (`Open Roles`, `Companies`) reflect live counts pulled
 *     from `/public/jobs` and `/public/companies` (page size 1, only
 *     the `pagination.total` is read).
 *   - The recommended rail is populated from `/public/featured-jobs`
 *     for guests and `/candidates/recommended-jobs` for authenticated
 *     candidates - so the same component covers both audiences.
 *   - The search box submits to `/jobs` carrying the keyword and
 *     location as query string params so the listing page can pick
 *     them up.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { publicApi, candidatesApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { toJobCardShape } from '../api/adapters.js';

export default function Home() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ jobs: null, companies: null });
  const [recommended, setRecommended] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [jobsTotal, companiesTotal, recommendedRaw] = await Promise.all([
          publicApi.jobs({ page: 1, limit: 1 }).then((d) => d?.pagination?.total ?? 0).catch(() => 0),
          publicApi.companies({ page: 1, limit: 1 }).then((d) => d?.pagination?.total ?? 0).catch(() => 0),
          role === 'candidate'
            ? candidatesApi.recommendedJobs(6).then((d) => d?.records || []).catch(() => [])
            : publicApi.featuredJobs(6).then((d) => d?.records || []).catch(() => []),
        ]);
        if (cancelled) return;
        setStats({ jobs: jobsTotal, companies: companiesTotal });
        setRecommended(recommendedRaw.map(toJobCardShape).filter(Boolean));
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, role]);

  function onSearch(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (location.trim()) params.set('location', location.trim());
    navigate(`/jobs${params.toString() ? `?${params}` : ''}`);
  }

  const heroStats = useMemo(() => ([
    { num: stats.jobs ?? '—', lbl: 'Open Roles' },
    { num: stats.companies ?? '—', lbl: 'Companies' },
    { num: '96%', lbl: 'Match Rate' },
  ]), [stats]);

  return (
    <section className="view active" id="view-home">
      <div className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-eyebrow"><span className="dot"></span>Personalized for your skills · React, Node.js, TypeScript</div>
            <h1 className="display">
              Find work<br />
              <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>that fits</span><br />
              like it's woven for you.
            </h1>
            <p className="hero-sub">A curated job marketplace where senior talent meets companies that actually deserve them. No noise. No spam. Just opportunities matched to who you are.</p>

            <form className="search-bar" onSubmit={onSearch}>
              <div className="search-field">
                <label>What</label>
                <input type="text" placeholder="Senior Frontend Engineer" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </div>
              <div className="search-field">
                <label>Where</label>
                <input type="text" placeholder="Remote, anywhere" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <button className="btn btn-coral" type="submit">
                <svg className="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                Search
              </button>
            </form>

            <div className="hero-stats">
              {heroStats.map((s) => (
                <div key={s.lbl}>
                  <span className="num">{typeof s.num === 'number' ? s.num.toLocaleString() : s.num}</span>
                  <span className="lbl">{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            {recommended.slice(0, 3).map((j, i) => (
              <div key={j.id} className={`hero-card hero-card-${i + 1}`}>
                <div className="mini-job-head">
                  <div className={`mini-logo ${j.cl}`}>{j.l}</div>
                  <div><div className="mini-meta">{j.co} · {j.loc}</div></div>
                </div>
                <div className="mini-title">{j.title}</div>
                <div className="mini-tags">
                  {(j.tags || []).slice(0, 3).map((t) => <span key={t} className="mini-tag">{t}</span>)}
                </div>
                <div className="mini-foot">
                  <span className="mini-pay">{j.pay}</span>
                  <span className="mini-meta" style={{ fontSize: 10 }}>{j.time}</span>
                </div>
              </div>
            ))}
            <div className="float-badge b1">★ Curated for you</div>
            <div className="float-badge b2" style={{ background: 'var(--sage)' }}>+ New today</div>
          </div>
        </div>
      </div>

      <div className="rec-bar">
        <div className="container rec-bar-inner">
          <div className="rec-pill"><span className="dot"></span>Curated for you</div>
          <small>Based on your profile</small>
          <div className="rec-skills">
            <span className="rec-skill">React</span>
            <span className="rec-skill">TypeScript</span>
            <span className="rec-skill">Node.js</span>
            <span className="rec-skill">GraphQL</span>
            <span className="rec-skill">+ 4 more</span>
          </div>
          <small style={{ marginLeft: 'auto' }}>
            {role === 'candidate' ? <Link to="/preferences">Refine in preferences →</Link> : 'Sign in to personalise →'}
          </small>
        </div>
      </div>

      <section className="block">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ Recommended for you</span>
              <h2 className="display">Latest jobs <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>matched</span> to your skills.</h2>
            </div>
            <Link to="/jobs" className="section-link">Browse all jobs →</Link>
          </div>
          {loading
            ? <LoadingState label="Loading recommendations…" />
            : error
              ? <ErrorState error={error} onRetry={() => setStats({ ...stats })} />
              : recommended.length === 0
                ? <EmptyState title="No jobs to recommend yet" message="Check back soon — new roles are added every day." />
                : (
                  <div className="jobs-grid" id="recommended-jobs">
                    {recommended.map((j) => (
                      <JobCard key={j.id} job={j} featured />
                    ))}
                  </div>
                )}
        </div>
      </section>
    </section>
  );
}
