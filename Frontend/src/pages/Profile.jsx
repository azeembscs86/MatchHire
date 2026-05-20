/**
 * Profile page.
 *
 * Reads + writes the authenticated candidate's profile through
 * `/candidates/profile` (read) and `/candidates/profile/update`
 * (write).
 *
 * The form keeps the original five-card layout (personal info, about,
 * skills, experience, what-you-are-looking-for). On submit we only
 * send the fields the backend currently understands; experience copy
 * is captured under `summary` so the work-history block stays a
 * single field in v1 (the schema can be lifted into a JSON column
 * later without changing this page).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import ResumeUploadCard from '../components/ResumeUploadCard.jsx';
import SkillsPicker from '../components/SkillsPicker.jsx';
import ProfileImageUpload from '../components/ProfileImageUpload.jsx';
import ProfileCompletionCard from '../components/ProfileCompletionCard.jsx';
import { candidatesApi, skillsApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const AVAILABILITY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'two_weeks', label: 'Two weeks notice' },
  { value: 'one_month', label: 'Within 30 days' },
  { value: 'negotiable', label: 'Negotiable' },
  { value: 'not_looking', label: 'Just exploring' },
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '··';
}

export default function Profile() {
  const { user, refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  // Selection-state for the SkillsPicker: array of
  // { id, name, category?, proficiency?, years_experience?, isCustom? }.
  // null `id` means a custom entry that the backend will ensure-or-create
  // when we save.
  const [skills, setSkills] = useState([]);
  const [skillsSavedAt, setSkillsSavedAt] = useState(null);
  const [skillsSaveError, setSkillsSaveError] = useState(null);
  const [savingSkills, setSavingSkills] = useState(false);
  // Profile-image + completion state (separate from the form so the
  // image/completion can update without going through the form submit).
  const [imageUrl, setImageUrl] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [form, setForm] = useState({
    full_name: '', headline: '', current_title: '', summary: '',
    location: '', country: '', open_to_remote: true,
    expected_salary_min: '', expected_salary_max: '', salary_currency: 'USD',
    availability: 'negotiable', linkedin_url: '', portfolio_url: '', github_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await candidatesApi.profile();
        if (cancelled) return;
        const p = data?.profile || {};
        const u = data?.profile || {};
        setProfile(p);
        // SkillsPicker expects rich entries — pass through everything
        // the backend returned so chips render with category + proficiency
        // metadata.
        setSkills((data?.skills || []).map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category || null,
          proficiency: s.proficiency || 'intermediate',
          years_experience: Number(s.years_experience) || 0,
        })));
        // Image lives on users.avatar_url (kept in sync by the backend
        // on every upload/delete) — the dashboard reads it from there too.
        setImageUrl(u.avatar_url || data?.user?.avatar_url || null);
        // Fetch the completion breakdown — separate call so it doesn't
        // block first paint of the form.
        candidatesApi.profileCompletion().then(setCompletion).catch(() => { /* non-fatal */ });
        setForm({
          full_name: u.full_name || user?.full_name || '',
          headline: p.headline || '',
          current_title: p.current_title || '',
          summary: p.summary || '',
          location: p.location || '',
          country: p.country || '',
          open_to_remote: p.open_to_remote == null ? true : !!p.open_to_remote,
          expected_salary_min: p.expected_salary_min ?? '',
          expected_salary_max: p.expected_salary_max ?? '',
          salary_currency: p.salary_currency || 'USD',
          availability: p.availability || 'negotiable',
          linkedin_url: p.linkedin_url || '',
          portfolio_url: p.portfolio_url || '',
          github_url: p.github_url || '',
        });
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

  /**
   * Persist the current SkillsPicker selection. Catalogue picks
   * carry `id`; custom entries carry only `name` — the backend
   * resolves both shapes in one call.
   */
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
      // Re-hydrate from server so newly-created custom skills get
      // their assigned id (chips lose the `isCustom` flag once they
      // exist in the catalogue).
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        full_name: form.full_name,
        headline: form.headline,
        current_title: form.current_title,
        summary: form.summary,
        location: form.location,
        country: form.country,
        open_to_remote: form.open_to_remote,
        salary_currency: form.salary_currency,
        availability: form.availability,
        linkedin_url: form.linkedin_url || null,
        portfolio_url: form.portfolio_url || null,
        github_url: form.github_url || null,
      };
      if (form.expected_salary_min !== '') payload.expected_salary_min = Number(form.expected_salary_min);
      if (form.expected_salary_max !== '') payload.expected_salary_max = Number(form.expected_salary_max);
      await candidatesApi.updateProfile(payload);
      await refreshMe();
      // Re-fetch the completion breakdown so the bar reflects whatever
      // sections just got populated (basic_info, contact_info, social_links, …).
      candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
      setSavedAt(new Date());
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

  return (
    <section className="view active" id="view-profile">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ My profile</span>
          <h1 className="display">Build your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>professional</span> story.</h1>
          <p>The more complete your profile, the better matches you'll get. Aim for 100%.</p>
        </div>
      </div>

      <div className="container profile-layout">
        <aside className="profile-side">
          <ProfileImageUpload
            imageUrl={imageUrl}
            fullName={form.full_name}
            onChange={(nextUrl) => {
              setImageUrl(nextUrl);
              // Refresh the completion bar — image is 10% of the score.
              candidatesApi.profileCompletion().then(setCompletion).catch(() => {});
              // Tell the rest of the app (Header avatar) the user changed.
              refreshMe().catch(() => {});
            }}
          />
          <div className="profile-name" style={{ marginTop: 14 }}>{form.full_name || 'Your name'}</div>
          <div className="profile-headline">{form.headline || form.current_title || 'Add a headline'}</div>
          <Link
            to="/profile/review"
            className="btn btn-outline"
            style={{ width: '100%', justifyContent: 'center', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}
          >
            Review profile →
          </Link>
          <div style={{ marginTop: 16 }}>
            <ProfileCompletionCard completion={completion} compact />
          </div>
        </aside>

        <form className="profile-main" onSubmit={handleSubmit}>
          {error && (
            <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              {error.message}
            </div>
          )}
          {savedAt && (
            <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
              Profile saved at {savedAt.toLocaleTimeString()}.
            </div>
          )}

          <ResumeUploadCard onProfileUpdated={refreshMe} />

          <div className="form-card">
            <div className="form-card-head">
              <h3>Personal information</h3>
              <span className="step">01 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Full name</label><input value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} /></div>
              <div className="form-field"><label>Professional headline</label><input value={form.headline} onChange={(e) => update({ headline: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Email address</label><input value={user?.email || ''} readOnly /></div>
              <div className="form-field"><label>Current title</label><input value={form.current_title} onChange={(e) => update({ current_title: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Location</label><input value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="City" /></div>
              <div className="form-field">
                <label>Open to remote</label>
                <select value={form.open_to_remote ? 'yes' : 'no'} onChange={(e) => update({ open_to_remote: e.target.value === 'yes' })}>
                  <option value="yes">Yes — anywhere</option>
                  <option value="no">Onsite only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>About you</h3>
              <span className="step">02 / 05</span>
            </div>
            <div className="form-row single">
              <div className="form-field">
                <label>Bio · 2-4 sentences about your work</label>
                <textarea value={form.summary} onChange={(e) => update({ summary: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>Skills & expertise</h3>
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

          <div className="form-card">
            <div className="form-card-head">
              <h3>Links</h3>
              <span className="step">04 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>LinkedIn</label><input value={form.linkedin_url} onChange={(e) => update({ linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/you" /></div>
              <div className="form-field"><label>Portfolio</label><input value={form.portfolio_url} onChange={(e) => update({ portfolio_url: e.target.value })} placeholder="https://yourportfolio.com" /></div>
            </div>
            <div className="form-row">
              <div className="form-field"><label>GitHub</label><input value={form.github_url} onChange={(e) => update({ github_url: e.target.value })} placeholder="https://github.com/you" /></div>
              <div className="form-field"><label>Country</label><input value={form.country} onChange={(e) => update({ country: e.target.value })} /></div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-head">
              <h3>What you're looking for</h3>
              <span className="step">05 / 05</span>
            </div>
            <div className="form-row">
              <div className="form-field"><label>Salary min (annual)</label><input type="number" min="0" value={form.expected_salary_min} onChange={(e) => update({ expected_salary_min: e.target.value })} placeholder="e.g. 120000" /></div>
              <div className="form-field"><label>Salary max (annual)</label><input type="number" min="0" value={form.expected_salary_max} onChange={(e) => update({ expected_salary_max: e.target.value })} placeholder="e.g. 180000" /></div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Currency</label>
                <select value={form.salary_currency} onChange={(e) => update({ salary_currency: e.target.value })}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="PKR">PKR</option>
                </select>
              </div>
              <div className="form-field">
                <label>Availability</label>
                <select value={form.availability} onChange={(e) => update({ availability: e.target.value })}>
                  {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line-soft)' }}>
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
