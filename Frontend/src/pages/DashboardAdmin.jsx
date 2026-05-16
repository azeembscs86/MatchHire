/**
 * DashboardAdmin page — "Admin Console".
 *
 * Platform-operator surface: aggregate metrics (users, companies,
 * MRR), pending verifications queue, system-health panel, recent
 * users table, and a flagged-content timeline.
 */
export default function DashboardAdmin() {
  return (
    <section className="view active" id="view-dash-admin" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Platform admin · Owner</div>
            <div className="dash-side-name">
              <div className="dash-side-avatar lg-7" style={{ background: 'var(--coral)', color: '#fff' }}>◉</div>
              Console
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Overview</a></li>
            <li><a><span className="ic">✓</span> Verifications <span className="badge">17</span></a></li>
            <li><a><span className="ic">⚑</span> Reports & Flags <span className="badge">8</span></a></li>
            <div className="dash-nav-section">Manage</div>
            <li><a><span className="ic">◉</span> Users · 240K</a></li>
            <li><a><span className="ic">◆</span> Companies · 12.4K</a></li>
            <li><a><span className="ic">▤</span> Job Listings · 48K</a></li>
            <li><a><span className="ic">★</span> Featured Content</a></li>
            <div className="dash-nav-section">System</div>
            <li><a><span className="ic">▲</span> Analytics</a></li>
            <li><a><span className="ic">$</span> Billing & Revenue</a></li>
            <li><a><span className="ic">⎙</span> Logs & Audit</a></li>
            <li><a><span className="ic">⚙</span> Settings</a></li>
            <li><a><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Admin <span className="ital">console</span>.</h1>
              <p>17 companies awaiting verification · 8 user reports flagged · all systems normal</p>
            </div>
            <div className="dash-topbar-actions">
              <button className="btn btn-ghost">Audit log</button>
              <button className="btn btn-coral">Run system check</button>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Total users<div className="stat-icon">◉</div></div>
              <div className="stat-value">240,891</div>
              <div className="stat-trend">↑ 4,221 this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active companies<div className="stat-icon">◆</div></div>
              <div className="stat-value">12,402</div>
              <div className="stat-trend">↑ 87 this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Live job listings<div className="stat-icon">▤</div></div>
              <div className="stat-value">48,209</div>
              <div className="stat-trend">↑ 3,247 this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">MRR · USD<div className="stat-icon">$</div></div>
              <div className="stat-value">$1.84M</div>
              <div className="stat-trend">↑ 12.4% MoM</div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Pending verifications <small>· 17 awaiting review</small></h3>
                <a href="#">View queue →</a>
              </div>
              <div className="verify-list">
                <div className="verify-card">
                  <div className="co-logo lg-3">A</div>
                  <div className="verify-info">
                    <strong>Atlas Robotics Inc.</strong>
                    <small>atlasrobotics.io · Hardware · 24 employees · Submitted 2h ago</small>
                  </div>
                  <div className="verify-actions">
                    <button className="v-reject">Reject</button>
                    <button className="v-approve">✓ Approve</button>
                  </div>
                </div>
                <div className="verify-card">
                  <div className="co-logo lg-4">N</div>
                  <div className="verify-info">
                    <strong>Northwind Studios</strong>
                    <small>northwind.studio · Game Dev · 12 employees · Submitted 6h ago</small>
                  </div>
                  <div className="verify-actions">
                    <button className="v-reject">Reject</button>
                    <button className="v-approve">✓ Approve</button>
                  </div>
                </div>
                <div className="verify-card">
                  <div className="co-logo lg-5">P</div>
                  <div className="verify-info">
                    <strong>Pulse Diagnostics</strong>
                    <small>pulsedx.com · Healthtech · 78 employees · Submitted 1d ago</small>
                  </div>
                  <div className="verify-actions">
                    <button className="v-reject">Reject</button>
                    <button className="v-approve">✓ Approve</button>
                  </div>
                </div>
                <div className="verify-card">
                  <div className="co-logo lg-6">M</div>
                  <div className="verify-info">
                    <strong>Meridian Capital</strong>
                    <small>meridiancap.com · Fintech · 312 employees · Submitted 1d ago</small>
                  </div>
                  <div className="verify-actions">
                    <button className="v-reject">Reject</button>
                    <button className="v-approve">✓ Approve</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>System health</h3>
                <span style={{ fontSize: 11, letterSpacing: '.05em', color: 'var(--sage)', fontWeight: 600 }}>● ALL SYSTEMS NORMAL</span>
              </div>
              <div className="health-row"><span>API uptime · 30d</span><strong>99.98%</strong></div>
              <div className="health-row"><span>Avg response time</span><strong>184ms</strong></div>
              <div className="health-row"><span>Database</span><span className="health-status">Operational</span></div>
              <div className="health-row"><span>Search index</span><span className="health-status">Operational</span></div>
              <div className="health-row"><span>Email delivery</span><span className="health-status warn">Degraded · 92%</span></div>
              <div className="health-row"><span>Payment gateway</span><span className="health-status">Operational</span></div>
              <div className="health-row"><span>Storage · 84% used</span><strong style={{ color: 'var(--gold)' }}>8.4 / 10 TB</strong></div>
              <div className="health-row"><span>Background jobs</span><strong>2,401 / hr</strong></div>
              <div style={{ marginTop: 18, padding: 14, background: 'var(--bone)', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--ink)', fontFamily: "'Fraunces',serif", display: 'block', marginBottom: 4 }}>Last incident</strong>
                Resolved May 4 · Email delivery delays from SendGrid endpoint, ~14 min impact
              </div>
            </div>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent users <small>· last 24h</small></h3>
                <a href="#">Manage all →</a>
              </div>
              <table className="dash-table">
                <thead>
                  <tr><th>User</th><th>Role</th><th>Joined</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-1">SK</div><div><strong>Sara Khan</strong><small>sara.k@gmail.com</small></div></div></td>
                    <td><small>Candidate</small></td>
                    <td>2h ago</td>
                    <td><span className="pill pill-verified">Verified</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-2">M</div><div><strong>Acme Corp</strong><small>hr@acme.io</small></div></div></td>
                    <td><small>Employer</small></td>
                    <td>4h ago</td>
                    <td><span className="pill pill-pending">Pending</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-3">JD</div><div><strong>James Doe</strong><small>j.doe@outlook.com</small></div></div></td>
                    <td><small>Candidate</small></td>
                    <td>6h ago</td>
                    <td><span className="pill pill-verified">Verified</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-7">RX</div><div><strong>spammy_user_42</strong><small>x@temp.io</small></div></div></td>
                    <td><small>Candidate</small></td>
                    <td>9h ago</td>
                    <td><span className="pill pill-flagged">Flagged</span></td>
                    <td><div className="row-actions"><button className="icon-btn danger">×</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-4">EM</div><div><strong>Elena Martin</strong><small>elena@studio.com</small></div></div></td>
                    <td><small>Candidate</small></td>
                    <td>11h ago</td>
                    <td><span className="pill pill-verified">Verified</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-5">QQ</div><div><strong>Quill &amp; Quire</strong><small>jobs@quillco.com</small></div></div></td>
                    <td><small>Employer</small></td>
                    <td>14h ago</td>
                    <td><span className="pill pill-pending">Pending</span></td>
                    <td><div className="row-actions"><button className="icon-btn">→</button></div></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Flagged content <small>· 8 new</small></h3>
                <a href="#" style={{ color: 'var(--coral)' }}>Review →</a>
              </div>
              <div className="timeline">
                <div className="tl-item">
                  <div className="tl-dot coral">⚑</div>
                  <div className="tl-content">
                    <strong>Spam job posting reported</strong>
                    <span><em>Crypto Recruiters LLC</em> · 4 user reports · 1h ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot coral">⚑</div>
                  <div className="tl-content">
                    <strong>Fake company suspected</strong>
                    <span>Domain mismatch · Auto-flagged · 3h ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot gold">⚠</div>
                  <div className="tl-content">
                    <strong>User account locked</strong>
                    <span>5 failed logins · spammy_user_42 · 4h ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot gold">!</div>
                  <div className="tl-content">
                    <strong>Salary range below threshold</strong>
                    <span>Job under min wage rules · 6h ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot sage">✓</div>
                  <div className="tl-content">
                    <strong>Auto-resolved 3 spam reports</strong>
                    <span>Pattern matched known spam ring · 8h ago</span>
                  </div>
                </div>
                <div className="tl-item">
                  <div className="tl-dot">⎙</div>
                  <div className="tl-content">
                    <strong>GDPR data export request</strong>
                    <span>User: anna@example.com · 1d ago</span>
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
