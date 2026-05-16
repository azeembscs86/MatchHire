import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_PRIORITIES } from '../data/priorities.js';

const SECTIONS = [
  { id: 'priorities', n: 1, label: 'Top priorities' },
  { id: 'role', n: 2, label: 'Role & experience' },
  { id: 'comp', n: 3, label: 'Compensation' },
  { id: 'location', n: 4, label: 'Location & mode' },
  { id: 'industry', n: 5, label: 'Industry & stage' },
  { id: 'weights', n: 6, label: 'Match weighting' },
  { id: 'dealbreakers', n: 7, label: 'Deal breakers' },
  { id: 'alerts', n: 8, label: 'Notifications' },
];

function TagOpt({ active: initial = false, children }) {
  const [active, setActive] = useState(initial);
  return (
    <div className={`tag-opt${active ? ' active' : ''}`} onClick={() => setActive((v) => !v)}>{children}</div>
  );
}

function OptCard({ active: initial = false, icon, title, sub }) {
  const [active, setActive] = useState(initial);
  return (
    <div className={`opt-card${active ? ' active' : ''}`} onClick={() => setActive((v) => !v)}>
      <span className="opt-icon">{icon}</span><strong>{title}</strong><span>{sub}</span>
    </div>
  );
}

function Toggle({ initial = false }) {
  const [on, setOn] = useState(initial);
  return <div className={`toggle${on ? ' on' : ''}`} onClick={() => setOn((v) => !v)}></div>;
}

function WeightRow({ label, defaultValue }) {
  const [v, setV] = useState(defaultValue);
  return (
    <div className="weight-row">
      <label>{label}</label>
      <input type="range" min="0" max="100" value={v} onChange={(e) => setV(+e.target.value)} />
      <strong>{v}%</strong>
    </div>
  );
}

function MatchScoreRange() {
  const [v, setV] = useState(85);
  const note = v >= 85 ? 'high-confidence only' : v >= 70 ? 'good fits' : 'wider net';
  return (
    <div className="range-field" style={{ background: 'var(--bone)' }}>
      <div className="range-display">{v}% match score <small>· {note}</small></div>
      <input type="range" min="50" max="100" value={v} onChange={(e) => setV(+e.target.value)} />
    </div>
  );
}

export default function Preferences() {
  const [activeSection, setActiveSection] = useState('priorities');
  const [rankedIds, setRankedIds] = useState(['wlb', 'comp', 'growth', 'remote', 'tech']);
  const [minSal, setMinSal] = useState(150);
  const [tgtSal, setTgtSal] = useState(200);
  const [deals, setDeals] = useState([
    'No fully onsite roles',
    'Requires more than 4 hours of timezone overlap',
    "Companies that don't offer equity",
    'No "rockstar ninja" job descriptions',
    'Crypto / Web3 only roles'
  ]);
  const [dealInput, setDealInput] = useState('');

  const addRank = (id) => {
    if (rankedIds.includes(id)) return;
    if (rankedIds.length >= 8) { alert('Keep it focused — max 8 priorities'); return; }
    setRankedIds([...rankedIds, id]);
  };
  const removeRank = (i) => setRankedIds(rankedIds.filter((_, idx) => idx !== i));
  const moveRank = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rankedIds.length) return;
    const next = [...rankedIds];
    [next[i], next[j]] = [next[j], next[i]];
    setRankedIds(next);
  };

  const scrollPref = (id) => {
    setActiveSection(id);
    const el = document.getElementById('pref-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addDeal = () => {
    if (!dealInput.trim()) return;
    setDeals([...deals, dealInput.trim()]);
    setDealInput('');
  };

  return (
    <section className="view active" id="view-preferences">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Job preferences · The brain behind your matches</span>
          <h1 className="display">What <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>matters</span> to you?</h1>
          <p>Rank your priorities, set your filters, and we'll only show you roles that genuinely fit. Updates apply instantly to your job feed.</p>
        </div>
      </div>

      <div className="container pref-layout">
        <aside className="pref-side">
          <ul className="pref-side-nav">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a className={activeSection === s.id ? 'active' : ''} onClick={() => scrollPref(s.id)}>
                  <span>{s.n}</span> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <div className="pref-main">

          {/* TOP PRIORITIES */}
          <div className="pref-card priority-board" id="pref-priorities">
            <span className="pref-eyebrow"><span className="dot"></span>The most important section</span>
            <div className="pref-head">
              <h2>Rank your top <span className="ital">5 priorities</span><br />in order of importance.</h2>
              <span className="pref-num">01 / 08</span>
            </div>
            <p className="lead">Drag, reorder, swap. Your #1 priority weighs 2× more than your #5. Anything not on the list won't influence your matches.</p>

            <span className="pool-label">Your ranked priorities</span>
            <div className="ranked-list">
              {rankedIds.length === 0
                ? <div className="ranked-empty">Click priorities below to add them. Top of the list = top priority.</div>
                : rankedIds.map((id, i) => {
                  const p = ALL_PRIORITIES.find((x) => x.id === id);
                  const cls = i === 0 ? 'first' : i === 1 ? 'second' : '';
                  return (
                    <div key={id} className={`ranked-item ${cls}`}>
                      <div className="rank-badge">#{i + 1}</div>
                      <div className="pri-icon">{p.icon}</div>
                      <div className="pri-text"><strong>{p.name}</strong><small>{p.desc}</small></div>
                      <div className="rank-controls">
                        <button className="rank-btn" onClick={() => moveRank(i, -1)} disabled={i === 0}>↑</button>
                        <button className="rank-btn" onClick={() => moveRank(i, 1)} disabled={i === rankedIds.length - 1}>↓</button>
                        <button className="rank-btn remove" onClick={() => removeRank(i)}>×</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <span className="pool-label" style={{ marginTop: 24 }}>Available priorities · click to add</span>
            <div className="priority-pool">
              {ALL_PRIORITIES.map((p) => {
                const added = rankedIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={`priority-chip${added ? ' added' : ''}`}
                    onClick={() => addRank(p.id)}
                  >
                    <span className="icon-em">{p.icon}</span>{p.name}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROLE & EXPERIENCE */}
          <div className="pref-card" id="pref-role">
            <div className="pref-head">
              <h2>Role &amp; <span className="ital">experience</span> level.</h2>
              <span className="pref-num">02 / 08</span>
            </div>
            <p className="lead">What kind of roles should we surface, and where are you in your career?</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Desired roles · pick up to 5</label>
              <div className="tag-selector">
                <TagOpt active>Frontend Engineer</TagOpt>
                <TagOpt active>Full-Stack Engineer</TagOpt>
                <TagOpt active>Staff / Tech Lead</TagOpt>
                <TagOpt>Backend Engineer</TagOpt>
                <TagOpt>Engineering Manager</TagOpt>
                <TagOpt>Product Engineer</TagOpt>
                <TagOpt>Mobile Engineer</TagOpt>
                <TagOpt>DevOps / SRE</TagOpt>
                <TagOpt>Designer</TagOpt>
                <TagOpt>+ Custom role</TagOpt>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Experience level</label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                <OptCard icon="●" title="Entry" sub="0–2 years" />
                <OptCard icon="●" title="Mid" sub="2–5 years" />
                <OptCard icon="●" title="Senior" sub="5–8 years" active />
                <OptCard icon="●" title="Staff" sub="8–12 years" active />
                <OptCard icon="●" title="Principal" sub="12+ years" />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Job type</label>
              <div className="tag-selector">
                <TagOpt active>Full-time</TagOpt>
                <TagOpt>Contract</TagOpt>
                <TagOpt>Part-time</TagOpt>
                <TagOpt>Freelance</TagOpt>
                <TagOpt>Internship</TagOpt>
              </div>
            </div>
          </div>

          {/* COMPENSATION */}
          <div className="pref-card" id="pref-comp">
            <div className="pref-head">
              <h2><span className="ital">Compensation</span> expectations.</h2>
              <span className="pref-num">03 / 08</span>
            </div>
            <p className="lead">Set your floor. We'll never show you anything below your minimum, and we'll prioritize roles within your range.</p>

            <div className="range-group">
              <div className="range-field">
                <label>Minimum base salary · USD</label>
                <div className="range-display">${minSal}K <small>· per year</small></div>
                <input type="range" min="40" max="400" value={minSal} step="5" onChange={(e) => setMinSal(+e.target.value)} />
              </div>
              <div className="range-field">
                <label>Target base salary · USD</label>
                <div className="range-display">${tgtSal}K <small>· per year</small></div>
                <input type="range" min="40" max="400" value={tgtSal} step="5" onChange={(e) => setTgtSal(+e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Currency</label>
              <div className="tag-selector">
                <TagOpt active>USD $</TagOpt>
                <TagOpt>EUR €</TagOpt>
                <TagOpt>GBP £</TagOpt>
                <TagOpt>PKR ₨</TagOpt>
                <TagOpt>INR ₹</TagOpt>
                <TagOpt>AED د.إ</TagOpt>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Compensation must include</label>
              <div className="tag-selector">
                <TagOpt active>Equity / RSUs</TagOpt>
                <TagOpt>Annual bonus</TagOpt>
                <TagOpt active>401k / pension match</TagOpt>
                <TagOpt>Signing bonus</TagOpt>
                <TagOpt active>Healthcare</TagOpt>
                <TagOpt>Learning budget</TagOpt>
              </div>
            </div>
          </div>

          {/* LOCATION & WORK MODE */}
          <div className="pref-card" id="pref-location">
            <div className="pref-head">
              <h2>Location &amp; <span className="ital">work mode</span>.</h2>
              <span className="pref-num">04 / 08</span>
            </div>
            <p className="lead">Where in the world, and how do you want to show up to work?</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Work mode · pick all that work for you</label>
              <div className="opt-grid">
                <OptCard icon="⌂" title="Fully remote" sub="Work from anywhere" active />
                <OptCard icon="⇄" title="Hybrid" sub="2–3 days in office" active />
                <OptCard icon="◆" title="Onsite" sub="5 days in office" />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Preferred locations</label>
              <div className="tag-selector">
                <TagOpt active>🌍 Anywhere remote</TagOpt>
                <TagOpt active>🇵🇰 Karachi</TagOpt>
                <TagOpt active>🇦🇪 Dubai</TagOpt>
                <TagOpt>🇺🇸 San Francisco</TagOpt>
                <TagOpt>🇺🇸 New York</TagOpt>
                <TagOpt>🇬🇧 London</TagOpt>
                <TagOpt>🇩🇪 Berlin</TagOpt>
                <TagOpt>🇸🇬 Singapore</TagOpt>
                <TagOpt>+ Add city</TagOpt>
              </div>
            </div>

            <div className="toggle-row" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 18 }}>
              <div><strong>Open to relocate</strong><small>Show roles requiring relocation if pay covers it</small></div>
              <Toggle initial />
            </div>
            <div className="toggle-row">
              <div><strong>Visa sponsorship needed</strong><small>Only show employers who sponsor work visas</small></div>
              <Toggle />
            </div>
            <div className="toggle-row">
              <div><strong>Time zone overlap required</strong><small>4+ hours overlap with my zone (PKT, UTC+5)</small></div>
              <Toggle initial />
            </div>
          </div>

          {/* INDUSTRY & STAGE */}
          <div className="pref-card" id="pref-industry">
            <div className="pref-head">
              <h2>Industry &amp; <span className="ital">company stage</span>.</h2>
              <span className="pref-num">05 / 08</span>
            </div>
            <p className="lead">A scrappy seed-stage startup is a very different beast from a public company. Tell us where you thrive.</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Industries you'd love</label>
              <div className="tag-selector">
                <TagOpt active>Developer Tools</TagOpt>
                <TagOpt active>SaaS / B2B</TagOpt>
                <TagOpt active>Fintech</TagOpt>
                <TagOpt active>AI / ML</TagOpt>
                <TagOpt>E-commerce</TagOpt>
                <TagOpt>Healthcare</TagOpt>
                <TagOpt>Climate tech</TagOpt>
                <TagOpt>Gaming</TagOpt>
                <TagOpt>Education</TagOpt>
                <TagOpt>Media</TagOpt>
                <TagOpt>Crypto / Web3</TagOpt>
                <TagOpt>Hardware</TagOpt>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Company stage</label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                <OptCard icon="●" title="Seed" sub="1–10 ppl" />
                <OptCard icon="●" title="Series A–B" sub="10–100" active />
                <OptCard icon="●" title="Series C+" sub="100–500" active />
                <OptCard icon="●" title="Late-stage" sub="500–5K" />
                <OptCard icon="◆" title="Public" sub="5K+" />
              </div>
            </div>
          </div>

          {/* MATCH WEIGHTING */}
          <div className="pref-card" id="pref-weights">
            <div className="pref-head">
              <h2>Fine-tune the <span className="ital">match algorithm</span>.</h2>
              <span className="pref-num">06 / 08</span>
            </div>
            <p className="lead">How much should each factor influence which jobs reach the top of your feed? Drag to adjust.</p>

            <WeightRow label="💰 Compensation" defaultValue={85} />
            <WeightRow label="🛠 Skills match" defaultValue={95} />
            <WeightRow label="📍 Location fit" defaultValue={70} />
            <WeightRow label="🏢 Company stage" defaultValue={50} />
            <WeightRow label="📈 Career growth" defaultValue={75} />
            <WeightRow label="⚖ Work-life balance" defaultValue={80} />
            <WeightRow label="🎯 Mission alignment" defaultValue={60} />
          </div>

          {/* DEAL BREAKERS */}
          <div className="pref-card" id="pref-dealbreakers">
            <div className="pref-head">
              <h2><span className="ital">Deal breakers</span>.</h2>
              <span className="pref-num">07 / 08</span>
            </div>
            <p className="lead">The hard nos. Roles matching any of these will never appear in your feed — no exceptions, no "but the salary is great" override.</p>

            <div className="deal-list">
              {deals.map((d, i) => (
                <div key={i} className="deal-item">
                  <span className="ic">×</span> {d}
                  <button onClick={() => setDeals(deals.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
            <div className="deal-add">
              <input
                type="text"
                placeholder="Add a deal breaker… (e.g. on-call rotations every weekend)"
                value={dealInput}
                onChange={(e) => setDealInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDeal(); } }}
              />
              <button onClick={addDeal}>+ Add</button>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className="pref-card" id="pref-alerts">
            <div className="pref-head">
              <h2>How should we <span className="ital">reach you</span>?</h2>
              <span className="pref-num">08 / 08</span>
            </div>
            <p className="lead">Control the volume. We'd rather send you 5 perfect matches than 50 mediocre ones.</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Email digest frequency</label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                <OptCard icon="⚡" title="Real-time" sub="Each match" />
                <OptCard icon="☀" title="Daily" sub="Top 5 picks" active />
                <OptCard icon="📅" title="Weekly" sub="Sunday digest" />
                <OptCard icon="✕" title="Off" sub="App only" />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Only notify me about matches above</label>
              <MatchScoreRange />
            </div>

            <div className="toggle-row" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 18 }}>
              <div><strong>Recruiter direct messages</strong><small>Allow vetted recruiters to message you</small></div>
              <Toggle initial />
            </div>
            <div className="toggle-row">
              <div><strong>Interview reminders</strong><small>1 hour before scheduled interviews</small></div>
              <Toggle initial />
            </div>
            <div className="toggle-row">
              <div><strong>Weekly profile insights</strong><small>How often your profile is viewed</small></div>
              <Toggle initial />
            </div>
            <div className="toggle-row">
              <div><strong>Salary trend alerts</strong><small>When market rates for your role shift</small></div>
              <Toggle />
            </div>
          </div>

          <div className="save-bar">
            <div className="save-bar-info">
              <div className="ic">✓</div>
              <div>
                <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 15 }}>3 unsaved changes</strong>
                <span style={{ display: 'block', fontSize: 12 }}>Your job feed will update within 60 seconds of saving.</span>
              </div>
            </div>
            <div className="save-bar-actions">
              <button className="btn btn-ghost">Discard</button>
              <button className="btn btn-coral" onClick={() => alert('Preferences saved (demo).')}>Save preferences →</button>
            </div>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 18, textAlign: 'center' }}>
            Tip: tweak your favorites in <Link to="/favorites" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>Favorites</Link> too.
          </p>
        </div>
      </div>
    </section>
  );
}
