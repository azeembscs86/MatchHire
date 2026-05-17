/**
 * EmployerOnboarding page.
 *
 * Single-form employer signup wizard. Behaviour splits by auth state:
 *
 *   - Anonymous visitor   → submitting registers a new user + company
 *                           via `POST /auth/register/employer`. The
 *                           hiring-contact email + name + password become
 *                           the new account credentials, the rest hangs
 *                           off the nested `company` object.
 *   - Existing employer   → the account already exists; submitting
 *                           updates the company profile via
 *                           `POST /employers/company-profile/update`.
 *
 * On success we route the user to the Company dashboard.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { employersApi } from '../api/index.js';

const INDUSTRIES = [
  'Software / SaaS',
  'Fintech',
  'Healthcare',
  'E-commerce',
  'AI / ML',
  'Other',
];

const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

export default function EmployerOnboarding() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: '',
    website: '',
    industry: 'Software / SaaS',
    size: '11-50',
    location: '',
    founded_year: '',
    description: '',
    contact_name: '',
    contact_email: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const isEmployer = user?.role === 'employer';

  // Prefill the company form when an authenticated employer lands here so
  // editing feels like an update rather than a fresh form.
  useEffect(() => {
    if (!isEmployer) return;
    let cancelled = false;
    employersApi.company.get().then((c) => {
      if (cancelled || !c) return;
      setForm((f) => ({
        ...f,
        company_name: c.name || '',
        website: c.website || '',
        industry: c.industry || 'Software / SaaS',
        size: c.size || '11-50',
        location: c.location || '',
        founded_year: c.founded_year ?? '',
        description: c.description || '',
        contact_name: user?.full_name || '',
        contact_email: user?.email || '',
      }));
    }).catch(() => { /* leave defaults */ });
    return () => { cancelled = true; };
  }, [isEmployer, user?.id, user?.email, user?.full_name]);

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      if (isEmployer) {
        await employersApi.company.update({
          name: form.company_name,
          website: form.website || null,
          industry: form.industry,
          size: form.size,
          location: form.location || null,
          founded_year: form.founded_year ? Number(form.founded_year) : undefined,
          description: form.description || null,
        });
        setOk('Company profile updated.');
        setTimeout(() => navigate('/dashboard/company'), 800);
      } else {
        await register('employer', {
          full_name: form.contact_name,
          email: form.contact_email.trim(),
          password: form.password,
          designation: 'Talent',
          company: {
            name: form.company_name,
            website: form.website || null,
            industry: form.industry,
            size: form.size,
            location: form.location || null,
            description: form.description || null,
          },
        });
        setOk('Company created — redirecting to your dashboard.');
        setTimeout(() => navigate('/dashboard/company'), 800);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view active" id="view-onboard">
      <div className="onboard-hero">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Post a job · For employers</span>
          <h1 className="display">Hire <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>extraordinary</span> people.</h1>
          <p style={{ color: 'var(--muted)', fontSize: 17, maxWidth: 520, margin: '14px auto 0' }}>
            {isEmployer
              ? 'Update your company profile. Changes appear instantly on your public company page.'
              : "First, let's set up your company. We'll create your employer account at the same time."}
          </p>
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
          <h2>{isEmployer ? 'Edit your company profile' : 'Tell us about your company'}</h2>
          <p>This information will appear on your public company page.</p>

          {error && (
            <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              <strong>{error.message}</strong>
              {Array.isArray(error.errors) && (
                <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                  {error.errors.map((e, i) => (
                    <li key={i}>{e.field}: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {ok && (
            <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              {ok}
            </div>
          )}

          <div className="form-row">
            <div className="form-field"><label>Company name</label><input required value={form.company_name} onChange={(e) => update({ company_name: e.target.value })} placeholder="Acme Inc." /></div>
            <div className="form-field"><label>Company website</label><input value={form.website} onChange={(e) => update({ website: e.target.value })} placeholder="https://acme.com" /></div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Industry</label>
              <select value={form.industry} onChange={(e) => update({ industry: e.target.value })}>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Company size</label>
              <select value={form.size} onChange={(e) => update({ size: e.target.value })}>
                {SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Headquarters</label><input value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="San Francisco, CA" /></div>
            <div className="form-field"><label>Year founded</label><input type="number" min="1800" max={new Date().getFullYear()} value={form.founded_year} onChange={(e) => update({ founded_year: e.target.value })} placeholder="2019" /></div>
          </div>
          <div className="form-row single">
            <div className="form-field">
              <label>About the company · 2-3 sentences</label>
              <textarea value={form.description} onChange={(e) => update({ description: e.target.value })} placeholder="What you do, who it's for, and what makes the team worth joining." />
            </div>
          </div>
          {!isEmployer && (
            <>
              <div className="form-row">
                <div className="form-field"><label>Hiring contact name</label><input required value={form.contact_name} onChange={(e) => update({ contact_name: e.target.value })} placeholder="Jane Doe" autoComplete="name" /></div>
                <div className="form-field"><label>Hiring contact email</label><input type="email" required value={form.contact_email} onChange={(e) => update({ contact_email: e.target.value })} placeholder="jane@acme.com" autoComplete="email" /></div>
              </div>
              <div className="form-row single">
                <div className="form-field"><label>Choose a password · 8+ characters, letters and numbers</label><input type="password" minLength={8} required value={form.password} onChange={(e) => update({ password: e.target.value })} autoComplete="new-password" /></div>
              </div>
            </>
          )}

          <div className="onboard-actions">
            <button type="button" className="btn btn-ghost" disabled={submitting}>Save draft</button>
            <button type="submit" className="btn btn-coral" disabled={submitting}>
              {submitting ? 'Submitting…' : isEmployer ? 'Update company →' : 'Continue to verification →'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
