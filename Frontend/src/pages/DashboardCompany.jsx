/**
 * DashboardCompany page — "Company Hub".
 *
 * Employer-side workspace: active job postings, applicants awaiting
 * review, and a hiring funnel (Applied → Reviewed → … → Hired) with
 * conversion percentages and cost-per-hire footer.
 */
export default function DashboardCompany() {
  return (
    <section className="view active" id="view-dash-company" style={{ background: 'var(--bone)' }}>
      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div className="dash-side-head">
            <div className="dash-side-role">Employer · Growth plan</div>
            <div className="dash-side-name">
              <div className="dash-side-avatar lg-2">L</div>
              Linear Inc.
            </div>
          </div>
          <ul className="dash-nav">
            <li><a className="active"><span className="ic">●</span> Dashboard</a></li>
            <li><a><span className="ic">▤</span> Job Postings <span className="badge">12</span></a></li>
            <li><a><span className="ic">◉</span> Applicants <span className="badge">847</span></a></li>
            <li><a><span className="ic">★</span> Shortlists <span className="badge">43</span></a></li>
            <li><a><span className="ic">☎</span> Interviews <span className="badge">28</span></a></li>
            <li><a><span className="ic">⌕</span> Talent Search</a></li>
            <li><a><span className="ic">◧</span> Company Profile</a></li>
            <div className="dash-nav-section">Insights</div>
            <li><a><span className="ic">▲</span> Analytics</a></li>
            <li><a><span className="ic">⎙</span> Reports</a></li>
            <div className="dash-nav-section">Account</div>
            <li><a><span className="ic">⚙</span> Team & Billing</a></li>
            <li><a><span className="ic">⤓</span> Sign out</a></li>
          </ul>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div>
              <h1>Hiring at <span className="ital">Linear</span>.</h1>
              <p>43 candidates need review · 28 interviews scheduled this week</p>
            </div>
            <div className="dash-topbar-actions">
              <button className="btn btn-ghost">Invite teammates</button>
              <button className="btn btn-coral">+ Post new job</button>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Active jobs<div className="stat-icon">▤</div></div>
              <div className="stat-value">12</div>
              <div className="stat-trend">2 closing this week</div>
            </div>
            <div className="stat-card dark">
              <div className="stat-label" style={{ color: 'rgba(245,240,230,.6)' }}>Total applicants<div className="stat-icon">◉</div></div>
              <div className="stat-value">847</div>
              <div className="stat-trend">↑ 124 this week</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In review<div className="stat-icon">⌕</div></div>
              <div className="stat-value">43</div>
              <div className="stat-trend down">8 over 7-day SLA</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Hired this month<div className="stat-icon">✓</div></div>
              <div className="stat-value">5</div>
              <div className="stat-trend">↑ 2 vs last month</div>
            </div>
          </div>

          <div className="dash-panel" style={{ marginBottom: 24 }}>
            <div className="dash-panel-head">
              <h3>Active job postings</h3>
              <a href="#">Manage all →</a>
            </div>
            <table className="dash-table">
              <thead>
                <tr><th>Position</th><th>Applicants</th><th>Views</th><th>Posted</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>Staff Frontend Engineer</strong><small>Remote · Worldwide · $180–230K</small></div></div></td>
                  <td><strong style={{ fontFamily: "'Fraunces',serif" }}>142</strong></td>
                  <td>3,891</td>
                  <td>9 days ago</td>
                  <td><span className="pill pill-active">Active</span></td>
                  <td><div className="row-actions"><button className="icon-btn">⌃</button><button className="icon-btn">✎</button><button className="icon-btn danger">×</button></div></td>
                </tr>
                <tr>
                  <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>Senior Backend Engineer · Go</strong><small>SF · Hybrid · $200–250K</small></div></div></td>
                  <td><strong style={{ fontFamily: "'Fraunces',serif" }}>98</strong></td>
                  <td>2,401</td>
                  <td>14 days ago</td>
                  <td><span className="pill pill-active">Active</span></td>
                  <td><div className="row-actions"><button className="icon-btn">⌃</button><button className="icon-btn">✎</button><button className="icon-btn danger">×</button></div></td>
                </tr>
                <tr>
                  <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>Product Designer · Senior</strong><small>Remote · $170–210K</small></div></div></td>
                  <td><strong style={{ fontFamily: "'Fraunces',serif" }}>211</strong></td>
                  <td>5,108</td>
                  <td>21 days ago</td>
                  <td><span className="pill pill-active">Active</span></td>
                  <td><div className="row-actions"><button className="icon-btn">⌃</button><button className="icon-btn">✎</button><button className="icon-btn danger">×</button></div></td>
                </tr>
                <tr>
                  <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>Engineering Manager · Platform</strong><small>SF · Onsite · $230–290K</small></div></div></td>
                  <td><strong style={{ fontFamily: "'Fraunces',serif" }}>52</strong></td>
                  <td>1,287</td>
                  <td>5 days ago</td>
                  <td><span className="pill pill-paused">Paused</span></td>
                  <td><div className="row-actions"><button className="icon-btn success">▶</button><button className="icon-btn">✎</button><button className="icon-btn danger">×</button></div></td>
                </tr>
                <tr>
                  <td><div className="table-co"><div className="mini-logo lg-1">L</div><div><strong>DevOps Engineer · Mid</strong><small>Remote · $150–185K</small></div></div></td>
                  <td><strong style={{ fontFamily: "'Fraunces',serif" }}>76</strong></td>
                  <td>1,902</td>
                  <td>28 days ago</td>
                  <td><span className="pill pill-active">Active</span></td>
                  <td><div className="row-actions"><button className="icon-btn">⌃</button><button className="icon-btn">✎</button><button className="icon-btn danger">×</button></div></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="dash-row split">
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Recent applicants <small>· awaiting review</small></h3>
                <a href="#">View all 43 →</a>
              </div>
              <table className="dash-table">
                <thead>
                  <tr><th>Candidate</th><th>Applied for</th><th>Match</th><th></th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-1">MR</div><div><strong>Maya Rodriguez</strong><small>Brooklyn · 9 yrs</small></div></div></td>
                    <td><small>Staff Frontend</small></td>
                    <td><span className="pill pill-offer">96%</span></td>
                    <td><div className="row-actions"><button className="icon-btn success">✓</button><button className="icon-btn danger">×</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-2">DP</div><div><strong>Daniel Park</strong><small>Berlin · 7 yrs</small></div></div></td>
                    <td><small>Backend Eng · Go</small></td>
                    <td><span className="pill pill-offer">94%</span></td>
                    <td><div className="row-actions"><button className="icon-btn success">✓</button><button className="icon-btn danger">×</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-3">AP</div><div><strong>Aisha Patel</strong><small>London · 11 yrs</small></div></div></td>
                    <td><small>Product Designer</small></td>
                    <td><span className="pill pill-offer">92%</span></td>
                    <td><div className="row-actions"><button className="icon-btn success">✓</button><button className="icon-btn danger">×</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-4">HW</div><div><strong>Hannah Wei</strong><small>Singapore · 8 yrs</small></div></div></td>
                    <td><small>Eng Manager</small></td>
                    <td><span className="pill pill-interview">87%</span></td>
                    <td><div className="row-actions"><button className="icon-btn success">✓</button><button className="icon-btn danger">×</button></div></td>
                  </tr>
                  <tr>
                    <td><div className="table-co"><div className="cand-tiny lg-5">RJ</div><div><strong>Ravi Joshi</strong><small>Remote · 10 yrs</small></div></div></td>
                    <td><small>Eng Manager</small></td>
                    <td><span className="pill pill-interview">85%</span></td>
                    <td><div className="row-actions"><button className="icon-btn success">✓</button><button className="icon-btn danger">×</button></div></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <h3>Hiring funnel <small>· last 30d</small></h3>
              </div>
              <div className="funnel">
                <div className="funnel-row">
                  <span>Applied</span>
                  <div className="funnel-bar"><div className="funnel-fill" style={{ width: '100%' }}>847</div></div>
                  <strong>100%</strong>
                </div>
                <div className="funnel-row">
                  <span>Reviewed</span>
                  <div className="funnel-bar"><div className="funnel-fill" style={{ width: '62%' }}>523</div></div>
                  <strong>62%</strong>
                </div>
                <div className="funnel-row">
                  <span>Shortlisted</span>
                  <div className="funnel-bar"><div className="funnel-fill gold" style={{ width: '32%' }}>274</div></div>
                  <strong>32%</strong>
                </div>
                <div className="funnel-row">
                  <span>Interviewed</span>
                  <div className="funnel-bar"><div className="funnel-fill coral" style={{ width: '14%' }}>118</div></div>
                  <strong>14%</strong>
                </div>
                <div className="funnel-row">
                  <span>Offered</span>
                  <div className="funnel-bar"><div className="funnel-fill sage" style={{ width: '5%' }}>42</div></div>
                  <strong>5%</strong>
                </div>
                <div className="funnel-row">
                  <span>Hired</span>
                  <div className="funnel-bar"><div className="funnel-fill sage" style={{ width: '3%' }}>23</div></div>
                  <strong>2.7%</strong>
                </div>
              </div>
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line-soft)', fontSize: 12, color: 'var(--muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Avg time-to-hire</span><strong style={{ color: 'var(--ink)', fontFamily: "'Fraunces',serif" }}>18 days</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cost per hire</span><strong style={{ color: 'var(--ink)', fontFamily: "'Fraunces',serif" }}>$2,140</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
