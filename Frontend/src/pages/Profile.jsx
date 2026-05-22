/**
 * Profile page.
 *
 * Reads + writes the authenticated candidate's profile through:
 *
 *   - `/candidates/profile`              (read full read-model)
 *   - `/candidates/profile/update`       (write form fields)
 *   - `/candidates/profile/publish-state`(toggle is_public ⇒ Draft vs Publish)
 *   - `/candidates/profile-completion`   (per-section completion bar)
 *   - `/candidates/profile-image`        (avatar via ProfileImageUpload)
 *   - `/candidates/skills*`              (SkillsPicker)
 *   - `/candidates/experiences*`         (WorkExperienceCard)
 *
 * The form has five numbered cards matching the design mockup:
 *
 *   01  Personal information     — name, headline, email, phone, location, relocation_scope
 *   02  About you                — summary (60–2000 chars, live counter)
 *   03  Skills & expertise       — SkillsPicker (saves separately)
 *   04  Work experience          — WorkExperienceCard (multi-row CRUD)
 *   05  What you're looking for  — desired_role, salary range, currency,
 *                                  work_preference, availability + 2 save buttons
 *
 * Links (LinkedIn / Portfolio / GitHub) move into an inline "social
 * links" row inside Personal Information to keep the card count to
 * the five from the mockup. Country sits beside Location.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import ResumeUploadCard from '../components/ResumeUploadCard.jsx';
import SkillsPicker from '../components/SkillsPicker.jsx';
import ProfileImageUpload from '../components/ProfileImageUpload.jsx';
import ProfileCompletionCard from '../components/ProfileCompletionCard.jsx';
import WorkExperienceCard from '../components/WorkExperienceCard.jsx';
import { candidatesApi, skillsApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const AVAILABILITY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'two_weeks', label: 'Two weeks notice' },
  { value: 'one_month', label: 'Within 30 days' },
  { value: 'negotiable', label: '2 months notice' },
  { value: 'not_looking', label: 'Just exploring' },
];

const RELOCATION_OPTIONS = [
  { value: 'anywhere', label: 'Yes — anywhere' },
  { value: 'region', label: 'Yes — within region' },
  { value: 'remote_only', label: 'Remote only' },
];

const WORK_PREFERENCE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
];

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED'];

const BIO_MIN = 60;
const BIO_MAX = 2000;

/** Empty form scaffold — single source of truth for "reset" state. */
const BLANK_FORM = {
  full_name: '',
  headline: '',
  phone: '',
  current_title: '',
  desired_role: '',
  summary: '',
  location: '',
  country: '',
  relocation_scope: '',
  work_preference: '',
  expected_salary_min: '',
  expected_salary_max: '',
  salary_currency: 'USD',
  availability: 'negotiable',
  linkedin_url: '',
  portfolio_url: '',
  github_url: '',
  // Free-text education block (one entry per line). Persisted to
  // candidate_profiles.education (TEXT). Auto-filled by the resume
  // parser on confirm; manually editable here.
  education: '',
};

export default function Profile() {
  const { user, refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  /*
   * Baseline snapshot — captured once after the initial /profile
   * load. Subsequent saves diff the current form against this
   * baseline and ONLY send the keys the candidate actually
   * changed. Combined with the backend safe-merge filter
   * (candidate.service.updateProfile > isMeaningfulValue), this
   * means saving "About you" can never blow away an unrelated
   * field like linkedin_url. The baseline is refreshed after
   * every successful save so subsequent edits diff cleanly.
   */
  const [baseline, setBaseline] = useState(null);

  // Skills: list of { id, name, category, proficiency, years_experience }.
  // `null` id means "custom — backend will ensure-or-create on save".
  const [skills, setSkills] = useState([]);
  const [skillsSavedAt, setSkillsSavedAt] = useState(null);
  const [skillsSaveError, setSkillsSaveError] = useState(null);
  const [savingSkills, setSavingSkills] = useState(false);

  // Work experiences: normalised rows from the new endpoint.
  const [experiences, setExperiences] = useState([]);

  const [imageUrl, setImageUrl] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [isPublic, setIsPublic] = useState(true);
  const [form, setForm] = useState(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, expData] = await Promise.all([
          candidatesApi.profile(),
          candidatesApi.experience.list().catch(() => ({ experiences: [] })),
        ]);
        if (cancelled) return;
        const p = data?.profile || {};
        setProfile(p);
        setIsPublic(p.is_public == null ? true : !!p.is_public);
        setSkills((data?.skills || []).map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category || null,
          proficiency: s.proficiency || 'intermediate',
          years_experience: Number(s.years_experience) || 0,
        })));
        setExperiences(expData?.experiences || []);
        // Avatar lives on users.avatar_url (kept in sync server-side
        // by every image upload/delete).
        setImageUrl(p.avatar_url || data?.user?.avatar_url || user?.avatar_url || null);
        // Completion bar is a separate fetch so it doesn't block first paint.
        candidatesApi.profileCompletion().then((c) => !cancelled && setCompletion(c)).catch(() => {});
        // Derive relocation_scope from the legacy boolean when the new
        // column isn't populated yet — keeps existing accounts looking
        // correct on first load.
        const fallbackScope = p.relocation_scope || (p.open_to_remote ? 'anywhere' : '');
        setForm({
          full_name: p.full_name || user?.full_name || '',
          headline: p.headline || '',
          phone: p.phone || user?.phone || '',
          current_title: p.current_title || '',
          desired_role: p.desired_role || '',
          summary: p.summary || '',
          location: p.location || '',
          country: p.country || '',
          relocation_scope: fallbackScope,
          work_preference: p.work_preference || '',
          expected_salary_min: p.expected_salary_min ?? '',
          expected_salary_max: p.expected_salary_max ?? '',
          salary_currency: p.salary_currency || 'USD',
          availability: p.availability || 'negotiable',
          linkedin_url: p.linkedin_url || '',
          portfolio_url: p.portfolio_url || '',
          github_url: p.github_url || '',
          education: p.education || '',
        });
        // Snapshot what we just loaded so the diff-on-save logic
        // has a "what existed before the user opened this page"
        // reference. Kept INSIDE the try so we never baseline an
        // error state.
        if (!cancelled) {
          setBaseline({
            full_name: p.full_name || user?.full_name || '',
            phone: p.phone || user?.phone || '',
            headline: p.headline || '',
            current_title: p.current_title || '',
            desired_role: p.desired_role || '',
            summary: p.summary || '',
            location: p.location || '',
            country: p.country || '',
            relocation_scope: fallbackScope,
            work_preference: p.work_preference || '',
            expected_salary_min: p.expected_salary_min ?? '',
            expected_salary_max: p.expected_salary_max ?? '',
            salary_currency: p.salary_currency || 'USD',
            availability: p.availability || 'negotiable',
            linkedin_url: p.linkedin_url || '',
            portfolio_url: p.portfolio_url || '',
            github_url: p.github_url || '',
            education: p.education || '',
          });
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  /** Live bio counter — used for both the hint and the disabled state. */
  const bioLen = form.summary?.trim()?.length || 0;
  const bioState = useMemo(() => {
    if (bioLen === 0) return { tone: 'muted', msg: `Aim for ${BIO_MIN}–${BIO_MAX} characters.` };
    if (bioLen < BIO_MIN) return { tone: 'warn', msg: `${BIO_MIN - bioLen} more characters to reach the minimum.` };
    if (bioLen > BIO_MAX) return { tone: 'error', msg: `${bioLen - BIO_MAX} characters over the limit.` };
    return { tone: 'ok', msg: 'Looks good.' };
  }, [bioLen]);

  /** Persist skills — catalogue picks carry `id`, custom entries carry `name`. */
  async function handleSaveSkills() {
    if (savingSkills) return;
    setSavingSkills(true);
    setSkillsSaveError(null);
    setSkillsSavedAt(null);
    try {
      const payload = skills.map((s) => (
        s.id
          ? { skill_id: s.id, proficiency: s.proficiency, years_experience: s.years_experience }
          : { name: s.name, proficiency: s.proficiency, years_experience: s.years_experience }
      ));
      const data = await skillsApi.save({ mode: 'set', skills: payload });
      setSkills((data?.skills || []).map((s) => ({
        id: s.id, name: s.name, category: s.category || null,
        proficiency: s.proficiency || 'intermediate',
        years_experience: Number(s.years_experience) || 0,
      })));
      setSkillsSavedAt(new Date());
      candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
    } catch (err) {
      setSkillsSaveError(err);
    } finally {
      setSavingSkills(false);
    }
  }

  /**
   * Shared write path for both Save Draft and Save & Publish. The
   * difference is just the value of `is_public` we send to the
   * publish-state endpoint after the main update succeeds.
   */
  async function persist({ publish }) {
    if (submitting) return;

    // Pre-validate against the same bounds the server enforces so
    // the user gets immediate feedback instead of a 422 round-trip.
    if (form.summary && (bioLen < BIO_MIN || bioLen > BIO_MAX)) {
      setError({ message: `Bio must be ${BIO_MIN}–${BIO_MAX} characters.` });
      return;
    }

    setSubmitting(true);
    setError(null);
    setSavedAt(null);
    setDraftSavedAt(null);
    try {
      /*
       * Diff against the baseline snapshot. ONLY changed keys go in
       * the request — so saving "About you" sends just { summary },
       * never blowing away an unrelated field. Backend's safe-merge
       * filter (candidate.service.js > isMeaningfulValue) is the
       * second line of defence.
       *
       * Empty-string after trim is treated as "no value" (matches
       * server behaviour). To support an explicit "Clear" affordance
       * later, send `null` (server still skips null today; flip that
       * if/when an explicit clear endpoint lands).
       */
      const cleanForSubmit = {
        full_name:           form.full_name?.trim() || '',
        phone:               form.phone?.trim() || '',
        headline:            form.headline?.trim() || '',
        current_title:       form.current_title?.trim() || '',
        desired_role:        form.desired_role?.trim() || '',
        summary:             form.summary?.trim() || '',
        location:            form.location?.trim() || '',
        country:             form.country?.trim() || '',
        relocation_scope:    form.relocation_scope || '',
        work_preference:     form.work_preference || '',
        salary_currency:     form.salary_currency || 'USD',
        availability:        form.availability || 'negotiable',
        linkedin_url:        form.linkedin_url?.trim() || '',
        portfolio_url:       form.portfolio_url?.trim() || '',
        github_url:          form.github_url?.trim() || '',
        education:           form.education?.trim() || '',
        expected_salary_min: form.expected_salary_min === '' ? '' : Number(form.expected_salary_min),
        expected_salary_max: form.expected_salary_max === '' ? '' : Number(form.expected_salary_max),
      };

      // Build delta against baseline. If baseline is null (first
      // render before load completed) we fall back to sending the
      // full payload — safer than dropping the user's edit.
      const payload = {};
      if (baseline) {
        for (const k of Object.keys(cleanForSubmit)) {
          const cur = cleanForSubmit[k];
          const old = baseline[k];
          // Only include when the value genuinely differs. Skip
          // empty-string fields outright — server treats them as
          // no-op anyway, and omitting keeps the wire payload tight.
          if (String(cur) === String(old)) continue;
          if (cur === '' || cur === null || cur === undefined) continue;
          payload[k] = cur;
        }
      } else {
        // No baseline yet — send only the non-empty fields. Server
        // safe-merge will still protect against the rest.
        for (const [k, v] of Object.entries(cleanForSubmit)) {
          if (v !== '' && v !== null && v !== undefined) payload[k] = v;
        }
      }

      // Nothing changed? Skip the network call entirely (matches
      // spec rule: "If user does not change bio, do not send update
      // request.").
      if (Object.keys(payload).length === 0) {
        // Still honour the publish-state toggle even if no field
        // changed — the user may be flipping draft ↔ publish.
        await candidatesApi.setPublishState(publish);
        setIsPublic(publish);
        await refreshMe();
        if (publish) setSavedAt(new Date()); else setDraftSavedAt(new Date());
        return;
      }

      await candidatesApi.updateProfile(payload);
      // Refresh the baseline so subsequent edits diff against the
      // just-saved state.
      setBaseline({ ...baseline, ...cleanForSubmit });
      await candidatesApi.setPublishState(publish);
      setIsPublic(publish);

      await refreshMe();
      candidatesApi.profileCompletion().then(setCompletion).catch(() => {});

      if (publish) setSavedAt(new Date());
      else setDraftSavedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="view active" id="view-profile">
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your profile…" />
        </div>
      </section>
    );
  }

  if (error && !profile) {
    return (
      <section className="view active" id="view-profile">
        <div className="container" style={{ padding: '48px 0' }}>
          <ErrorState error={error} onRetry={() => window.location.reload()} />
        </div>
      </section>
    );
  }

  return (
    <section className="view active" id="view-profile">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ My profile</span>
          <h1 className="display">
            Build your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>professional</span> story.
          </h1>
          <p>The more complete your profile, the better matches you'll get. Aim for 100%.</p>
        </div>
      </div>

      <div className="container profile-layout">
        {/* ---------- Sidebar ---------- */}
        <aside className="profile-side">
          <ProfileImageUpload
            imageUrl={imageUrl}
            fullName={form.full_name}
            onChange={(nextUrl) => {
              setImageUrl(nextUrl);
              candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
              refreshMe().catch(() => {});
            }}
          />
          <div className="profile-name" style={{ marginTop: 14 }}>{form.full_name || 'Your name'}</div>
          <div className="profile-headline">{form.headline || form.current_title || 'Add a headline'}</div>

          {/* Draft/published indicator pill — matches the design system pill spec. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 100,
                fontWeight: 500,
                background: isPublic ? 'var(--sage-soft)' : 'var(--bone-2)',
                color: isPublic ? 'var(--sage)' : 'var(--muted)',
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isPublic ? 'var(--sage)' : 'var(--muted-2)',
              }} />
              {isPublic ? 'Published' : 'Draft'}
            </span>
          </div>

          <Link
            to="/profile/review"
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center', textAlign: 'center', textDecoration: 'none', marginTop: 14 }}
          >
            Preview public profile
          </Link>

          <div style={{ marginTop: 16 }}>
            <ProfileCompletionCard completion={completion} compact />
          </div>
        </aside>

        {/* ---------- Main form ---------- */}
        <form className="profile-main" onSubmit={(e) => { e.preventDefault(); persist({ publish: true }); }}>
          {error && (
            <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              {error.message || 'Could not save profile.'}
            </div>
          )}
          {savedAt && (
            <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              Profile published at {savedAt.toLocaleTimeString()}.
            </div>
          )}
          {draftSavedAt && (
            <div role="status" style={{ background: '#fff4d6', color: '#7a5a14', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              Draft saved at {draftSavedAt.toLocaleTimeString()}. Recruiters won't see your profile until you publish.
            </div>
          )}

          <ResumeUploadCard onProfileUpdated={refreshMe} />

          {/* -------- 01 Personal information -------- */}
          <div className="form-card">
            <div className="form-card-head">
              <h3>Personal information</h3>
              <span className="step">01 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Full name</label>
                <input value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} placeholder="Jane Doe" maxLength={150} />
              </div>
              <div className="form-field">
                <label>Professional headline</label>
                <input value={form.headline} onChange={(e) => update({ headline: e.target.value })} placeholder="Senior Frontend Engineer" maxLength={190} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Email address</label><input value={user?.email || ''} readOnly /></div>
              <div className="form-field">
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  placeholder="+92 300 1234567"
                  maxLength={30}
                  inputMode="tel"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Location</label>
                <input value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="City" maxLength={190} />
              </div>
              <div className="form-field">
                <label>Country</label>
                <input value={form.country} onChange={(e) => update({ country: e.target.value })} placeholder="Pakistan" maxLength={80} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Open to relocate</label>
                <select value={form.relocation_scope} onChange={(e) => update({ relocation_scope: e.target.value })}>
                  <option value="">Select an option…</option>
                  {RELOCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Current title</label>
                <input value={form.current_title} onChange={(e) => update({ current_title: e.target.value })} placeholder="Senior Frontend Engineer" maxLength={150} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>LinkedIn</label>
                <input value={form.linkedin_url} onChange={(e) => update({ linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/you" maxLength={500} />
              </div>
              <div className="form-field">
                <label>Portfolio</label>
                <input value={form.portfolio_url} onChange={(e) => update({ portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" maxLength={500} />
              </div>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>GitHub</label>
                <input value={form.github_url} onChange={(e) => update({ github_url: e.target.value })} placeholder="https://github.com/you" maxLength={500} />
              </div>
            </div>
          </div>

          {/* -------- 02 About you -------- */}
          <div className="form-card">
            <div className="form-card-head">
              <h3>About you</h3>
              <span className="step">02 / 05</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>Bio · 2-4 sentences about your work</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => update({ summary: e.target.value })}
                  placeholder="Frontend engineer with 7 years building production interfaces for fintech and SaaS. I care about performance, accessibility, and design systems that scale."
                  maxLength={BIO_MAX + 100}
                  style={{ minHeight: 130 }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between', marginTop: 8,
                  fontSize: 12,
                  color:
                    bioState.tone === 'error' ? 'var(--coral-deep)' :
                    bioState.tone === 'warn' ? 'var(--gold)' :
                    bioState.tone === 'ok' ? 'var(--sage)' : 'var(--muted)',
                }}>
                  <span>{bioState.msg}</span>
                  <span className="mono">{bioLen} / {BIO_MAX}</span>
                </div>
              </div>
            </div>
          </div>

          {/* -------- 03 Skills & expertise -------- */}
          <div className="form-card">
            <div className="form-card-head">
              <h3>Skills &amp; expertise</h3>
              <span className="step">03 / 05</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>Skills · these power your matches</label>
                <SkillsPicker
                  value={skills}
                  onChange={setSkills}
                  minSkills={3}
                  maxSkills={30}
                />
                {skillsSaveError && (
                  <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '8px 12px', borderRadius: 8, marginTop: 10, fontSize: 13 }}>
                    {skillsSaveError.message || 'Could not save skills.'}
                  </div>
                )}
                {skillsSavedAt && (
                  <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '8px 12px', borderRadius: 8, marginTop: 10, fontSize: 13 }}>
                    Skills saved at {skillsSavedAt.toLocaleTimeString()}.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <small className="muted" style={{ fontSize: 12 }}>
                    Pick from the catalogue or add custom skills. Saved separately from your profile.
                  </small>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleSaveSkills}
                    disabled={savingSkills || skills.length < 3}
                    style={{ padding: '6px 14px', fontSize: 13 }}
                  >
                    {savingSkills ? 'Saving skills…' : 'Save skills'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* -------- 04 Work experience -------- */}
          <WorkExperienceCard
            experiences={experiences}
            onChange={setExperiences}
            onAfterWrite={() => {
              candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
            }}
          />

          {/* -------- 04b Education -------- */}
          {/*
           * Free-text education block — one entry per line, format is
           * up to the candidate. Auto-filled by the resume parser on
           * the confirm step (parsed `education` JSON is collapsed
           * into newline-separated text). Stored at
           * candidate_profiles.education (TEXT, max 2000 chars).
           * Structured education table is on the Phase-2 roadmap.
           */}
          <div className="form-card">
            <div className="form-card-head">
              <h3>Education</h3>
              <span className="step">04b</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label htmlFor="profile-education">
                  One entry per line — degree · institution · year
                </label>
                <textarea
                  id="profile-education"
                  value={form.education}
                  onChange={(e) => update({ education: e.target.value })}
                  placeholder={'BS Computer Science · LUMS · 2018\nMSc Data Science · Imperial College London · 2021'}
                  maxLength={2000}
                  style={{ minHeight: 100 }}
                />
                <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                  {form.education.length} / 2000 characters · auto-filled from your resume
                </small>
              </div>
            </div>
          </div>

          {/* -------- 05 What you're looking for -------- */}
          <div className="form-card">
            <div className="form-card-head">
              <h3>What you're looking for</h3>
              <span className="step">05 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Desired role</label>
                <input
                  value={form.desired_role}
                  onChange={(e) => update({ desired_role: e.target.value })}
                  placeholder="Staff Frontend / Tech Lead"
                  maxLength={190}
                />
              </div>
              <div className="form-field">
                <label>Work preference</label>
                <select value={form.work_preference} onChange={(e) => update({ work_preference: e.target.value })}>
                  <option value="">Select…</option>
                  {WORK_PREFERENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Salary min (annual)</label>
                <input type="number" min="0" value={form.expected_salary_min} onChange={(e) => update({ expected_salary_min: e.target.value })} placeholder="e.g. 120000" />
              </div>
              <div className="form-field">
                <label>Salary max (annual)</label>
                <input type="number" min="0" value={form.expected_salary_max} onChange={(e) => update({ expected_salary_max: e.target.value })} placeholder="e.g. 180000" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Currency</label>
                <select value={form.salary_currency} onChange={(e) => update({ salary_currency: e.target.value })}>
                  {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Availability</label>
                <select value={form.availability} onChange={(e) => update({ availability: e.target.value })}>
                  {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 12, justifyContent: 'flex-end',
              marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line-soft)',
              flexWrap: 'wrap',
            }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => persist({ publish: false })}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save draft'}
              </button>
              <button type="submit" className="btn btn-coral" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save & publish profile →'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
