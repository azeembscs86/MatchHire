/**
 * PostJob page (/dashboard/company/post-job)
 *
 * Form-driven wrapper around `employersApi.jobs.create`. Field set
 * mirrors `Backend/src/validators/employer.validator.js → jobCreate`
 * one-to-one — any drift here is a Joi failure on submit, so we
 * keep the names + enum values aligned.
 *
 * Approval flow note: the backend stores the row with the default
 * `admin_status` so super_admin moderation (via /admin/jobs/:id/status)
 * still governs whether the posting reaches public feeds. This form
 * doesn't expose `admin_status` itself — it surfaces "Pending approval"
 * as a hint on the success screen instead.
 *
 * Validation is intentionally lightweight on the client (the server
 * is the source of truth). We block obvious local mistakes that
 * would round-trip to the API for no reason: empty title/description,
 * salary_max < salary_min, deadline in the past, no skills selected.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employersApi, skillsApi } from '../api/index.js';

const JOB_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'freelance', label: 'Freelance' },
];

const WORK_MODES = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
];

const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'INR', 'AED'];

const SALARY_PERIODS = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'day', label: 'Daily' },
  { value: 'hour', label: 'Hourly' },
];

function fieldLabelStyle() {
  return {
    fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
    color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8,
  };
}

function inputStyle() {
  return {
    width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
    borderRadius: 10, fontSize: 14, background: 'var(--paper)', color: 'var(--ink)',
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PostJob() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Form state — names mirror the backend Joi schema 1:1.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responsibilities, setResponsibilities] = useState('');
  const [requirements, setRequirements] = useState('');
  const [benefits, setBenefits] = useState('');
  const [jobType, setJobType] = useState('full_time');
  const [workMode, setWorkMode] = useState('onsite');
  const [experienceLevel, setExperienceLevel] = useState('mid');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('PKR');
  const [salaryPeriod, setSalaryPeriod] = useState('month');
  const [applicationDeadline, setApplicationDeadline] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState([]);

  // Lightweight skills suggester — reuses the same catalogue search
  // that the Jobs page uses for its filter chip. The debounce
  // keeps the dropdown responsive without hammering the API.
  const [skillSuggestions, setSkillSuggestions] = useState([]);
  useEffect(() => {
    const q = skillInput.trim();
    if (q.length < 1) { setSkillSuggestions([]); return undefined; }
    const handle = setTimeout(async () => {
      try {
        const res = await skillsApi.search(q, 6);
        const list = res?.records || res?.rows || [];
        const taken = new Set(skills.map((s) => s.toLowerCase()));
        setSkillSuggestions(list.filter((s) => !taken.has(String(s.name || '').toLowerCase())).slice(0, 6));
      } catch { setSkillSuggestions([]); }
    }, 200);
    return () => clearTimeout(handle);
  }, [skillInput, skills]);

  function addSkill(name) {
    const next = (name || '').trim();
    if (!next) return;
    if (skills.some((s) => s.toLowerCase() === next.toLowerCase())) return;
    setSkills((prev) => [...prev, next]);
    setSkillInput('');
    setSkillSuggestions([]);
  }

  function removeSkill(name) {
    setSkills((prev) => prev.filter((s) => s !== name));
  }

  const validationError = useMemo(() => {
    if (!title.trim()) return 'Job title is required.';
    if (title.trim().length < 2) return 'Job title must be at least 2 characters.';
    if (!description.trim()) return 'Job description is required.';
    if (description.trim().length < 10) return 'Job description must be at least 10 characters.';
    if (skills.length === 0) return 'Add at least one required skill.';
    const min = Number(salaryMin || 0);
    const max = Number(salaryMax || 0);
    if (salaryMin && salaryMax && max < min) return 'Salary max must be greater than or equal to salary min.';
    if (applicationDeadline) {
      const deadline = new Date(applicationDeadline);
      if (Number.isFinite(deadline.getTime()) && deadline.getTime() < Date.now()) {
        return 'Application deadline must be a future date.';
      }
    }
    return null;
  }, [title, description, skills, salaryMin, salaryMax, applicationDeadline]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        responsibilities: responsibilities.trim() || null,
        requirements: requirements.trim() || null,
        benefits: benefits.trim() || null,
        job_type: jobType,
        experience_level: experienceLevel,
        location: location.trim() || null,
        country: country.trim() || null,
        work_mode: workMode,
        is_remote: workMode === 'remote',
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        salary_currency: salaryCurrency,
        salary_period: salaryPeriod,
        skills_tags: skills,
        application_deadline: applicationDeadline
          ? new Date(applicationDeadline).toISOString()
          : null,
        status: 'open',
      };
      const created = await employersApi.jobs.create(payload);
      setSuccess({ id: created?.id, title: payload.title });
    } catch (err) {
      setError(err?.message || 'Could not post the job. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="dash-content" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <div className="dash-panel" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <h2 style={{ marginBottom: 6 }}>Job submitted for approval</h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            <strong>{success.title}</strong> has been queued for super-admin review.
            It will appear on Jobs / Home / Search feeds once it's approved.
            You can track its status in My Job Postings.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/dashboard/company/jobs" className="btn btn-coral">Go to My Jobs →</Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSuccess(null);
                setTitle('');
                setDescription('');
                setResponsibilities('');
                setRequirements('');
                setBenefits('');
                setLocation('');
                setSalaryMin('');
                setSalaryMax('');
                setApplicationDeadline('');
                setSkills([]);
              }}
            >Post another job</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-content" style={{ maxWidth: 920, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div className="dash-topbar">
        <div>
          <h1>Post a <span className="ital">new role</span>.</h1>
          <p>Submissions are reviewed by a super-admin before they go live on public feeds.</p>
        </div>
        <Link to="/dashboard/company" className="btn btn-ghost">← Back to dashboard</Link>
      </div>

      <form onSubmit={handleSubmit} className="dash-panel" style={{ padding: 28, marginTop: 16 }}>
        {/* Title + description */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Job title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Frontend Engineer"
            style={inputStyle()}
            maxLength={200}
            required
            data-testid="job-title"
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Job description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this role do, and who is it for?"
            rows={5}
            style={{ ...inputStyle(), resize: 'vertical', minHeight: 120 }}
            maxLength={20000}
            required
            data-testid="job-description"
          />
        </div>

        {/* Job type · work mode · experience */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={fieldLabelStyle()}>Job type</label>
            <select value={jobType} onChange={(e) => setJobType(e.target.value)} style={inputStyle()}>
              {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle()}>Work mode</label>
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} style={inputStyle()}>
              {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={fieldLabelStyle()}>Experience level</label>
            <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} style={inputStyle()}>
              {EXPERIENCE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={fieldLabelStyle()}>Location (city)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Karachi, Lahore, Remote…"
              style={inputStyle()}
              maxLength={190}
            />
          </div>
          <div>
            <label style={fieldLabelStyle()}>Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={inputStyle()}
              maxLength={80}
            />
          </div>
        </div>

        {/* Salary */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Salary range</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <input
              type="number"
              min={0}
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="Min"
              style={inputStyle()}
              data-testid="salary-min"
            />
            <input
              type="number"
              min={0}
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="Max"
              style={inputStyle()}
              data-testid="salary-max"
            />
            <select value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)} style={inputStyle()}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={salaryPeriod} onChange={(e) => setSalaryPeriod(e.target.value)} style={inputStyle()}>
              {SALARY_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Skills */}
        <div style={{ marginBottom: 18, position: 'relative' }}>
          <label style={fieldLabelStyle()}>Required skills * ({skills.length})</label>
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {skills.map((s) => (
                <span key={s} className="job-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSkill(s)}
                    aria-label={`Remove ${s}`}
                    style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addSkill(skillInput);
              }
            }}
            placeholder="Type a skill and press Enter (e.g. React)"
            style={inputStyle()}
            data-testid="skill-input"
          />
          {skillSuggestions.length > 0 && (
            <ul
              role="listbox"
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                marginTop: 4, padding: 6, listStyle: 'none',
                background: 'var(--paper)', border: '1px solid var(--line)',
                borderRadius: 10, boxShadow: '0 18px 40px -22px rgba(14,17,22,.30)',
                zIndex: 20, maxHeight: 220, overflowY: 'auto',
              }}
            >
              {skillSuggestions.map((s) => (
                <li key={s.id || s.name}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addSkill(s.name)}
                    style={{
                      width: '100%', textAlign: 'left', background: 'transparent', border: 0,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13.5,
                    }}
                  >{s.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Long-form text */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Responsibilities</label>
          <textarea
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            placeholder="What will the candidate own day-to-day?"
            rows={3}
            style={{ ...inputStyle(), resize: 'vertical', minHeight: 80 }}
            maxLength={10000}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Requirements</label>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Education, certifications, must-have experience"
            rows={3}
            style={{ ...inputStyle(), resize: 'vertical', minHeight: 80 }}
            maxLength={10000}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Benefits</label>
          <textarea
            value={benefits}
            onChange={(e) => setBenefits(e.target.value)}
            placeholder="Health, equity, learning budget, etc."
            rows={3}
            style={{ ...inputStyle(), resize: 'vertical', minHeight: 80 }}
            maxLength={10000}
          />
        </div>

        {/* Deadline */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabelStyle()}>Application deadline</label>
          <input
            type="date"
            value={applicationDeadline}
            onChange={(e) => setApplicationDeadline(e.target.value)}
            min={todayIso()}
            style={inputStyle()}
            data-testid="application-deadline"
          />
        </div>

        {error && (
          <div role="alert" style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 12,
            background: '#fde9e3', color: '#b3361b', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {validationError && !error && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {validationError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Link to="/dashboard/company" className="btn btn-ghost">Cancel</Link>
          <button
            type="submit"
            className="btn btn-coral"
            disabled={submitting || !!validationError}
            data-testid="post-job-submit"
          >
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </form>
    </div>
  );
}
