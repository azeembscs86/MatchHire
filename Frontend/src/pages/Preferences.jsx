/**
 * Preferences page.
 *
 * The most interactive page in the app. Eight numbered sections:
 *
 *   1. Priorities  — ordered list the user composes from a pool
 *   2. Role        — desired roles, experience, job type
 *   3. Comp        — salary sliders + currency + must-haves
 *   4. Location    — work mode, cities, relocation/visa toggles
 *   5. Industry    — industries + company stage
 *   6. Weights     — per-factor match-algorithm sliders
 *   7. Dealbreakers — additive list with an inline composer
 *   8. Alerts      — notification cadence + per-channel toggles
 *
 * The sidebar tracks the active section purely for visual feedback;
 * navigation uses native smooth-scroll into the section anchors.
 *
 * The small inline subcomponents (TagOpt, OptCard, Toggle,
 * WeightRow, MatchScoreRange) own their own UI-only state. The
 * page-level `useState` calls track values that participate in
 * cross-section logic (ranked priorities, salary range, deal list).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_PRIORITIES } from '../data/priorities.js';
import { candidatesApi } from '../api/index.js';
import { LoadingState } from '../components/AsyncState.jsx';

const SECTIONS = [
  { id: 'priorities', n: 1, label: 'Top priorities' },
  { id: 'role', n: 2, label: 'Role & experience' },
  { id: 'comp', n: 3, label: 'Compensation' },
  { id: 'location', n: 4, label: 'Location & mode' },
  { id: 'industry', n: 5, label: 'Industry & stage' },
  { id: 'weights', n: 6, label: 'Match weighting' },
  { id: 'dealbreakers', n: 7, label: 'Deal breakers' },
  { id: 'alerts', n: 8, label: 'Notifications' },
];

/**
 * `TagOpt`, `OptCard`, `Toggle` are now CONTROLLED. The parent owns
 * the `active`/`on` value AND the toggle handler — this is what
 * lets the Preferences page report selections back to the API
 * (previously each tag owned its own internal state, so clicks lit
 * up visually but never reached `handleSave`).
 *
 * For backward compatibility with the decorative sections that
 * don't yet wire to a backend field (priorities ranking, deal
 * breakers, weight sliders, "must-include" comp items), the
 * components fall back to internal state when `onToggle` isn't
 * supplied — so visual-only chips keep working unchanged.
 */
function TagOpt({ active, onToggle, children }) {
  const [internal, setInternal] = useState(!!active);
  const controlled = typeof onToggle === 'function';
  const isActive = controlled ? !!active : internal;
  const handle = controlled ? onToggle : () => setInternal((v) => !v);
  return (
    <div className={`tag-opt${isActive ? ' active' : ''}`} onClick={handle}>{children}</div>
  );
}

function OptCard({ active, onToggle, icon, title, sub }) {
  const [internal, setInternal] = useState(!!active);
  const controlled = typeof onToggle === 'function';
  const isActive = controlled ? !!active : internal;
  const handle = controlled ? onToggle : () => setInternal((v) => !v);
  return (
    <div className={`opt-card${isActive ? ' active' : ''}`} onClick={handle}>
      <span className="opt-icon">{icon}</span><strong>{title}</strong><span>{sub}</span>
    </div>
  );
}

function Toggle({ on, onToggle, initial = false }) {
  const [internal, setInternal] = useState(!!initial);
  const controlled = typeof onToggle === 'function';
  const isOn = controlled ? !!on : internal;
  const handle = controlled ? onToggle : () => setInternal((v) => !v);
  return <div className={`toggle${isOn ? ' on' : ''}`} onClick={handle}></div>;
}

/**
 * Controlled weight slider — reports its value back to the parent
 * on every change. The parent holds `matchWeights` as `{ key: 0..100 }`.
 * Falls back to internal state when `value`/`onChange` aren't given
 * so any leftover uncontrolled usage still works.
 */
function WeightRow({ label, value, onChange, defaultValue = 70 }) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = typeof onChange === 'function';
  const v = controlled ? value : internal;
  return (
    <div className="weight-row">
      <label>{label}</label>
      <input
        type="range" min="0" max="100" value={v}
        onChange={(e) => (controlled ? onChange(+e.target.value) : setInternal(+e.target.value))}
      />
      <strong>{v}%</strong>
    </div>
  );
}

/**
 * Controlled "minimum match score" slider. The label note tracks
 * the chosen tier (wider net → good fits → high-confidence only).
 */
function MatchScoreRange({ value, onChange }) {
  const [internal, setInternal] = useState(85);
  const controlled = typeof onChange === 'function';
  const v = controlled ? value : internal;
  const note = v >= 85 ? 'high-confidence only' : v >= 70 ? 'good fits' : 'wider net';
  return (
    <div className="range-field" style={{ background: 'var(--bone)' }}>
      <div className="range-display">{v}% match score <small>· {note}</small></div>
      <input
        type="range" min="50" max="100" value={v}
        onChange={(e) => (controlled ? onChange(+e.target.value) : setInternal(+e.target.value))}
      />
    </div>
  );
}

export default function Preferences() {
  const [activeSection, setActiveSection] = useState('priorities');
  // When the user clicks a tab we kick off a programmatic smooth
  // scroll. The scroll listener should NOT keep flipping the active
  // tab as the browser animates past intermediate sections — it
  // would flicker. This ref holds a unix-ms deadline; the listener
  // bails while `Date.now() < scrollLockUntilRef.current`.
  const scrollLockUntilRef = useRef(0);
  const [rankedIds, setRankedIds] = useState(['wlb', 'comp', 'growth', 'remote', 'tech']);
  const [minSal, setMinSal] = useState(150);
  const [tgtSal, setTgtSal] = useState(200);
  const [currency, setCurrency] = useState('USD');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);

  /*
   * Every field below maps 1:1 to a column on the `preferences`
   * table (migrations 012 + 022 + 032). The Joi schema
   * `preferencesUpdate` in candidate.validator.js mirrors this set
   * one-to-one. Sections that don't yet have backend support are
   * commented as such.
   */

  // --- Section 2 (Role & experience) ---
  const [desiredTitles, setDesiredTitles] = useState([]);          // preferences.desired_titles
  const [experienceLevels, setExperienceLevels] = useState([]);     // preferences.experience_levels
  const [preferredJobTypes, setPreferredJobTypes] = useState([]);   // preferences.preferred_job_types

  // --- Section 3 (Compensation) ---
  const [compensationBenefits, setCompensationBenefits] = useState([]); // preferences.compensation_benefits

  // --- Section 4 (Location & work mode) ---
  const [preferredLocations, setPreferredLocations] = useState([]); // preferences.preferred_locations
  const [workModes, setWorkModes] = useState([]);                   // preferences.work_modes (multi)
  const [jobScope, setJobScope] = useState('hybrid');               // preferences.job_scope ENUM (single)
  const [relocateOpen, setRelocateOpen] = useState(false);          // preferences.relocate_open
  const [visaNeeded, setVisaNeeded] = useState(false);              // preferences.visa_sponsorship_needed
  const [tzRequired, setTzRequired] = useState(false);              // preferences.timezone_overlap_required

  // --- Section 5 (Industry & stage) ---
  const [preferredCategories, setPreferredCategories] = useState([]); // preferences.preferred_categories
  const [companyStages, setCompanyStages] = useState([]);            // preferences.company_stages

  // --- Section 6 (Match weighting) ---
  const [matchWeights, setMatchWeights] = useState({
    compensation: 85, skills: 95, location: 70, company_stage: 50,
    growth: 75, wlb: 80, mission: 60,
  });                                                                // preferences.match_weights (JSON)

  // --- Section 7 (Deal breakers) ---
  // The legacy `deals` state is used by the JSX. We're keeping the
  // existing array and persisting it on save under deal_breakers.

  // --- Section 8 (Notifications) ---
  const [emailFrequency, setEmailFrequency] = useState('daily');     // preferences.email_frequency ENUM
  const [minimumMatchScore, setMinimumMatchScore] = useState(70);    // preferences.minimum_match_score
  const [recruiterMessages, setRecruiterMessages] = useState(true);  // preferences.recruiter_messages
  const [interviewReminders, setInterviewReminders] = useState(true);// preferences.interview_reminders
  const [weeklyInsights, setWeeklyInsights] = useState(true);        // preferences.weekly_profile_insights
  const [salaryTrendAlerts, setSalaryTrendAlerts] = useState(false); // preferences.salary_trend_alerts

  /*
   * Catalogues offered to the user as quick-pick chips. Free-text
   * "+ Custom role" / "+ Add city" entries are also accepted —
   * they get pushed onto the array as-is and persisted alongside
   * catalogue picks.
   */
  const ROLE_SUGGESTIONS = [
    'Frontend Engineer', 'Full-Stack Engineer', 'Backend Engineer', 'Staff / Tech Lead',
    'Engineering Manager', 'Product Engineer', 'Mobile Engineer', 'DevOps / SRE',
    'Designer', 'Data Engineer', 'Data Scientist', 'AI Engineer',
  ];
  const JOB_TYPES = [
    { value: 'full_time', label: 'Full-time' },
    { value: 'contract', label: 'Contract' },
    { value: 'part_time', label: 'Part-time' },
    { value: 'freelance', label: 'Freelance' },
    { value: 'internship', label: 'Internship' },
    { value: 'temporary', label: 'Temporary' },
  ];
  const LOCATION_SUGGESTIONS = [
    'Anywhere remote', 'Karachi', 'Lahore', 'Islamabad', 'Dubai', 'Riyadh',
    'San Francisco', 'New York', 'London', 'Berlin', 'Singapore', 'Toronto',
  ];
  const CATEGORY_SUGGESTIONS = [
    'Software Development', 'Data & AI', 'Cybersecurity', 'Fintech', 'Healthcare',
    'Education', 'E-commerce', 'Climate tech', 'Gaming', 'Media', 'Crypto / Web3', 'Hardware',
  ];

  /** Helper: toggle a value in/out of an array. */
  function toggleIn(value, list, setter) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }
  const [deals, setDeals] = useState([
    'No fully onsite roles',
    'Requires more than 4 hours of timezone overlap',
    "Companies that don't offer equity",
    'No "rockstar ninja" job descriptions',
    'Crypto / Web3 only roles'
  ]);
  const [dealInput, setDealInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // Hydrate from /candidates/profile (preferences live alongside the profile).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await candidatesApi.profile();
        if (cancelled) return;
        const p = data?.preferences || {};
        if (p.salary_min) setMinSal(Math.round(Number(p.salary_min) / 1000));
        if (p.salary_max) setTgtSal(Math.round(Number(p.salary_max) / 1000));
        if (p.salary_currency) setCurrency(p.salary_currency);
        if (p.remote_only != null) setRemoteOnly(!!p.remote_only);
        if (p.notify_email != null) setNotifyEmail(!!p.notify_email);
        if (p.notify_push != null) setNotifyPush(!!p.notify_push);
        // CSV columns ↔ array state — backend stores comma-joined
        // strings, frontend works with arrays.
        const csv = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
        setDesiredTitles(csv(p.desired_titles));
        setPreferredLocations(csv(p.preferred_locations));
        setPreferredJobTypes(csv(p.preferred_job_types));
        setPreferredCategories(csv(p.preferred_categories));
        if (p.job_scope) setJobScope(p.job_scope);

        // --- Migration 032 fields ---
        // JSON columns: mysql2 returns objects directly; the repo's
        // getPreferences() also parses defensively. Empty arrays /
        // empty object are safe defaults.
        if (Array.isArray(p.priorities) && p.priorities.length) setRankedIds(p.priorities);
        setExperienceLevels(csv(p.experience_levels));
        setCompensationBenefits(csv(p.compensation_benefits));
        setWorkModes(csv(p.work_modes));
        setCompanyStages(csv(p.company_stages));
        if (Array.isArray(p.deal_breakers) && p.deal_breakers.length) setDeals(p.deal_breakers);
        if (p.match_weights && typeof p.match_weights === 'object') {
          setMatchWeights((prev) => ({ ...prev, ...p.match_weights }));
        }
        if (p.relocate_open != null) setRelocateOpen(!!p.relocate_open);
        if (p.visa_sponsorship_needed != null) setVisaNeeded(!!p.visa_sponsorship_needed);
        if (p.timezone_overlap_required != null) setTzRequired(!!p.timezone_overlap_required);
        if (p.email_frequency) setEmailFrequency(p.email_frequency);
        if (p.minimum_match_score != null) setMinimumMatchScore(Number(p.minimum_match_score));
        if (p.recruiter_messages != null) setRecruiterMessages(!!p.recruiter_messages);
        if (p.interview_reminders != null) setInterviewReminders(!!p.interview_reminders);
        if (p.weekly_profile_insights != null) setWeeklyInsights(!!p.weekly_profile_insights);
        if (p.salary_trend_alerts != null) setSalaryTrendAlerts(!!p.salary_trend_alerts);
      } catch {
        /* keep defaults; page is still usable */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /*
   * Sidebar auto-active on scroll.
   * --------------------------------
   * Deterministic anchor-line picker, rAF-throttled.
   *
   * Walk the section list in document order; the LAST section whose
   * top has crossed an anchor line ~140px below the viewport top is
   * the one currently being read. Below the header, above any
   * section that's still scrolled off-screen, robust across every
   * scroll position (top-of-page, mid-section, between sections,
   * end-of-page).
   *
   * Why this beats IntersectionObserver here: with the previous IO
   * setup, a section taller than the trigger band kept the active
   * tab frozen between sibling sections — when the reader scrolled
   * out of section A's band the observer briefly saw an empty
   * intersecting set, fell through to its fallback, and snapped
   * back to the first section before the next IO callback fired
   * for B. The anchor-line picker reads every section's box on
   * every tick so there is no "empty set" gap to flicker through.
   *
   * IntersectionObserver is still wired below as a cheap wake-up
   * signal so the picker re-runs as soon as a section enters or
   * leaves the viewport (covers the case where the user resizes,
   * uses keyboard navigation, or scrolls programmatically without
   * firing a regular scroll event).
   *
   * Click handler `scrollPref` stamps a 700 ms lock on
   * `scrollLockUntilRef` so the smooth-scroll animation doesn't
   * flip the active tab through every section it passes en route.
   */
  useEffect(() => {
    if (loading) return undefined;
    const sections = SECTIONS
      .map((s) => ({ id: s.id, el: document.getElementById('pref-' + s.id) }))
      .filter((s) => s.el);
    if (sections.length === 0) return undefined;

    // Trigger line ~140px below the viewport top — clears the
    // sticky `.main-nav` header and leaves a small reading
    // margin so the heading is visible when the tab flips.
    const ANCHOR = 140;

    let rafId = 0;
    function compute() {
      rafId = 0;
      if (Date.now() < scrollLockUntilRef.current) return;
      let chosen = sections[0].id;
      for (const s of sections) {
        const top = s.el.getBoundingClientRect().top;
        if (top - ANCHOR <= 0) chosen = s.id;
        else break;
      }
      setActiveSection((prev) => (prev === chosen ? prev : chosen));
    }
    function schedule() {
      if (rafId) return;
      rafId = requestAnimationFrame(compute);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    // IO acts as a wake-up signal — it doesn't pick the active tab
    // itself; it just nudges the rAF-throttled picker so the tab
    // updates immediately when a section's boundary crosses the
    // viewport even without a discrete scroll event.
    const observer = new IntersectionObserver(schedule, { threshold: 0 });
    sections.forEach((s) => observer.observe(s.el));

    // Initial sync — covers deep-link / refreshed scroll positions
    // where no scroll event has fired yet.
    compute();

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [loading]);

  /*
   * Unsaved-changes counter
   * -----------------------
   * After the initial hydrate completes we snapshot every field
   * into `baseline`. Each render computes a shallow diff of the
   * CURRENT values vs the baseline; the count populates the save
   * bar. A successful save replaces the baseline with the new
   * state — so the counter goes back to 0 right after Save.
   */
  const [baseline, setBaseline] = useState(null);
  useEffect(() => {
    if (loading || baseline != null) return;
    // Take the snapshot ONCE, immediately after first load.
    setBaseline(currentSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function currentSnapshot() {
    return {
      desiredTitles, preferredLocations, preferredJobTypes, preferredCategories,
      jobScope, remoteOnly, minSal, tgtSal, currency,
      notifyEmail, notifyPush,
      rankedIds, experienceLevels, compensationBenefits, workModes, companyStages,
      deals, relocateOpen, visaNeeded, tzRequired,
      matchWeights, emailFrequency, minimumMatchScore,
      recruiterMessages, interviewReminders, weeklyInsights, salaryTrendAlerts,
    };
  }

  /** Count the fields that differ between two snapshots. */
  function countChanges(a, b) {
    if (!a || !b) return 0;
    let n = 0;
    for (const k of Object.keys(a)) {
      const av = a[k];
      const bv = b[k];
      const isArr = Array.isArray(av);
      const isObj = av && typeof av === 'object' && !isArr;
      const same = (isArr || isObj) ? JSON.stringify(av) === JSON.stringify(bv) : av === bv;
      if (!same) n += 1;
    }
    return n;
  }

  const unsavedCount = baseline ? countChanges(baseline, currentSnapshot()) : 0;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // FULL payload — every section on the page. Backend Joi
      // schema (`preferencesUpdate`) accepts every key; the repo's
      // upsertPreferences stringifies JSON columns and joins CSV.
      await candidatesApi.updatePreferences({
        // matching engine
        desired_titles: desiredTitles,
        preferred_locations: preferredLocations,
        preferred_job_types: preferredJobTypes.length ? preferredJobTypes : ['full_time'],
        preferred_categories: preferredCategories,
        job_scope: jobScope,
        remote_only: remoteOnly,
        salary_min: minSal * 1000,
        salary_max: tgtSal * 1000,
        salary_currency: currency,
        notify_email: notifyEmail,
        notify_push: notifyPush,
        // migration 032 — full Preferences page coverage
        priorities: rankedIds,
        experience_levels: experienceLevels,
        compensation_benefits: compensationBenefits,
        work_modes: workModes,
        company_stages: companyStages,
        deal_breakers: deals,
        relocate_open: relocateOpen,
        visa_sponsorship_needed: visaNeeded,
        timezone_overlap_required: tzRequired,
        match_weights: matchWeights,
        email_frequency: emailFrequency,
        minimum_match_score: minimumMatchScore,
        recruiter_messages: recruiterMessages,
        interview_reminders: interviewReminders,
        weekly_profile_insights: weeklyInsights,
        salary_trend_alerts: salaryTrendAlerts,
      });
      setSavedAt(new Date());
      // Reset the baseline so the "Unsaved changes" counter shows 0
      // immediately. Any further edits will increment from a clean slate.
      setBaseline(currentSnapshot());
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  const addRank = (id) => {
    if (rankedIds.includes(id)) return;
    if (rankedIds.length >= 8) { alert('Keep it focused — max 8 priorities'); return; }
    setRankedIds([...rankedIds, id]);
  };
  const removeRank = (i) => setRankedIds(rankedIds.filter((_, idx) => idx !== i));
  const moveRank = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rankedIds.length) return;
    const next = [...rankedIds];
    [next[i], next[j]] = [next[j], next[i]];
    setRankedIds(next);
  };

  const scrollPref = (id) => {
    setActiveSection(id);
    // Lock the scroll listener for ~700ms — long enough for the
    // browser's smooth-scroll animation to settle on the target
    // section without the listener flipping the active tab to
    // each section it crosses on the way there.
    scrollLockUntilRef.current = Date.now() + 700;
    const el = document.getElementById('pref-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addDeal = () => {
    if (!dealInput.trim()) return;
    setDeals([...deals, dealInput.trim()]);
    setDealInput('');
  };

  if (loading) {
    return (
      <section className="view active" id="view-preferences">
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your preferences…" />
        </div>
      </section>
    );
  }

  return (
    <section className="view active" id="view-preferences">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Job preferences · The brain behind your matches</span>
          <h1 className="display">What <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>matters</span> to you?</h1>
          <p>Rank your priorities, set your filters, and we'll only show you roles that genuinely fit. Updates apply instantly to your job feed.</p>
        </div>
      </div>

      <div className="container pref-layout">
        <aside className="pref-side">
          <ul className="pref-side-nav">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  data-testid={`pref-tab-${s.id}`}
                  className={activeSection === s.id ? 'active' : ''}
                  onClick={() => scrollPref(s.id)}
                >
                  <span>{s.n}</span> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <div className="pref-main">

          {/* TOP PRIORITIES */}
          <div className="pref-card priority-board" id="pref-priorities">
            <span className="pref-eyebrow"><span className="dot"></span>The most important section</span>
            <div className="pref-head">
              <h2>Rank your top <span className="ital">5 priorities</span><br />in order of importance.</h2>
              <span className="pref-num">01 / 08</span>
            </div>
            <p className="lead">Drag, reorder, swap. Your #1 priority weighs 2× more than your #5. Anything not on the list won't influence your matches.</p>

            <span className="pool-label">Your ranked priorities</span>
            <div className="ranked-list">
              {rankedIds.length === 0
                ? <div className="ranked-empty">Click priorities below to add them. Top of the list = top priority.</div>
                : rankedIds.map((id, i) => {
                  const p = ALL_PRIORITIES.find((x) => x.id === id);
                  const cls = i === 0 ? 'first' : i === 1 ? 'second' : '';
                  return (
                    <div key={id} className={`ranked-item ${cls}`}>
                      <div className="rank-badge">#{i + 1}</div>
                      <div className="pri-icon">{p.icon}</div>
                      <div className="pri-text"><strong>{p.name}</strong><small>{p.desc}</small></div>
                      <div className="rank-controls">
                        <button className="rank-btn" onClick={() => moveRank(i, -1)} disabled={i === 0}>↑</button>
                        <button className="rank-btn" onClick={() => moveRank(i, 1)} disabled={i === rankedIds.length - 1}>↓</button>
                        <button className="rank-btn remove" onClick={() => removeRank(i)}>×</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <span className="pool-label" style={{ marginTop: 24 }}>Available priorities · click to add</span>
            <div className="priority-pool">
              {ALL_PRIORITIES.map((p) => {
                const added = rankedIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={`priority-chip${added ? ' added' : ''}`}
                    onClick={() => addRank(p.id)}
                  >
                    <span className="icon-em">{p.icon}</span>{p.name}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROLE & EXPERIENCE */}
          <div className="pref-card" id="pref-role">
            <div className="pref-head">
              <h2>Role &amp; <span className="ital">experience</span> level.</h2>
              <span className="pref-num">02 / 08</span>
            </div>
            <p className="lead">What kind of roles should we surface, and where are you in your career?</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Desired roles · pick from the catalogue or add your own ({desiredTitles.length} selected)
              </label>
              <div className="tag-selector">
                {/* Catalogue chips */}
                {ROLE_SUGGESTIONS.map((r) => (
                  <TagOpt
                    key={r}
                    active={desiredTitles.includes(r)}
                    onToggle={() => toggleIn(r, desiredTitles, setDesiredTitles)}
                  >
                    {r}
                  </TagOpt>
                ))}
                {/* Custom titles the user has added that aren't in the catalogue */}
                {desiredTitles.filter((t) => !ROLE_SUGGESTIONS.includes(t)).map((t) => (
                  <TagOpt
                    key={t}
                    active
                    onToggle={() => toggleIn(t, desiredTitles, setDesiredTitles)}
                  >
                    {t} ×
                  </TagOpt>
                ))}
                {/* "+ Custom role" prompts a free-text entry */}
                <TagOpt
                  active={false}
                  onToggle={() => {
                    // eslint-disable-next-line no-alert
                    const v = prompt('Add a custom role title (max 120 chars)');
                    const next = v?.trim();
                    if (next && next.length <= 120 && !desiredTitles.includes(next)) {
                      setDesiredTitles([...desiredTitles, next]);
                    }
                  }}
                >+ Custom role</TagOpt>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Experience level · multi-select ({experienceLevels.length} chosen)
              </label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                {[
                  { value: 'entry',     title: 'Entry',     sub: '0–2 years' },
                  { value: 'mid',       title: 'Mid',       sub: '2–5 years' },
                  { value: 'senior',    title: 'Senior',    sub: '5–8 years' },
                  { value: 'staff',     title: 'Staff',     sub: '8–12 years' },
                  { value: 'principal', title: 'Principal', sub: '12+ years' },
                ].map((l) => (
                  <OptCard
                    key={l.value}
                    icon="●"
                    title={l.title}
                    sub={l.sub}
                    active={experienceLevels.includes(l.value)}
                    onToggle={() => toggleIn(l.value, experienceLevels, setExperienceLevels)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Job type</label>
              <div className="tag-selector">
                {JOB_TYPES.map((t) => (
                  <TagOpt
                    key={t.value}
                    active={preferredJobTypes.includes(t.value)}
                    onToggle={() => toggleIn(t.value, preferredJobTypes, setPreferredJobTypes)}
                  >
                    {t.label}
                  </TagOpt>
                ))}
              </div>
            </div>
          </div>

          {/* COMPENSATION */}
          <div className="pref-card" id="pref-comp">
            <div className="pref-head">
              <h2><span className="ital">Compensation</span> expectations.</h2>
              <span className="pref-num">03 / 08</span>
            </div>
            <p className="lead">Set your floor. We'll never show you anything below your minimum, and we'll prioritize roles within your range.</p>

            <div className="range-group">
              <div className="range-field">
                <label>Minimum base salary · USD</label>
                <div className="range-display">${minSal}K <small>· per year</small></div>
                <input type="range" min="40" max="400" value={minSal} step="5" onChange={(e) => setMinSal(+e.target.value)} />
              </div>
              <div className="range-field">
                <label>Target base salary · USD</label>
                <div className="range-display">${tgtSal}K <small>· per year</small></div>
                <input type="range" min="40" max="400" value={tgtSal} step="5" onChange={(e) => setTgtSal(+e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Currency</label>
              <div className="tag-selector">
                {[
                  { code: 'USD', label: 'USD $' },
                  { code: 'EUR', label: 'EUR €' },
                  { code: 'GBP', label: 'GBP £' },
                  { code: 'PKR', label: 'PKR ₨' },
                  { code: 'INR', label: 'INR ₹' },
                  { code: 'AED', label: 'AED د.إ' },
                ].map((c) => (
                  <TagOpt
                    key={c.code}
                    active={currency === c.code}
                    onToggle={() => setCurrency(c.code)}
                  >
                    {c.label}
                  </TagOpt>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Compensation must include ({compensationBenefits.length} chosen)
              </label>
              <div className="tag-selector">
                {[
                  { value: 'equity',     label: 'Equity / RSUs' },
                  { value: 'bonus',      label: 'Annual bonus' },
                  { value: '401k',       label: '401k / pension match' },
                  { value: 'signing',    label: 'Signing bonus' },
                  { value: 'healthcare', label: 'Healthcare' },
                  { value: 'learning',   label: 'Learning budget' },
                ].map((b) => (
                  <TagOpt
                    key={b.value}
                    active={compensationBenefits.includes(b.value)}
                    onToggle={() => toggleIn(b.value, compensationBenefits, setCompensationBenefits)}
                  >
                    {b.label}
                  </TagOpt>
                ))}
              </div>
            </div>
          </div>

          {/* LOCATION & WORK MODE */}
          <div className="pref-card" id="pref-location">
            <div className="pref-head">
              <h2>Location &amp; <span className="ital">work mode</span>.</h2>
              <span className="pref-num">04 / 08</span>
            </div>
            <p className="lead">Where in the world, and how do you want to show up to work?</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Work scope · pick one (drives the job-feed ranking)
              </label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {/*
                 * Single-select — maps 1:1 to preferences.job_scope ENUM.
                 * 'hybrid' is the default catch-all. Selecting 'global_remote'
                 * also flips the `remote_only` boolean ON so older code
                 * paths that read just `remote_only` stay in sync.
                 */}
                <OptCard
                  icon="⌂"
                  title="Global remote"
                  sub="Anywhere"
                  active={jobScope === 'global_remote'}
                  onToggle={() => { setJobScope('global_remote'); setRemoteOnly(true); }}
                />
                <OptCard
                  icon="⇄"
                  title="Hybrid"
                  sub="Mix of any"
                  active={jobScope === 'hybrid'}
                  onToggle={() => { setJobScope('hybrid'); setRemoteOnly(false); }}
                />
                <OptCard
                  icon="◐"
                  title="My country"
                  sub="Same country only"
                  active={jobScope === 'country'}
                  onToggle={() => { setJobScope('country'); setRemoteOnly(false); }}
                />
                <OptCard
                  icon="◆"
                  title="Local only"
                  sub="My city"
                  active={jobScope === 'local'}
                  onToggle={() => { setJobScope('local'); setRemoteOnly(false); }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Preferred locations ({preferredLocations.length} selected)
              </label>
              <div className="tag-selector">
                {LOCATION_SUGGESTIONS.map((loc) => (
                  <TagOpt
                    key={loc}
                    active={preferredLocations.includes(loc)}
                    onToggle={() => toggleIn(loc, preferredLocations, setPreferredLocations)}
                  >
                    {loc}
                  </TagOpt>
                ))}
                {preferredLocations.filter((l) => !LOCATION_SUGGESTIONS.includes(l)).map((l) => (
                  <TagOpt
                    key={l}
                    active
                    onToggle={() => toggleIn(l, preferredLocations, setPreferredLocations)}
                  >
                    {l} ×
                  </TagOpt>
                ))}
                <TagOpt
                  active={false}
                  onToggle={() => {
                    // eslint-disable-next-line no-alert
                    const v = prompt('Add a city / country (max 120 chars)');
                    const next = v?.trim();
                    if (next && next.length <= 120 && !preferredLocations.includes(next)) {
                      setPreferredLocations([...preferredLocations, next]);
                    }
                  }}
                >+ Add city</TagOpt>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Acceptable day-to-day work modes · pick all that apply ({workModes.length} chosen)
              </label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { value: 'remote', icon: '⌂', title: 'Fully remote', sub: 'Work from anywhere' },
                  { value: 'hybrid', icon: '⇄', title: 'Hybrid',       sub: '2–3 days in office' },
                  { value: 'onsite', icon: '◆', title: 'Onsite',       sub: '5 days in office' },
                ].map((m) => (
                  <OptCard
                    key={m.value}
                    icon={m.icon}
                    title={m.title}
                    sub={m.sub}
                    active={workModes.includes(m.value)}
                    onToggle={() => toggleIn(m.value, workModes, setWorkModes)}
                  />
                ))}
              </div>
            </div>

            {/* Three location toggles — all persisted as of migration 032. */}
            <div className="toggle-row" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 18 }}>
              <div><strong>Open to relocate</strong><small>Show roles requiring relocation if pay covers it</small></div>
              <Toggle on={relocateOpen} onToggle={() => setRelocateOpen((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Visa sponsorship needed</strong><small>Only show employers who sponsor work visas</small></div>
              <Toggle on={visaNeeded} onToggle={() => setVisaNeeded((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Time zone overlap required</strong><small>4+ hours overlap with my zone</small></div>
              <Toggle on={tzRequired} onToggle={() => setTzRequired((v) => !v)} />
            </div>
          </div>

          {/* INDUSTRY & STAGE */}
          <div className="pref-card" id="pref-industry">
            <div className="pref-head">
              <h2>Industry &amp; <span className="ital">company stage</span>.</h2>
              <span className="pref-num">05 / 08</span>
            </div>
            <p className="lead">A scrappy seed-stage startup is a very different beast from a public company. Tell us where you thrive.</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Industries you'd love ({preferredCategories.length} selected)
              </label>
              <div className="tag-selector">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <TagOpt
                    key={c}
                    active={preferredCategories.includes(c)}
                    onToggle={() => toggleIn(c, preferredCategories, setPreferredCategories)}
                  >
                    {c}
                  </TagOpt>
                ))}
                {preferredCategories.filter((c) => !CATEGORY_SUGGESTIONS.includes(c)).map((c) => (
                  <TagOpt
                    key={c}
                    active
                    onToggle={() => toggleIn(c, preferredCategories, setPreferredCategories)}
                  >
                    {c} ×
                  </TagOpt>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Company stage · multi-select ({companyStages.length} chosen)
              </label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                {[
                  { value: 'seed',           icon: '●', title: 'Seed',       sub: '1–10 ppl' },
                  { value: 'series_a_b',     icon: '●', title: 'Series A–B', sub: '10–100' },
                  { value: 'series_c_plus',  icon: '●', title: 'Series C+',  sub: '100–500' },
                  { value: 'late_stage',     icon: '●', title: 'Late-stage', sub: '500–5K' },
                  { value: 'public',         icon: '◆', title: 'Public',    sub: '5K+' },
                ].map((s) => (
                  <OptCard
                    key={s.value}
                    icon={s.icon}
                    title={s.title}
                    sub={s.sub}
                    active={companyStages.includes(s.value)}
                    onToggle={() => toggleIn(s.value, companyStages, setCompanyStages)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* MATCH WEIGHTING */}
          <div className="pref-card" id="pref-weights">
            <div className="pref-head">
              <h2>Fine-tune the <span className="ital">match algorithm</span>.</h2>
              <span className="pref-num">06 / 08</span>
            </div>
            <p className="lead">How much should each factor influence which jobs reach the top of your feed? Drag to adjust.</p>

            {/*
             * Each row reads/writes one key on the matchWeights
             * object. Backend stores this as a JSON column so the
             * key set is flexible; today's seven keys match the
             * matching service's component breakdown.
             */}
            {[
              { key: 'compensation',  label: '💰 Compensation' },
              { key: 'skills',        label: '🛠 Skills match' },
              { key: 'location',      label: '📍 Location fit' },
              { key: 'company_stage', label: '🏢 Company stage' },
              { key: 'growth',        label: '📈 Career growth' },
              { key: 'wlb',           label: '⚖ Work-life balance' },
              { key: 'mission',       label: '🎯 Mission alignment' },
            ].map((w) => (
              <WeightRow
                key={w.key}
                label={w.label}
                value={matchWeights[w.key] ?? 70}
                onChange={(v) => setMatchWeights({ ...matchWeights, [w.key]: v })}
              />
            ))}
          </div>

          {/* DEAL BREAKERS */}
          <div className="pref-card" id="pref-dealbreakers">
            <div className="pref-head">
              <h2><span className="ital">Deal breakers</span>.</h2>
              <span className="pref-num">07 / 08</span>
            </div>
            <p className="lead">The hard nos. Roles matching any of these will never appear in your feed — no exceptions, no "but the salary is great" override.</p>

            <div className="deal-list">
              {deals.map((d, i) => (
                <div key={i} className="deal-item">
                  <span className="ic">×</span> {d}
                  <button onClick={() => setDeals(deals.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
            <div className="deal-add">
              <input
                type="text"
                placeholder="Add a deal breaker… (e.g. on-call rotations every weekend)"
                value={dealInput}
                onChange={(e) => setDealInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDeal(); } }}
              />
              <button onClick={addDeal}>+ Add</button>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className="pref-card" id="pref-alerts">
            <div className="pref-head">
              <h2>How should we <span className="ital">reach you</span>?</h2>
              <span className="pref-num">08 / 08</span>
            </div>
            <p className="lead">Control the volume. We'd rather send you 5 perfect matches than 50 mediocre ones.</p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>
                Email digest frequency · pick one
              </label>
              <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                {[
                  { value: 'real_time', icon: '⚡', title: 'Real-time', sub: 'Each match' },
                  { value: 'daily',     icon: '☀', title: 'Daily',     sub: 'Top 5 picks' },
                  { value: 'weekly',    icon: '📅', title: 'Weekly',    sub: 'Sunday digest' },
                  { value: 'off',       icon: '✕', title: 'Off',       sub: 'App only' },
                ].map((f) => (
                  <OptCard
                    key={f.value}
                    icon={f.icon}
                    title={f.title}
                    sub={f.sub}
                    active={emailFrequency === f.value}
                    onToggle={() => setEmailFrequency(f.value)}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 12 }}>Only notify me about matches above</label>
              <MatchScoreRange value={minimumMatchScore} onChange={setMinimumMatchScore} />
            </div>

            {/*
             * Two notification channels are wired to the backend
             * (preferences.notify_email + notify_push). The four
             * granular toggles below it remain visual-only —
             * Phase 2 ships a `notification_preferences` table with
             * per-event opt-in.
             */}
            <div className="toggle-row" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 18 }}>
              <div><strong>Email notifications</strong><small>Job matches, application updates, interview reminders</small></div>
              <Toggle on={notifyEmail} onToggle={() => setNotifyEmail((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Push notifications</strong><small>Browser push for time-sensitive events · <em>requires browser permission</em></small></div>
              <Toggle on={notifyPush} onToggle={() => setNotifyPush((v) => !v)} />
            </div>
            {/* Four granular notification toggles — now persisted (migration 032). */}
            <div className="toggle-row">
              <div><strong>Recruiter direct messages</strong><small>Allow vetted recruiters to message you</small></div>
              <Toggle on={recruiterMessages} onToggle={() => setRecruiterMessages((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Interview reminders</strong><small>1 hour before scheduled interviews</small></div>
              <Toggle on={interviewReminders} onToggle={() => setInterviewReminders((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Weekly profile insights</strong><small>How often your profile is viewed</small></div>
              <Toggle on={weeklyInsights} onToggle={() => setWeeklyInsights((v) => !v)} />
            </div>
            <div className="toggle-row">
              <div><strong>Salary trend alerts</strong><small>When market rates for your role shift</small></div>
              <Toggle on={salaryTrendAlerts} onToggle={() => setSalaryTrendAlerts((v) => !v)} />
            </div>
          </div>

          <div className="save-bar">
            <div className="save-bar-info">
              <div className="ic">✓</div>
              <div>
                <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 15 }}>
                  {savedAt && unsavedCount === 0
                    ? `Saved at ${savedAt.toLocaleTimeString()}`
                    : unsavedCount > 0
                      ? `${unsavedCount} unsaved change${unsavedCount === 1 ? '' : 's'}`
                      : 'No unsaved changes'}
                </strong>
                <span style={{ display: 'block', fontSize: 12 }}>
                  {saveError ? saveError.message : 'Your job feed will update within 60 seconds of saving.'}
                </span>
              </div>
            </div>
            <div className="save-bar-actions">
              <button className="btn btn-ghost" type="button" disabled={saving}>Discard</button>
              <button
                className="btn btn-coral"
                type="button"
                onClick={handleSave}
                disabled={saving || (baseline && unsavedCount === 0)}
                title={baseline && unsavedCount === 0 ? 'No changes to save' : undefined}
              >
                {saving ? 'Saving…' : 'Save preferences →'}
              </button>
            </div>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 18, textAlign: 'center' }}>
            Tip: tweak your favorites in <Link to="/favorites" style={{ color: 'var(--coral)', textDecoration: 'underline' }}>Favorites</Link> too.
          </p>
        </div>
      </div>
    </section>
  );
}
