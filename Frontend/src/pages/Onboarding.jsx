/**
 * Candidate Onboarding Wizard — `/onboarding`
 *
 * Seven-step guided first-run experience. Designed so a freshly
 * registered candidate can land here, fill in just enough to get
 * matched, and exit to the dashboard — without ever needing to
 * understand the full `/profile` editor.
 *
 * Steps (zero-indexed; matches backend `onboarding_step`):
 *
 *   0  Basic Information      full_name · phone · headline · current title · location · country
 *   1  Resume Upload          ResumeUploadCard (drag/drop · parse · review · confirm)
 *   2  Skills & Expertise     SkillsPicker (multi-select w/ autocomplete · 3..30)
 *   3  Work Experience        WorkExperienceCard (multi-row CRUD · MonthYearPicker)
 *   4  Education              Free-text block (2000 chars · auto-filled by resume parse)
 *   5  Job Preferences        desired titles · scope · salary range · job types
 *   6  Review & Complete      Read-only summary, "Complete profile" CTA
 *
 * Per-step data persists through the EXISTING endpoints
 * (/profile/update, /skills, /experiences/*, /preferences,
 * /resume/*). The wizard itself only tracks WHICH STEP via
 * `POST /candidates/onboarding/advance` so closing the tab and
 * coming back resumes exactly where the user left off.
 *
 * UX features required by the spec:
 *   - Save draft           → "Save & exit" (saves current step + back to dashboard)
 *   - Next / Back          → arrow buttons + per-step validation gating Next
 *   - Skip optional steps  → skip button on steps 1, 4, 5 (resume / education / prefs)
 *   - Continue later       → identical to Save & exit
 *   - Edit completed steps → sidebar nav is clickable on already-visited steps
 *   - Completion %         → progress bar at top + chip per section
 *
 * The page deliberately reuses the existing field components rather
 * than reimplementing them, so any future improvement to (e.g.)
 * SkillsPicker shows up in the wizard for free.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { candidatesApi, skillsApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import ProfileImageUpload from '../components/ProfileImageUpload.jsx';
import SkillsPicker from '../components/SkillsPicker.jsx';
import WorkExperienceCard from '../components/WorkExperienceCard.jsx';
import ResumeUploadCard from '../components/ResumeUploadCard.jsx';

/* ---------- Step catalogue ---------- */

const STEPS = [
  { idx: 0, key: 'basic',       label: 'Basic Information',  required: true,  hint: 'Tell recruiters who you are.' },
  { idx: 1, key: 'resume',      label: 'Resume Upload',      required: false, hint: 'We auto-fill your profile from the parsed file.' },
  { idx: 2, key: 'skills',      label: 'Skills & Expertise', required: true,  hint: 'Pick from the catalogue or add your own — minimum 3.' },
  { idx: 3, key: 'experience',  label: 'Work Experience',    required: false, hint: 'Add at least one role to lift your match score.' },
  { idx: 4, key: 'education',   label: 'Education',          required: false, hint: 'A short line per degree works fine.' },
  { idx: 5, key: 'preferences', label: 'Job Preferences',    required: false, hint: 'Tell us what you are hunting for.' },
  { idx: 6, key: 'review',      label: 'Review & Complete',  required: false, hint: 'Confirm and publish your profile.' },
];

const FINAL_STEP = 6;

/* ---------- Validators (mirror backend Joi rules) ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{6,30}$/;

function validateBasic(form) {
  const errors = {};
  if (!form.full_name || form.full_name.trim().length < 2) errors.full_name = 'Full name is required (min 2 chars).';
  if (form.phone && !PHONE_RE.test(form.phone.trim())) errors.phone = 'Phone format looks off — digits, dashes, parentheses, optional + prefix.';
  if (form.headline && form.headline.length > 190) errors.headline = 'Keep your headline under 190 characters.';
  if (form.current_title && form.current_title.length > 150) errors.current_title = 'Title must be 150 characters or less.';
  return errors;
}

/* ---------- UI bits ---------- */

function StepIcon({ done, active }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: done ? 'var(--coral, #E85D3C)' : active ? 'var(--ink, #1A1A1A)' : 'var(--bone-2, #EFE8DA)',
        color: done || active ? '#fff' : 'var(--muted, #6B6258)',
        fontSize: 13, fontWeight: 600,
      }}
    >
      {done ? '✓' : '●'}
    </span>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ height: 8, width: '100%', background: '#ede7da', borderRadius: 100, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, background: 'var(--coral, #E85D3C)', transition: 'width .5s' }} />
    </div>
  );
}

function Field({ label, htmlFor, error, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted, #6B6258)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: 'var(--muted, #6B6258)', marginTop: 4 }}>{hint}</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--coral-deep, #C73E1D)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid var(--line, #E2D9C7)',
  borderRadius: 10,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fff',
};

/* ---------- Page ---------- */

export default function Onboarding() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();

  // Server-side wizard state.
  const [step, setStep] = useState(0);
  const [completedAt, setCompletedAt] = useState(null);
  const [completion, setCompletion] = useState(null);

  // Loaded profile + child collections.
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [preferences, setPreferences] = useState(null);

  // Local form draft for the Basic Info step (the others use their own components' draft state).
  const [basic, setBasic] = useState({
    full_name: '', phone: '', headline: '', current_title: '', location: '', country: '',
  });
  const [education, setEducation] = useState('');
  const [prefDraft, setPrefDraft] = useState({
    desired_titles_csv: '', salary_min: '', salary_max: '', salary_currency: 'USD',
    job_scope: 'hybrid', job_types: ['full_time'],
  });

  // UI state.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedToast, setSavedToast] = useState(null);
  const [errors, setErrors] = useState({});

  /** Single hydrate on mount — read state + profile + skills + experiences + preferences. */
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      setLoadError(null);
      try {
        const [state, prof, skillList, expList] = await Promise.all([
          candidatesApi.onboarding.state(),
          candidatesApi.profile(),
          candidatesApi.experience.list().catch(() => ({ experiences: [] })),
          // Skills are already inside `prof.skills`, but we also pull the
          // raw list so SkillsPicker can render proficiency + years per chip.
          candidatesApi.profile().then((d) => d?.skills || []),
        ]);
        if (cancelled) return;
        setStep(Number(state?.current_step || 0));
        setCompletedAt(state?.completed_at || null);
        setCompletion(state?.completion || null);

        const p = prof?.profile || {};
        setProfile(p);
        setBasic({
          full_name: p.full_name || user?.full_name || '',
          phone: p.phone || '',
          headline: p.headline || '',
          current_title: p.current_title || '',
          location: p.location || '',
          country: p.country || '',
        });
        setEducation(p.education || '');
        setSkills(
          (prof?.skills || []).map((s) => ({
            id: s.id,
            name: s.name,
            category: s.category || null,
            proficiency: s.proficiency || 'intermediate',
            years_experience: Number(s.years_experience) || 0,
          }))
        );
        setExperiences(expList?.experiences || []);
        const pref = prof?.preferences || {};
        setPreferences(pref);
        setPrefDraft({
          desired_titles_csv: Array.isArray(pref?.desired_titles)
            ? pref.desired_titles.join(', ')
            : String(pref?.desired_titles || ''),
          salary_min: pref?.salary_min ?? '',
          salary_max: pref?.salary_max ?? '',
          salary_currency: pref?.salary_currency || 'USD',
          job_scope: pref?.job_scope || 'hybrid',
          job_types: pref?.preferred_job_types
            ? String(pref.preferred_job_types).split(',').map((x) => x.trim()).filter(Boolean)
            : ['full_time'],
        });
      } catch (err) {
        if (!cancelled) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** Push a single toast for 4 seconds. */
  function flashToast(text, ok = true) {
    setSavedToast({ text, ok });
    setTimeout(() => setSavedToast(null), 4000);
  }

  /** Re-fetch the completion breakdown after any save — keeps the bar honest. */
  function refreshCompletion() {
    candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
  }

  /**
   * Persist the current step's data + advance the cursor.
   * `intent` is 'next' | 'back' | 'skip' | 'save_exit' | 'complete'.
   */
  async function persistStepAndMove(intent) {
    setSaveError(null);
    setSaving(true);
    try {
      // 1. Save the data for the CURRENT step (if relevant + valid).
      if (intent !== 'back') {
        await saveCurrentStepData();
      }

      // 2. Decide the next step index.
      const nextStep = intent === 'back'
        ? Math.max(0, step - 1)
        : intent === 'complete'
          ? FINAL_STEP
          : Math.min(FINAL_STEP, step + 1);

      // 3. Advance the wizard server-side (also marks complete on final step).
      const data = await candidatesApi.onboarding.advance(nextStep, intent === 'complete');
      setStep(data?.current_step ?? nextStep);
      setCompletedAt(data?.completed_at || null);
      if (data?.completion) setCompletion(data.completion);
      else refreshCompletion();

      // 4. Side effects.
      if (intent === 'save_exit') {
        flashToast('Progress saved — pick up here anytime.');
        setTimeout(() => navigate('/dashboard/candidate'), 500);
      } else if (intent === 'complete') {
        // Reflect the published state in the global auth user, then bounce.
        refreshMe().catch(() => {});
        flashToast('Profile complete! Redirecting to your dashboard…');
        setTimeout(() => navigate('/dashboard/candidate'), 1100);
      } else {
        flashToast(intent === 'skip' ? 'Skipped — you can come back to this step.' : 'Saved.');
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  /** Map current step to its save mechanism. */
  async function saveCurrentStepData() {
    switch (step) {
      case 0: {
        const errs = validateBasic(basic);
        if (Object.keys(errs).length) { setErrors(errs); throw new Error('Fix the highlighted fields.'); }
        setErrors({});
        await candidatesApi.updateProfile({
          full_name: basic.full_name.trim(),
          phone: basic.phone.trim() || null,
          headline: basic.headline.trim() || null,
          current_title: basic.current_title.trim() || null,
          location: basic.location.trim() || null,
          country: basic.country.trim() || null,
        });
        return;
      }
      case 1:
        // Resume step uploads inside its own component; nothing extra to save here.
        return;
      case 2: {
        // SkillsPicker stores its selection locally; persist on Next.
        if (skills.length > 0) {
          const payload = skills.map((s) => (
            s.id
              ? { skill_id: s.id, proficiency: s.proficiency, years_experience: s.years_experience }
              : { name: s.name, proficiency: s.proficiency, years_experience: s.years_experience }
          ));
          // Server enforces min 3 / max 30 for mode=set. We allow fewer than 3 on save (the
          // user might leave the step intending to add more later); server returns 422 in
          // that case which surfaces as a polite inline error. Same payload either way.
          await skillsApi.save({ mode: 'set', skills: payload });
        }
        return;
      }
      case 3:
        // WorkExperienceCard saves each entry directly through its own props on edit/add.
        // No bulk save needed here.
        return;
      case 4:
        await candidatesApi.updateProfile({ education: education.trim() || null });
        return;
      case 5: {
        const desired_titles = prefDraft.desired_titles_csv
          .split(',').map((s) => s.trim()).filter(Boolean);
        const payload = {
          desired_titles,
          preferred_job_types: prefDraft.job_types.length ? prefDraft.job_types : ['full_time'],
          job_scope: prefDraft.job_scope,
          salary_min: prefDraft.salary_min ? Number(prefDraft.salary_min) : null,
          salary_max: prefDraft.salary_max ? Number(prefDraft.salary_max) : null,
          salary_currency: prefDraft.salary_currency,
        };
        await candidatesApi.updatePreferences(payload);
        return;
      }
      default:
        return;
    }
  }

  /** Jump to a specific step (only for steps ≤ current). */
  function jumpTo(idx) {
    if (idx > step) return; // Can't skip ahead without filling in
    candidatesApi.onboarding.advance(idx).then((data) => {
      setStep(data?.current_step ?? idx);
      if (data?.completion) setCompletion(data.completion);
    }).catch(() => {});
  }

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '48px 16px' }}>
          <LoadingState label="Loading your onboarding…" />
        </div>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '48px 16px' }}>
          <ErrorState error={loadError} onRetry={() => window.location.reload()} />
        </div>
      </section>
    );
  }

  const completionScore = completion?.score ?? 0;

  return (
    <section className="view active">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 14 }}>
            ★ Onboarding · step {step + 1} of {STEPS.length}
          </span>
          <h1 className="display" style={{ marginBottom: 12 }}>
            Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} — let's <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>build your profile</span>.
          </h1>
          <p style={{ maxWidth: 620 }}>
            Seven short steps. Skip anything that doesn't apply. Save and come back whenever you like.
          </p>

          <div style={{ marginTop: 20, maxWidth: 720 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: 'var(--muted, #6B6258)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Profile completion
              </span>
              <strong style={{ color: 'var(--coral, #E85D3C)', fontFamily: "'Fraunces',serif", fontSize: 22 }}>
                {completionScore}%
              </strong>
            </div>
            <ProgressBar value={completionScore} />
          </div>
        </div>
      </div>

      <div className="container" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 32, padding: '32px 16px 96px', maxWidth: 1120 }}>
        {/* SIDEBAR — step nav */}
        <aside style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEPS.map((s) => {
              const done = s.idx < step || (s.idx === FINAL_STEP && completedAt);
              const active = s.idx === step;
              const clickable = s.idx <= step;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => clickable && jumpTo(s.idx)}
                    disabled={!clickable}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '10px 12px', borderRadius: 10, border: 0,
                      background: active ? 'var(--bone, #F5F0E6)' : 'transparent',
                      color: active ? 'var(--ink, #1A1A1A)' : 'var(--ink-soft, #1A1F26)',
                      cursor: clickable ? 'pointer' : 'not-allowed',
                      opacity: clickable ? 1 : 0.55,
                      textAlign: 'left', fontFamily: 'inherit', fontSize: 14,
                      transition: 'background .15s',
                    }}
                  >
                    <StepIcon done={done} active={active} />
                    <span>
                      <div style={{ fontWeight: active ? 600 : 500 }}>{s.label}</div>
                      {!s.required && <small style={{ fontSize: 11, color: 'var(--muted, #6B6258)' }}>optional</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Link
            to="/dashboard/candidate"
            style={{ display: 'inline-block', marginTop: 20, fontSize: 12, color: 'var(--muted, #6B6258)' }}
          >
            ← Skip to dashboard
          </Link>
        </aside>

        {/* MAIN PANEL */}
        <main>
          <div style={{ background: 'var(--paper, #fff)', border: '1px solid var(--line, #E2D9C7)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <header style={{ marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, marginBottom: 4 }}>
                {STEPS[step].label}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--muted, #6B6258)', margin: 0 }}>{STEPS[step].hint}</p>
            </header>

            {/* STEP CONTENT */}
            {step === 0 && (
              <>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
                  <ProfileImageUpload
                    imageUrl={user?.avatar_url || profile?.avatar_url || null}
                    fullName={basic.full_name}
                    onChange={() => { refreshMe().catch(() => {}); refreshCompletion(); }}
                    size={96}
                  />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <Field label="Full name *" htmlFor="ob-full-name" error={errors.full_name}>
                      <input id="ob-full-name" style={inputStyle} value={basic.full_name}
                        onChange={(e) => setBasic({ ...basic, full_name: e.target.value })}
                        placeholder="Jane Doe" maxLength={150} />
                    </Field>
                    <Field label="Email" htmlFor="ob-email" hint="Read-only — captured at signup.">
                      <input id="ob-email" style={{ ...inputStyle, background: 'var(--bone-2, #EFE8DA)' }}
                        value={user?.email || ''} readOnly />
                    </Field>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  <Field label="Phone" htmlFor="ob-phone" error={errors.phone} hint="Optional. Digits, dashes, parentheses, +.">
                    <input id="ob-phone" style={inputStyle} value={basic.phone}
                      onChange={(e) => setBasic({ ...basic, phone: e.target.value })}
                      placeholder="+92 300 1234567" maxLength={30} />
                  </Field>
                  <Field label="Headline" htmlFor="ob-headline" error={errors.headline} hint="One line about your role.">
                    <input id="ob-headline" style={inputStyle} value={basic.headline}
                      onChange={(e) => setBasic({ ...basic, headline: e.target.value })}
                      placeholder="Senior Full-Stack Engineer" maxLength={190} />
                  </Field>
                  <Field label="Current job title" htmlFor="ob-title" error={errors.current_title}>
                    <input id="ob-title" style={inputStyle} value={basic.current_title}
                      onChange={(e) => setBasic({ ...basic, current_title: e.target.value })}
                      placeholder="Senior Software Engineer" maxLength={150} />
                  </Field>
                  <Field label="Location (city)" htmlFor="ob-loc">
                    <input id="ob-loc" style={inputStyle} value={basic.location}
                      onChange={(e) => setBasic({ ...basic, location: e.target.value })}
                      placeholder="Karachi" maxLength={190} />
                  </Field>
                  <Field label="Country" htmlFor="ob-country">
                    <input id="ob-country" style={inputStyle} value={basic.country}
                      onChange={(e) => setBasic({ ...basic, country: e.target.value })}
                      placeholder="Pakistan" maxLength={80} />
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <ResumeUploadCard onProfileUpdated={() => { refreshMe().catch(() => {}); refreshCompletion(); }} />
            )}

            {step === 2 && (
              <>
                <SkillsPicker value={skills} onChange={setSkills} minSkills={3} maxSkills={30} />
                <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted, #6B6258)' }}>
                  We use these to score every job you see. Aim for 5–10 to start.
                </p>
              </>
            )}

            {step === 3 && (
              <WorkExperienceCard
                experiences={experiences}
                onChange={setExperiences}
                onAfterWrite={refreshCompletion}
              />
            )}

            {step === 4 && (
              <Field
                label="Education — one entry per line"
                htmlFor="ob-edu"
                hint="Format is up to you. Example: BS Computer Science · LUMS · 2018"
              >
                <textarea
                  id="ob-edu"
                  style={{ ...inputStyle, minHeight: 140, fontFamily: 'inherit' }}
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  maxLength={2000}
                  placeholder={'BS Computer Science · LUMS · 2018\nMSc Software Engineering · Imperial College London · 2021'}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted, #6B6258)' }}>
                  {education.length} / 2000 characters
                </div>
              </Field>
            )}

            {step === 5 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                <Field
                  label="Desired job titles"
                  htmlFor="ob-roles"
                  hint="Comma-separated. We surface jobs matching any of these."
                >
                  <input
                    id="ob-roles"
                    style={inputStyle}
                    value={prefDraft.desired_titles_csv}
                    onChange={(e) => setPrefDraft({ ...prefDraft, desired_titles_csv: e.target.value })}
                    placeholder="Senior Full-Stack Engineer, Staff Engineer, Tech Lead"
                  />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <Field label="Min salary" htmlFor="ob-smin">
                    <input id="ob-smin" type="number" min="0" style={inputStyle}
                      value={prefDraft.salary_min}
                      onChange={(e) => setPrefDraft({ ...prefDraft, salary_min: e.target.value })}
                      placeholder="80000" />
                  </Field>
                  <Field label="Target salary" htmlFor="ob-smax">
                    <input id="ob-smax" type="number" min="0" style={inputStyle}
                      value={prefDraft.salary_max}
                      onChange={(e) => setPrefDraft({ ...prefDraft, salary_max: e.target.value })}
                      placeholder="150000" />
                  </Field>
                  <Field label="Currency" htmlFor="ob-currency">
                    <select id="ob-currency" style={inputStyle}
                      value={prefDraft.salary_currency}
                      onChange={(e) => setPrefDraft({ ...prefDraft, salary_currency: e.target.value })}>
                      {['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Work scope" htmlFor="ob-scope">
                  <select id="ob-scope" style={inputStyle}
                    value={prefDraft.job_scope}
                    onChange={(e) => setPrefDraft({ ...prefDraft, job_scope: e.target.value })}>
                    <option value="hybrid">Hybrid — anywhere reasonable</option>
                    <option value="global_remote">Global remote only</option>
                    <option value="country">My country only</option>
                    <option value="local">My city only</option>
                  </select>
                </Field>

                <Field label="Job types you're open to">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['full_time', 'contract', 'part_time', 'freelance', 'internship'].map((t) => {
                      const on = prefDraft.job_types.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setPrefDraft({
                            ...prefDraft,
                            job_types: on
                              ? prefDraft.job_types.filter((x) => x !== t)
                              : [...prefDraft.job_types, t],
                          })}
                          style={{
                            padding: '6px 12px', borderRadius: 100, fontSize: 13, cursor: 'pointer',
                            background: on ? 'var(--ink, #1A1A1A)' : '#fff',
                            color: on ? 'var(--bone, #F5F0E6)' : 'var(--ink, #1A1A1A)',
                            border: '1px solid ' + (on ? 'var(--ink, #1A1A1A)' : 'var(--line, #E2D9C7)'),
                          }}
                        >
                          {t.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {step === 6 && (
              <ReviewPanel
                basic={basic}
                skills={skills}
                experiences={experiences}
                education={education}
                prefDraft={prefDraft}
                completion={completion}
              />
            )}
          </div>

          {/* Error + toast banners */}
          {saveError && (
            <div role="alert" style={{ marginBottom: 12, background: '#fde9e3', color: 'var(--coral-deep, #C73E1D)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
              {saveError.message || 'Something went wrong saving this step.'}
            </div>
          )}
          {savedToast && (
            <div role="status" style={{ marginBottom: 12, background: savedToast.ok ? '#e6f4ea' : '#fde9e3', color: savedToast.ok ? '#0f5132' : 'var(--coral-deep, #C73E1D)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
              {savedToast.text}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => persistStepAndMove('back')} disabled={saving}>
                  ← Back
                </button>
              )}
              {!STEPS[step].required && step < FINAL_STEP && (
                <button type="button" className="btn btn-ghost" onClick={() => persistStepAndMove('skip')} disabled={saving} style={{ color: 'var(--muted, #6B6258)' }}>
                  Skip this step
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => persistStepAndMove('save_exit')} disabled={saving}>
                Save & exit
              </button>
              {step < FINAL_STEP && (
                <button type="button" className="btn btn-coral" onClick={() => persistStepAndMove('next')} disabled={saving}>
                  {saving ? 'Saving…' : 'Save & next →'}
                </button>
              )}
              {step === FINAL_STEP && (
                <button type="button" className="btn btn-coral" onClick={() => persistStepAndMove('complete')} disabled={saving}>
                  {saving ? 'Finalising…' : 'Complete profile ✓'}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}

/* ---------- Review panel (step 6) ---------- */

function ReviewPanel({ basic, skills, experiences, education, prefDraft, completion }) {
  const desiredTitles = useMemo(
    () => prefDraft.desired_titles_csv.split(',').map((s) => s.trim()).filter(Boolean),
    [prefDraft.desired_titles_csv]
  );
  const missing = (completion?.sections || []).filter((s) => !s.complete);
  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--muted, #6B6258)', marginTop: 0 }}>
        Here is what we'll publish. You can edit any section later from <Link to="/profile" style={{ color: 'var(--coral, #E85D3C)' }}>your profile page</Link>.
      </p>

      {missing.length > 0 && (
        <div style={{ background: '#fff7e6', border: '1px solid #e8b574', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <strong style={{ color: '#7a4a14' }}>{missing.length} section{missing.length === 1 ? '' : 's'} still incomplete</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {missing.slice(0, 4).map((s) => (
              <li key={s.key} style={{ color: '#7a4a14' }}>{s.label} — {s.hint}</li>
            ))}
          </ul>
        </div>
      )}

      <ReviewRow label="Name"               value={basic.full_name || <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>} />
      <ReviewRow label="Headline"           value={basic.headline || <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>} />
      <ReviewRow label="Current title"      value={basic.current_title || <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>} />
      <ReviewRow label="Location"           value={[basic.location, basic.country].filter(Boolean).join(', ') || <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>} />
      <ReviewRow label="Phone"              value={basic.phone || <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>} />

      <ReviewRow
        label={`Skills (${skills.length})`}
        value={skills.length > 0
          ? skills.slice(0, 8).map((s) => s.name).join(', ') + (skills.length > 8 ? ` + ${skills.length - 8} more` : '')
          : <em style={{ color: 'var(--muted, #6B6258)' }}>none yet</em>}
      />

      <ReviewRow
        label={`Experience (${experiences.length})`}
        value={experiences.length > 0
          ? experiences.slice(0, 3).map((e) => `${e.title} @ ${e.company}`).join(' · ')
          : <em style={{ color: 'var(--muted, #6B6258)' }}>none yet</em>}
      />

      <ReviewRow
        label="Education"
        value={education
          ? education.split('\n').slice(0, 3).join(' · ')
          : <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>}
      />

      <ReviewRow
        label="Desired titles"
        value={desiredTitles.length > 0 ? desiredTitles.join(', ') : <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>}
      />
      <ReviewRow
        label="Salary"
        value={(prefDraft.salary_min || prefDraft.salary_max)
          ? `${prefDraft.salary_min || '?'} – ${prefDraft.salary_max || '?'} ${prefDraft.salary_currency}`
          : <em style={{ color: 'var(--muted, #6B6258)' }}>not set</em>}
      />
      <ReviewRow label="Work scope" value={prefDraft.job_scope.replace('_', ' ')} />
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', padding: '8px 0', borderTop: '1px solid var(--line-soft, #EDE5D3)', fontSize: 14 }}>
      <span style={{ color: 'var(--muted, #6B6258)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
