/**
 * ResumeUploadCard
 *
 * Self-contained Profile sub-card for the three-step resume flow:
 *
 *   1. Upload     -> POST /candidates/resume/upload (multipart)
 *   2. Parse      -> POST /candidates/resume/:id/parse  (extracts
 *                    name/email/phone/skills/experience/links)
 *   3. Confirm    -> POST /candidates/resume/:id/confirm with any
 *                    overrides; merges into candidate_profiles +
 *                    candidate_skills.
 *
 * Designed to be dropped into the Profile page without changing the
 * surrounding design - it reuses the existing `.form-card` shell so
 * spacing/typography stay consistent. The "preview" UI is rendered
 * inline (a stack of editable text fields and a chip list of skills);
 * a modal would block the rest of the form unnecessarily.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { candidatesApi } from '../api/index.js';

const ALLOWED = '.pdf,.doc,.docx,.txt';
const MAX_MB = 5;

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export default function ResumeUploadCard({ onProfileUpdated }) {
  const fileRef = useRef(null);
  const [resumes, setResumes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | uploading | parsing | review | confirming
  const [error, setError] = useState(null);
  const [confirmedAt, setConfirmedAt] = useState(null);

  // Local copy of the parsed fields so the user can edit before confirm.
  const [draft, setDraft] = useState({
    full_name: '', headline: '', current_title: '', summary: '',
    location: '', linkedin_url: '', github_url: '', portfolio_url: '',
    skills: [],
  });

  const loadList = useCallback(async () => {
    try {
      const data = await candidatesApi.resume.list();
      setResumes(data?.records || []);
    } catch { /* keep silent; list is informational */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function applyParsedToDraft(p) {
    if (!p) return;
    setDraft({
      full_name: p.full_name || '',
      headline: p.job_title || '',
      current_title: p.job_title || '',
      summary: p.summary || '',
      location: p.location || '',
      linkedin_url: p.linkedin_url || '',
      github_url: p.github_url || '',
      portfolio_url: p.portfolio_url || '',
      skills: safeArray(p.skills),
    });
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError({ message: `That file is over ${MAX_MB}MB.` });
      e.target.value = '';
      return;
    }
    setError(null);
    setStage('uploading');
    try {
      const up = await candidatesApi.resume.upload(file);
      const id = up?.resume_id;
      setActiveId(id);
      await loadList();
      setStage('parsing');
      const p = await candidatesApi.resume.parse(id);
      setParsed(p);
      applyParsedToDraft(p);
      setStage('review');
    } catch (err) {
      setError(err);
      setStage('idle');
    } finally {
      e.target.value = '';
    }
  }

  async function handleReParse() {
    if (!activeId) return;
    setStage('parsing');
    setError(null);
    try {
      const p = await candidatesApi.resume.parse(activeId);
      setParsed(p);
      applyParsedToDraft(p);
      setStage('review');
    } catch (err) {
      setError(err);
      setStage('review');
    }
  }

  async function handleConfirm() {
    if (!activeId) return;
    setStage('confirming');
    setError(null);
    try {
      await candidatesApi.resume.confirm(activeId, {
        ...draft,
        skills: draft.skills,
      });
      setConfirmedAt(new Date());
      setStage('idle');
      setParsed(null);
      setActiveId(null);
      onProfileUpdated?.();
    } catch (err) {
      setError(err);
      setStage('review');
    }
  }

  function removeSkill(s) {
    setDraft((d) => ({ ...d, skills: d.skills.filter((x) => x !== s) }));
  }
  function addSkill(s) {
    const t = s.trim();
    if (!t) return;
    setDraft((d) => (d.skills.includes(t) ? d : { ...d, skills: [...d.skills, t] }));
  }

  return (
    <div className="form-card">
      <div className="form-card-head">
        <h3>Resume</h3>
        <span className="step">Auto-fill</span>
      </div>
      <p className="muted" style={{ marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Upload a PDF, DOC, DOCX, or TXT (max {MAX_MB}MB). We parse it and let you review every field before saving to your profile.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error.message || 'Something went wrong while handling that resume.'}
        </div>
      )}
      {confirmedAt && (
        <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          Resume applied to profile at {confirmedAt.toLocaleTimeString()}. Your match scores will refresh on the next listing fetch.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED}
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn btn-coral"
          onClick={() => fileRef.current?.click()}
          disabled={stage === 'uploading' || stage === 'parsing' || stage === 'confirming'}
        >
          {stage === 'uploading' ? 'Uploading…' : stage === 'parsing' ? 'Parsing…' : 'Upload a resume'}
        </button>
        {resumes.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            {resumes.length} resume{resumes.length === 1 ? '' : 's'} on file.{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); handleReParse(); }} style={{ color: 'var(--coral)' }}>
              Re-parse latest
            </a>
          </span>
        )}
      </div>

      {stage === 'review' && parsed && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line-soft, #e2e0db)' }}>
          <h4 style={{ marginBottom: 4 }}>Review the parsed fields</h4>
          <p className="muted" style={{ marginBottom: 14, fontSize: 12 }}>
            Confidence {Math.round(Number(parsed.confidence) || 0)}%. Tweak anything inaccurate, then save to update your profile.
          </p>

          <div className="form-row">
            <div className="form-field">
              <label>Full name</label>
              <input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Headline</label>
              <input value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Current title</label>
              <input value={draft.current_title} onChange={(e) => setDraft({ ...draft, current_title: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Location</label>
              <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </div>
          </div>

          <div className="form-row single">
            <div className="form-field">
              <label>Summary</label>
              <textarea
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>LinkedIn</label>
              <input value={draft.linkedin_url} onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })} />
            </div>
            <div className="form-field">
              <label>GitHub</label>
              <input value={draft.github_url} onChange={(e) => setDraft({ ...draft, github_url: e.target.value })} />
            </div>
          </div>

          <div className="form-row single">
            <div className="form-field">
              <label>Portfolio</label>
              <input value={draft.portfolio_url} onChange={(e) => setDraft({ ...draft, portfolio_url: e.target.value })} />
            </div>
          </div>

          <div className="form-row single">
            <div className="form-field">
              <label>Skills</label>
              <div className="skills-input">
                {draft.skills.map((s) => (
                  <span key={s} className="skill-pill">
                    {s}<button type="button" onClick={() => removeSkill(s)}>×</button>
                  </span>
                ))}
                <input
                  placeholder="Add a skill and press enter"
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) { e.preventDefault(); addSkill(e.target.value); e.target.value = ''; } }}
                />
              </div>
              <small className="muted" style={{ fontSize: 12 }}>
                Skills come from the resume text. Add or remove freely before saving.
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setStage('idle'); setParsed(null); }} disabled={stage === 'confirming'}>
              Discard
            </button>
            <button type="button" className="btn btn-coral" onClick={handleConfirm} disabled={stage === 'confirming'}>
              {stage === 'confirming' ? 'Saving…' : 'Apply to profile →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
