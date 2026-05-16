/**
 * Home page.
 *
 * Above-the-fold hero, search bar, and a "Recommended for you" rail
 * showing the first six jobs. Decorative hero cards float on the
 * right (hidden below tablet width via media query in styles.css).
 */
import { Link } from 'react-router-dom';
import { jobs } from '../data/jobs.js';
import JobCard from '../components/JobCard.jsx';

export default function Home() {
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

            <div className="search-bar">
              <div className="search-field">
                <label>What</label>
                <input type="text" placeholder="Senior Frontend Engineer" defaultValue="Senior Frontend Engineer" />
              </div>
              <div className="search-field">
                <label>Where</label>
                <input type="text" placeholder="Remote, anywhere" defaultValue="Remote · Karachi" />
              </div>
              <button className="btn btn-coral">
                <svg className="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                Search
              </button>
            </div>

            <div className="hero-stats">
              <div><span className="num">48,209</span><span className="lbl">Open Roles</span></div>
              <div><span className="num">12,400</span><span className="lbl">Companies</span></div>
              <div><span className="num">96%</span><span className="lbl">Match Rate</span></div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-card hero-card-1">
              <div className="mini-job-head">
                <div className="mini-logo lg-1">L</div>
                <div><div className="mini-meta">Linear · Remote</div></div>
              </div>
              <div className="mini-title">Staff Frontend Engineer</div>
              <div className="mini-tags">
                <span className="mini-tag">React</span>
                <span className="mini-tag">TypeScript</span>
              </div>
              <div className="mini-foot">
                <span className="mini-pay">$180–230K</span>
                <span className="mini-meta" style={{ fontSize: 10 }}>2h ago</span>
              </div>
            </div>

            <div className="hero-card hero-card-2">
              <div className="mini-job-head">
                <div className="mini-logo lg-2">S</div>
                <div><div className="mini-meta">Stripe · Hybrid</div></div>
              </div>
              <div className="mini-title">Senior Backend Architect</div>
              <div className="mini-tags">
                <span className="mini-tag">Node.js</span>
                <span className="mini-tag">AWS</span>
                <span className="mini-tag">Go</span>
              </div>
              <div className="mini-foot">
                <span className="mini-pay">$210–280K</span>
                <span className="mini-meta" style={{ fontSize: 10 }}>1d ago</span>
              </div>
            </div>

            <div className="hero-card hero-card-3">
              <div className="mini-job-head">
                <div className="mini-logo lg-3">F</div>
                <div><div className="mini-meta">Figma · Onsite NYC</div></div>
              </div>
              <div className="mini-title">Product Designer III</div>
              <div className="mini-tags">
                <span className="mini-tag">Figma</span>
                <span className="mini-tag">UX</span>
              </div>
              <div className="mini-foot">
                <span className="mini-pay">$160–195K</span>
                <span className="mini-meta" style={{ fontSize: 10 }}>5h ago</span>
              </div>
            </div>

            <div className="float-badge b1">★ 96% match for you</div>
            <div className="float-badge b2" style={{ background: 'var(--sage)' }}>+ 24 new today</div>
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
          <small style={{ marginLeft: 'auto' }}>Refine in profile →</small>
        </div>
      </div>

      <section className="block">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>★ Recommended for you</span>
              <h2 className="display">Latest jobs <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>matched</span> to your skills.</h2>
            </div>
            <Link to="/jobs" className="section-link">Browse all 48K jobs →</Link>
          </div>
          <div className="jobs-grid" id="recommended-jobs">
            {jobs.slice(0, 6).map((j, i) => (
              <JobCard key={i} job={j} idx={i} featured />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
