import { Link } from 'react-router-dom';

export default function DashboardCandidate() {
  return (
    <section className="view active" id="view-dash-candidate" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Candidate · Pro plan</div>
            <div className="dash-side-name">
              <div className="dash-side-avatar lg-1">AK</div>
              Ayesha K.
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Overview</a></li>
            <li><a><span className="ic">▤</span> My Applications <span className="badge">24</span></a></li>
            <li><Link to="/favorites"><span className="ic">♥</span> Saved Jobs <span className="badge">12</span></Link></li>
            <li><a><span className="ic">★</span> Job Matches <span className="badge">112</span></a></li>
            <li><Link to="/profile"><span className="ic">⚙</span> Edit Profile</Link></li>
            <li><Link to="/preferences"><span className="ic">⚙</span> Job Preferences</Link></li>
            <li><a><span className="ic">◧</span> Resume Library</a></li>
            <li><a><span className="ic">☎</span> Interviews <span className="badge">3</span></a></li>
            <div className="dash-nav-section">Account</div>
            <li><a><span className="ic">⚙</span> Settings</a></li>
            <li><a><span className="ic">⚐</span> Privacy</a></li>
            <li><a><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Welcome back, <span className="ital">Ayesha</span>.</h1>
              <p>You have 3 new matches and 1 interview scheduled this week.</p>
            </div>
            <div className="dash-topbar-actions">
              <button className="btn btn-ghost">Export data</button>
              <Link to="/profile" className="btn btn-coral">Edit profile →</Link>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Profile views<div className="stat-icon">◉</div></div>
              <div className="stat-value">1,247</div>
              <div className="stat-trend">↑ 18% from last week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Applications<div className="stat-icon">▤</div></div>
              <div className="stat-value">24</div>
              <div className="stat-trend">↑ 4 this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Saved jobs<div className="stat-icon">♥</div></div>
              <div className="stat-value">18</div>
              <div className="stat-trend">3 expiring soon</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Interviews<div className="stat-icon">☎</div></div>
              <div className="stat-value">3</div>
              <div className="stat-trend">Next: Linear · Wed</div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent applications <small>· last 30 days</small></h3>
                <a href="#">See all 24 →</a>
              </div>
              <table className="dash-table">
                <thead>
                  <tr><th>Company / Role</th><th>Applied</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>Linear</strong><small>Staff Frontend Engineer</small></div></div></td>
                    <td>2 days ago</td>
                    <td><span className="pill pill-interview">Interview scheduled</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-2">S</div><div><strong>Stripe</strong><small>Senior Frontend Engineer</small></div></div></td>
                    <td>5 days ago</td>
                    <td><span className="pill pill-review">Under review</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-7">V</div><div><strong>Vercel</strong><small>Developer Experience Lead</small></div></div></td>
                    <td>1 week ago</td>
                    <td><span className="pill pill-offer">Offer received</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-3">F</div><div><strong>Figma</strong><small>Senior Engineer · Design Tools</small></div></div></td>
                    <td>1 week ago</td>
                    <td><span className="pill pill-applied">Applied</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-5">N</div><div><strong>Notion</strong><small>Full-Stack Engineer</small></div></div></td>
                    <td>2 weeks ago</td>
                    <td><span className="pill pill-rejected">Not selected</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="mini-logo lg-6">R</div><div><strong>Ramp</strong><small>Frontend Engineer III</small></div></div></td>
                    <td>3 weeks ago</td>
                    <td><span className="pill pill-review">Under review</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Profile health</h3>
                <strong style={{ color: 'var(--coral)', fontFamily: "'Fraunces',serif", fontSize: 18 }}>65%</strong>
              </div>
              <div className="completion-bar"><div className="completion-fill"></div></div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 18px' }}>Complete these to reach 100% and triple your match rate.</p>
              <div className="checklist">
                <div className="check-item done"><div className="check-box">✓</div><span>Add your work experience</span></div>
                <div className="check-item done"><div className="check-box">✓</div><span>Add 8+ skills</span></div>
                <div className="check-item done"><div className="check-box">✓</div><span>Write your bio</span></div>
                <div className="check-item"><div className="check-box"></div><span>Upload portfolio link <small>+15%</small></span></div>
                <div className="check-item"><div className="check-box"></div><span>Add education history <small>+10%</small></span></div>
                <div className="check-item"><div className="check-box"></div><span>Verify with LinkedIn <small>+10%</small></span></div>
              </div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>New matches <small>· based on your skills</small></h3>
                <Link to="/jobs">Browse all →</Link>
              </div>
              <div className="app-list">
                <div className="app-card">
                  <div className="mini-logo lg-7">V</div>
                  <div className="app-card-info">
                    <strong>Senior Frontend Engineer · Vercel</strong>
                    <small>Remote · $170–210K · Posted 2h ago</small>
                  </div>
                  <div className="app-card-meta">
                    <span className="pill pill-active">96% match</span>
                    <div>React · TS · Next</div>
                  </div>
                </div>
                <div className="app-card">
                  <div className="mini-logo lg-8">B</div>
                  <div className="app-card-info">
                    <strong>Frontend Lead · Brex</strong>
                    <small>Remote · $190–240K · Posted 6h ago</small>
                  </div>
                  <div className="app-card-meta">
                    <span className="pill pill-active">94% match</span>
                    <div>React · GraphQL</div>
                  </div>
                </div>
                <div className="app-card">
                  <div className="mini-logo lg-3">F</div>
                  <div className="app-card-info">
                    <strong>Staff Engineer · Figma</strong>
                    <small>NYC · Hybrid · $200–260K · Posted 1d ago</small>
                  </div>
                  <div className="app-card-meta">
                    <span className="pill pill-active">91% match</span>
                    <div>TypeScript · React</div>
                  </div>
                </div>
                <div className="app-card">
                  <div className="mini-logo lg-4">R</div>
                  <div className="app-card-info">
                    <strong>Senior Engineer · Retool</strong>
                    <small>Remote · $160–200K · Posted 1d ago</small>
                  </div>
                  <div className="app-card-meta">
                    <span className="pill pill-active">89% match</span>
                    <div>React · Node</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent activity</h3>
              </div>
              <div className="timeline">
                <div className="tl-item">
                  <div className="tl-dot coral">☎</div>
                  <div className="tl-content">
                    <strong>Linear scheduled an interview</strong>
                    <span>Wednesday, May 14 · 3:00 PM PST</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot sage">✓</div>
                  <div className="tl-content">
                    <strong>Vercel sent you an offer</strong>
                    <span><em>$195K base + equity</em> · 2 days ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot">★</div>
                  <div className="tl-content">
                    <strong>5 new matches found</strong>
                    <span>Based on React, TypeScript skills · 3 days ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot">▤</div>
                  <div className="tl-content">
                    <strong>Applied to Stripe</strong>
                    <span>Senior Frontend Engineer · 5 days ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot gold">◉</div>
                  <div className="tl-content">
                    <strong>Profile viewed by 12 recruiters</strong>
                    <span>Last 7 days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
