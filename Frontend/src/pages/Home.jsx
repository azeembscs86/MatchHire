/**
 * Home page.
 *
 * Renders the full homepage payload returned by `GET /api/v1/home`:
 *
 *   - Hero + live stats + search bar
 *   - Recommended-for-you skill rail (signed-in candidates)
 *   - AI suggestion panel (career + profile + recommended titles)
 *   - "Latest matched jobs" rail (auth-aware: ranked by match%)
 *   - Featured job categories grid
 *   - Top companies grid
 *   - Two call-to-action bands (For Employers / For Candidates)
 *
 * Auth-aware: the same `homeApi.home()` call returns a guest payload when
 * the visitor is anonymous and a personalised one (with `aiSuggestions`,
 * `recommendedJobs`, `latestMatchedJobs`) when a candidate is signed in.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobCard from '../components/JobCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { homeApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { filterActiveJobs } from '../api/adapters.js';
import { useApplyToJob } from '../hooks/useApplyToJob.js';

function fmt(n) {
  if (n == null) return '—';
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString();
}

function CategoryCard({ category }) {
  return (
    <Link
      to={`/jobs?category=${encodeURIComponent(category.slug || category.name || '')}`}
      className="cat-card"
    >
      <div className="cat-icon">★</div>
      <div className="cat-name">{category.name}</div>
      <div className="cat-count">{fmt(category.open_jobs)} open roles</div>
      <span className="cat-arrow">→</span>
    </Link>
  );
}

function CompanyCard({ company }) {
  const initial = (company.name || '·').trim()[0].toUpperCase();
  return (
    <Link to={`/companies/${company.id}`} className="co-card">
      <div className="co-head" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div className="co-logo" style={{ background: 'var(--bone-2)' }}>{initial}</div>
        <div>
          <div className="co-name">{company.name}</div>
          <div className="co-meta" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {company.industry || 'Company'} {company.country ? `· ${company.country}` : ''}
          </div>
        </div>
      </div>
      {company.tagline && (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.45 }}>
          {company.tagline}
        </div>
      )}
      <div className="co-stats">
        <div><span>Open roles</span><span>{fmt(company.open_jobs)}</span></div>
        <div><span>Size</span><span>{company.size || '—'}</span></div>
      </div>
    </Link>
  );
}

function AISuggestionPanel({ suggestions, profileCompletion, name }) {
  if (!suggestions) return null;
  const tips = Array.isArray(suggestions.profileImprovement) ? suggestions.profileImprovement.slice(0, 4) : [];
  const titles = Array.isArray(suggestions.recommendedJobTitles) ? suggestions.recommendedJobTitles.slice(0, 5) : [];
  return (
    <section className="block" style={{ paddingTop: 48 }}>
      <div className="container">
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 32,
            background: 'var(--ink)', color: 'var(--bone)', borderRadius: 24, padding: '36px 40px',
          }}
        >
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14, color: 'rgba(245,240,230,.6)' }}>
              ✨ AI career assistant
            </span>
            <h2 className="display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', marginBottom: 14, lineHeight: 1.1 }}>
              {name ? `${name}, here's how to level up.` : 'Personalised career guidance.'}
            </h2>
            {suggestions.topMatchSummary && (
              <p style={{ fontSize: 15, color: 'rgba(245,240,230,.78)', marginBottom: 18, lineHeight: 1.55 }}>
                {suggestions.topMatchSummary}
              </p>
            )}
            {suggestions.careerImprovement && (
              <p style={{ fontSize: 14, color: 'rgba(245,240,230,.7)', marginBottom: 20, lineHeight: 1.55 }}>
                {suggestions.careerImprovement}
              </p>
            )}

            {titles.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(245,240,230,.55)', marginBottom: 10 }}>
                  Recommended next titles
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {titles.map((t) => (
                    <Link
                      key={t}
                      to={`/jobs?keyword=${encodeURIComponent(t)}`}
                      style={{
                        padding: '6px 12px', borderRadius: 100, fontSize: 12,
                        background: 'rgba(245,240,230,.1)', color: 'var(--bone)',
                        border: '1px solid rgba(245,240,230,.18)',
                      }}
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ background: 'rgba(245,240,230,.08)', borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(245,240,230,.55)', marginBottom: 6 }}>
              Profile strength
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 36, marginBottom: 14 }}>
              {profileCompletion != null ? `${profileCompletion}%` : '—'}
            </div>
            <div style={{ height: 6, background: 'rgba(245,240,230,.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ width: `${profileCompletion || 0}%`, height: '100%', background: 'var(--coral)', borderRadius: 4 }} />
            </div>
            {tips.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tips.map((t, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'rgba(245,240,230,.78)', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--coral)' }}>•</span><span>{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 12.5, color: 'rgba(245,240,230,.78)' }}>
                Your profile is in great shape — keep skills and preferences up to date.
              </div>
            )}
            <Link
              to="/profile"
              className="btn btn-coral"
              style={{ marginTop: 18, justifyContent: 'center', width: '100%', textAlign: 'center' }}
            >
              Open profile
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * LiveStatsBand
 * -------------
 * Four marketplace-momentum cards rendered as a stat strip below the
 * hero: Jobs Posted Today · Active Companies · Active Candidates ·
 * Successful Applications. Replaces nothing — sits below the hero in
 * its own block so the existing hero-stats triplet is unaffected.
 */
function LiveStatsBand({ liveStats }) {
  if (!liveStats) return null;
  const items = [
    { num: liveStats.jobsToday, lbl: 'Jobs posted today', tone: 'coral' },
    { num: liveStats.activeCompanies, lbl: 'Active companies', tone: 'sage' },
    { num: liveStats.activeCandidates, lbl: 'Active candidates', tone: 'plum' },
    { num: liveStats.successfulApplications, lbl: 'Successful hires', tone: 'gold' },
  ];
  return (
    <section className="block live-stats-block">
      <div className="container">
        <div className="live-stats-grid">
          {items.map((s) => (
            <div key={s.lbl} className={`live-stat live-stat-${s.tone}`}>
              <span className="live-stat-num">{fmt(s.num)}</span>
              <span className="live-stat-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * TrendingSkillsRow
 * -----------------
 * Chip cloud derived from the open-job pool's most-frequent skills
 * (30-day window). Each chip deep-links to the jobs page with that
 * skill pre-filtered, so a visitor can drill into a trending area in
 * one click.
 */
function TrendingSkillsRow({ skills }) {
  if (!Array.isArray(skills) || skills.length === 0) return null;
  return (
    <section className="block trending-skills-block">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>▲ Trending right now</span>
            <h2 className="display">Skills companies are <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>hiring</span>.</h2>
          </div>
          <Link to="/jobs" className="section-link">Explore all jobs →</Link>
        </div>
        <div className="trending-chips">
          {skills.slice(0, 14).map((s) => (
            <Link
              key={s.slug}
              to={`/jobs?keyword=${encodeURIComponent(s.name)}`}
              className="trending-chip"
              title={`${s.count} open role${s.count === 1 ? '' : 's'}`}
            >
              <span className="trending-chip-name">{s.name}</span>
              <span className="trending-chip-count">{fmt(s.count)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * RecommendedCompaniesBlock
 * -------------------------
 * Only rendered for logged-in candidates. The payload's
 * `recommendedCompanies` is derived from the candidate's own
 * scored-match set, so each company surfaced here has at least one
 * job the candidate is qualified for. Heading copy makes that
 * personalised origin explicit so candidates trust the surface.
 */
function RecommendedCompaniesBlock({ companies, isCandidate }) {
  if (!isCandidate || !Array.isArray(companies) || companies.length === 0) return null;
  return (
    <section className="block">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ Recommended companies</span>
            <h2 className="display">Companies that <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>fit your skills</span>.</h2>
          </div>
          <Link to="/companies" className="section-link">All companies →</Link>
        </div>
        <div className="co-grid">
          {companies.slice(0, 6).map((c) => <CompanyCard key={c.id} company={c} />)}
        </div>
      </div>
    </section>
  );
}

/**
 * SalaryExplorerBlock
 * -------------------
 * Three side-by-side tables — top roles, top countries, experience
 * levels — each showing average salary across the open-jobs pool.
 * Lightweight preview pointing at the future dedicated /salary route.
 */
function SalaryExplorerBlock({ salary }) {
  if (!salary) return null;
  const slices = [
    { key: 'byRole',       label: 'By role',       items: salary.byRole },
    { key: 'byCountry',    label: 'By country',    items: salary.byCountry },
    { key: 'byExperience', label: 'By experience', items: salary.byExperience },
  ];
  const total = slices.reduce((s, sl) => s + (sl.items?.length || 0), 0);
  if (total === 0) return null;
  // Symbol map for the currencies actually present in our catalogue.
  // Anything not in the map falls back to "<code> 123K" so the row
  // is still legible.
  const CUR_SYMBOL = { USD: '$', EUR: '€', GBP: '£', INR: '₹', PKR: '₨', AED: 'AED ', SGD: 'S$', AUD: 'A$' };
  const formatRange = (s) => {
    if (s.avgSalary == null && s.minSalary == null && s.maxSalary == null) return '—';
    if (s.avgSalary == null) return '—';
    const k = Math.round(Number(s.avgSalary) / 1000);
    const sym = CUR_SYMBOL[s.currency] != null ? CUR_SYMBOL[s.currency] : `${s.currency} `;
    return `${sym}${k}K avg`;
  };
  return (
    <section className="block salary-explorer-block">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>◆ Salary explorer</span>
            <h2 className="display">What roles <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>actually pay</span>.</h2>
          </div>
          <Link to="/jobs" className="section-link">Browse paying roles →</Link>
        </div>
        <div className="salary-grid">
          {slices.map((slice) => (
            <div key={slice.key} className="salary-card">
              <div className="salary-card-head">{slice.label}</div>
              {(slice.items || []).length === 0 ? (
                <div className="salary-card-empty">—</div>
              ) : (
                <ul className="salary-card-list">
                  {slice.items.slice(0, 6).map((it) => (
                    <li key={`${slice.key}-${it.label}`} className="salary-card-row">
                      <span className="salary-card-label" title={it.label}>{it.label || '—'}</span>
                      <span className="salary-card-value">{formatRange(it)}</span>
                      <span className="salary-card-count">{fmt(it.jobs)} jobs</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * CareerResourcesBlock
 * --------------------
 * Three column-cards of curated career content (resume tips, interview
 * prep, skill growth). Static-content service today; structured so a
 * future AI generator can swap the body without touching the frontend.
 */
function CareerResourcesBlock({ resources }) {
  if (!resources) return null;
  const columns = [
    { key: 'resumeTips',    label: 'Resume tips',           items: resources.resumeTips },
    { key: 'interviewPrep', label: 'Interview preparation', items: resources.interviewPrep },
    { key: 'skillGrowth',   label: 'Skill growth',          items: resources.skillGrowth },
  ];
  const total = columns.reduce((s, c) => s + (c.items?.length || 0), 0);
  if (total === 0) return null;
  return (
    <section className="block career-resources-block">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>✦ Career resources</span>
            <h2 className="display">Sharpen your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>edge</span>.</h2>
          </div>
        </div>
        <div className="career-grid">
          {columns.map((col) => (
            <div key={col.key} className="career-col">
              <div className="career-col-head">{col.label}</div>
              <ul className="career-col-list">
                {(col.items || []).map((it) => (
                  <li key={it.id} className="career-item">
                    <span className="career-item-icon" aria-hidden="true">{it.icon}</span>
                    <div>
                      <div className="career-item-title">{it.title}</div>
                      <div className="career-item-body">{it.body}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * EmployerHomeSummary
 * -------------------
 * Logged-in employer view: replaces the candidate-only AI suggestion
 * block with a hiring snapshot (open jobs, applications this week,
 * shortlisted, interviews, hires) plus a "Post new job" CTA. Sits in
 * the same vertical slot as the candidate AISuggestionPanel so the
 * page rhythm stays unchanged across roles.
 */
function EmployerHomeSummary({ employer, name }) {
  if (!employer) return null;
  const stats = [
    { num: employer.openJobs,             lbl: 'Open jobs' },
    { num: employer.applicationsThisWeek, lbl: 'Apps this week' },
    { num: employer.shortlisted,          lbl: 'Shortlisted' },
    { num: employer.interviews,           lbl: 'Interviews' },
    { num: employer.hires,                lbl: 'Hires' },
  ];
  return (
    <section className="block" style={{ paddingTop: 48 }}>
      <div className="container">
        <div className="employer-summary-card">
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 14, color: 'rgba(245,240,230,.6)' }}>◆ Hiring snapshot</span>
            <h2 className="display" style={{ fontSize: 'clamp(26px,3.5vw,36px)', marginBottom: 14, lineHeight: 1.1 }}>
              {name ? `${name}, your hiring at a glance.` : 'Your hiring at a glance.'}
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(245,240,230,.78)', marginBottom: 22, lineHeight: 1.55, maxWidth: 540 }}>
              {employer.companyName ? `${employer.companyName} — ` : ''}
              jump into the dashboard to review applicants, schedule interviews, or post a new role.
            </p>
            <div className="employer-summary-actions">
              <Link to="/dashboard/company" className="btn btn-coral">Open dashboard →</Link>
              <Link to="/candidates" className="btn btn-ghost-inverse">Talent search →</Link>
            </div>
          </div>
          <div className="employer-summary-stats">
            {stats.map((s) => (
              <div key={s.lbl} className="employer-summary-stat">
                <span className="employer-summary-num">{fmt(s.num)}</span>
                <span className="employer-summary-lbl">{s.lbl}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CtaBand({ block, tone = 'light' }) {
  if (!block) return null;
  const isDark = tone === 'dark';
  return (
    <section className="block">
      <div className="container">
        <div
          style={{
            borderRadius: 24, padding: '48px 40px',
            background: isDark ? 'var(--ink)' : 'var(--bone)',
            color: isDark ? 'var(--bone)' : 'var(--ink)',
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 32, alignItems: 'center',
          }}
        >
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 12, color: isDark ? 'rgba(245,240,230,.6)' : 'var(--muted)' }}>
              {block.eyebrow}
            </span>
            <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 'clamp(26px,3vw,36px)', lineHeight: 1.1, marginBottom: 12 }}>
              {block.title}
            </h3>
            <p style={{ fontSize: 15, color: isDark ? 'rgba(245,240,230,.7)' : 'var(--muted)', maxWidth: 540, lineHeight: 1.55 }}>
              {block.body}
            </p>
          </div>
          <Link to={block.actionHref || '/'} className="btn btn-coral" style={{ whiteSpace: 'nowrap' }}>
            {block.actionLabel || 'Get started'} →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [applyMessage, setApplyMessage] = useState(null);
  // Track which jobs the candidate just applied to in this session so
  // we can swap their card to "Already Applied" without needing a
  // refetch. The backend listing already excludes applied rows on the
  // NEXT fetch — this state covers the in-between.
  const [appliedIds, setAppliedIds] = useState(() => new Set());

  const { apply, applyingId, isCandidate } = useApplyToJob({
    onSuccess: ({ job, result }) => {
      setAppliedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
      setApplyMessage({
        ok: true,
        text: `Application submitted to ${job.co}${result?.match_score != null ? ` · ${result.match_score}% match` : ''}.`,
      });
      setTimeout(() => setApplyMessage(null), 5000);
    },
    onError: ({ message }) => {
      setApplyMessage({ ok: false, text: message });
      setTimeout(() => setApplyMessage(null), 5000);
    },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    homeApi.home()
      .then((data) => { if (!cancelled) setPayload(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  function onSearch(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (location.trim()) params.set('location', location.trim());
    navigate(`/jobs${params.toString() ? `?${params}` : ''}`);
  }

  const hero = payload?.hero || { openJobs: null, companies: null, candidates: null };
  const liveStats = payload?.liveStats || null;
  const trendingSkills = payload?.trendingSkills || [];
  const salaryExplorer = payload?.salaryExplorer || null;
  const careerResources = payload?.careerResources || null;
  const recommendedCompanies = payload?.recommendedCompanies || [];
  const employer = payload?.employer || null;
  const isEmployer = payload?.viewer?.role === 'employer';
  const categories = payload?.categories || [];
  const topCompanies = payload?.topCompanies || [];
  // Defence-in-depth: backend already excludes expired jobs from these
  // candidate-facing rails, but `filterActiveJobs` doubles as a safety
  // net so a stale cache or misbehaving endpoint can never put an
  // expired card in front of a candidate.
  const latestJobs = filterActiveJobs(payload?.latestJobs);
  const recommended = filterActiveJobs(payload?.recommendedJobs);
  const latestMatched = filterActiveJobs(payload?.latestMatchedJobs);
  const aiSuggestions = payload?.aiSuggestions || null;
  const cta = payload?.cta || null;
  const profileCompletion = payload?.viewer?.profileCompletion ?? null;
  // `isCandidate` comes from useApplyToJob() above so the apply-button
  // visibility check and the rest of the page (hero copy, AI panels)
  // agree on a single source of truth.

  const heroStats = useMemo(() => ([
    { num: hero.openJobs, lbl: 'Open Roles' },
    { num: hero.companies, lbl: 'Companies' },
    { num: hero.candidates, lbl: 'Active Talent' },
  ]), [hero.openJobs, hero.companies, hero.candidates]);

  return (
    <section className="view active" id="view-home">
      <div className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-eyebrow">
              <span className="dot"></span>
              {isCandidate
                ? `Personalised for ${user?.full_name || 'you'} · jobs matched to your skills`
                : 'Curated career marketplace · senior talent only'}
            </div>
            <h1 className="display">
              Find work<br />
              <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>that fits</span><br />
              like it&apos;s woven for you.
            </h1>
            <p className="hero-sub">
              A curated job marketplace where senior talent meets companies that actually deserve them.
              No noise. No spam. Just opportunities matched to who you are.
            </p>

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
                  <span className="num">{fmt(s.num)}</span>
                  <span className="lbl">{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual">
            {(recommended.length ? recommended : latestJobs).slice(0, 3).map((j, i) => (
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
                  <span className="mini-meta" style={{ fontSize: 10 }}>{j.matchScore != null ? `${j.matchScore}% match` : j.time}</span>
                </div>
              </div>
            ))}
            <div className="float-badge b1">★ Curated for you</div>
            <div className="float-badge b2" style={{ background: 'var(--sage)' }}>+ New today</div>
          </div>
        </div>
      </div>

      {/* Live hiring statistics — visible to everyone (guests, candidates, employers). */}
      <LiveStatsBand liveStats={liveStats} />

      {/* Skill rail (only meaningful when authed). */}
      <div className="rec-bar">
        <div className="container rec-bar-inner">
          <div className="rec-pill"><span className="dot"></span>{isCandidate ? 'Curated for you' : 'Skills employers want'}</div>
          <small>{isCandidate ? 'Based on your profile' : 'Trending right now'}</small>
          <div className="rec-skills">
            {(isCandidate && recommended[0]?.tags?.length ? recommended[0].tags : ['React', 'TypeScript', 'Node.js', 'Python', 'AWS']).slice(0, 5).map((t) => (
              <span key={t} className="rec-skill">{t}</span>
            ))}
          </div>
          <small style={{ marginLeft: 'auto' }}>
            {isCandidate ? <Link to="/preferences">Refine in preferences →</Link> : <span>Sign in to personalise →</span>}
          </small>
        </div>
      </div>

      {/* Recommended for you (or featured for guests). */}
      <section className="block">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>
                {isCandidate ? '★ Recommended for you' : '★ Featured opportunities'}
              </span>
              <h2 className="display">
                {isCandidate
                  ? <>Roles <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>matched</span> to your skills.</>
                  : <>Latest <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>active</span> roles.</>}
              </h2>
            </div>
            <Link to="/jobs" className="section-link">Browse all jobs →</Link>
          </div>

          {applyMessage && (
            <div
              role="status"
              style={{
                margin: '0 0 16px', padding: '10px 12px', borderRadius: 8,
                background: applyMessage.ok ? '#e6f4ea' : '#fde9e3',
                color: applyMessage.ok ? '#0f5132' : '#b3361b',
                fontSize: 13,
              }}
            >
              {applyMessage.text}
            </div>
          )}

          {loading ? <LoadingState label="Loading recommendations…" />
            : error ? <ErrorState error={error} onRetry={() => homeApi.home().then(setPayload).catch(setError)} />
            : (
              isCandidate && payload?.aiSuggestions?.profileImprovement?.length > 0 && recommended.length === 0
              ? <EmptyState
                  title="Complete your profile to unlock matches"
                  message="Add skills, experience, and preferences to get personalised job recommendations above the 40% match threshold."
                />
              : (recommended.length || latestJobs.length) === 0
                ? <EmptyState title="No jobs to recommend yet" message="Check back soon — new roles are added every day." />
                : (
                  <div className="jobs-grid" id="recommended-jobs">
                    {(recommended.length ? recommended : latestJobs).slice(0, 6).map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        featured
                        onApply={isCandidate ? apply : undefined}
                        applied={appliedIds.has(j.id)}
                        applyingId={applyingId}
                      />
                    ))}
                  </div>
                )
            )}
        </div>
      </section>

      {/* AI suggestion panel — only when authenticated as a candidate. */}
      {isCandidate && <AISuggestionPanel
        suggestions={aiSuggestions}
        profileCompletion={profileCompletion}
        name={payload?.viewer?.name?.split(' ')?.[0]}
      />}

      {/*
       * Employer view replaces the candidate-only AI panel above with
       * a hiring snapshot — kept in the same vertical slot so the
       * page rhythm is identical across roles.
       */}
      {isEmployer && <EmployerHomeSummary
        employer={employer}
        name={payload?.viewer?.name?.split(' ')?.[0]}
      />}

      {/* Trending skills — visible to everyone; drives discovery from a fresh visit. */}
      <TrendingSkillsRow skills={trendingSkills} />

      {/* Candidate-personalised "Recommended companies for your skills". */}
      <RecommendedCompaniesBlock companies={recommendedCompanies} isCandidate={isCandidate} />

      {/* Latest matched jobs rail — auth-aware. */}
      {isCandidate && latestMatched.length > 0 && (
        <section className="block" style={{ paddingTop: 32 }}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>↻ Latest matched</span>
                <h2 className="display">Fresh openings, ranked by <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>fit</span>.</h2>
              </div>
              <Link to="/jobs?sort=best_match" className="section-link">See all matches →</Link>
            </div>
            <div className="jobs-grid">
              {latestMatched.slice(0, 6).map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  featured
                  onApply={isCandidate ? apply : undefined}
                  applied={appliedIds.has(j.id)}
                  applyingId={applyingId}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured job categories. */}
      <section className="block">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ Explore by category</span>
              <h2 className="display">Find roles by <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>discipline</span>.</h2>
            </div>
          </div>
          {categories.length === 0
            ? <EmptyState title="No categories yet" message="Categories will appear here once jobs are posted." />
            : (
              <div className="cat-grid">
                {categories.slice(0, 12).map((c) => <CategoryCard key={c.id} category={c} />)}
              </div>
            )}
        </div>
      </section>

      {/* Top companies. */}
      <section className="block">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ Top companies</span>
              <h2 className="display">Hiring <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>right now</span>.</h2>
            </div>
            <Link to="/companies" className="section-link">All companies →</Link>
          </div>
          {topCompanies.length === 0
            ? <EmptyState title="No companies to feature yet" message="Verified employers will show up here." />
            : (
              <div className="co-grid">
                {topCompanies.slice(0, 8).map((c) => <CompanyCard key={c.id} company={c} />)}
              </div>
            )}
        </div>
      </section>

      {/* Salary explorer — useful to every viewer (guests evaluating
          worth, candidates pricing themselves, employers benchmarking). */}
      <SalaryExplorerBlock salary={salaryExplorer} />

      {/* Career resources — surfaced for candidate flow + guests. We
          intentionally don't render this for employers (they have a
          different content scope). */}
      {!isEmployer && <CareerResourcesBlock resources={careerResources} />}

      {/* Two CTA bands — one for employers, one for candidates. */}
      <CtaBand block={cta?.forEmployers} tone="dark" />
      {!isCandidate && <CtaBand block={cta?.forCandidates} tone="light" />}
    </section>
  );
}
