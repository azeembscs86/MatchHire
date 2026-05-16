/**
 * EmployerOnboarding page.
 *
 * Step 1 of the employer setup wizard (company details). Submitting
 * is a stub; in production this would post to the API and advance
 * the wizard to step 2 (domain verification).
 */
export default function EmployerOnboarding() {
  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Continuing to verification (demo).');
  };

  return (
    <section className="view active" id="view-onboard">
      <div className="onboard-hero">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Post a job · For employers</span>
          <h1 className="display">Hire <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>extraordinary</span> people.</h1>
          <p style={{ color: 'var(--muted)', fontSize: 17, maxWidth: 520, margin: '14px auto 0' }}>First, let's verify your company. This takes about 3 minutes — then you can post your first role.</p>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>
        <div className="onboard-steps">
          <div className="onboard-step active"><span className="step-num">1</span><span>Company details</span></div>
          <div className="step-line"></div>
          <div className="onboard-step"><span className="step-num">2</span><span>Verify domain</span></div>
          <div className="step-line"></div>
          <div className="onboard-step"><span className="step-num">3</span><span>Post first job</span></div>
        </div>

        <form className="onboard-form" onSubmit={handleSubmit}>
          <h2>Tell us about your company</h2>
          <p>This information will appear on your public company page.</p>

          <div className="form-row">
            <div className="form-field"><label>Company name</label><input placeholder="Acme Inc." /></div>
            <div className="form-field"><label>Company website</label><input placeholder="acme.com" /></div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Industry</label>
              <select>
                <option>Software / SaaS</option>
                <option>Fintech</option>
                <option>Healthcare</option>
                <option>E-commerce</option>
                <option>AI / ML</option>
              </select>
            </div>
            <div className="form-field">
              <label>Company size</label>
              <select>
                <option>1–10 employees</option>
                <option>11–50</option>
                <option>51–200</option>
                <option>201–1000</option>
                <option>1000+</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Headquarters</label><input placeholder="San Francisco, CA" /></div>
            <div className="form-field"><label>Year founded</label><input placeholder="2019" /></div>
          </div>
          <div className="form-row single">
            <div className="form-field">
              <label>About the company · 2-3 sentences</label>
              <textarea placeholder="What you do, who it's for, and what makes the team worth joining." />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Hiring contact name</label><input placeholder="Jane Doe" /></div>
            <div className="form-field"><label>Hiring contact email</label><input placeholder="jane@acme.com" /></div>
          </div>

          <div className="onboard-actions">
            <button type="button" className="btn btn-ghost">Save draft</button>
            <button type="submit" className="btn btn-coral">Continue to verification →</button>
          </div>
        </form>
      </div>
    </section>
  );
}
