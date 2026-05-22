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

  /*
   * Currently-saved profile values, used by the review panel's
   * side-by-side "current vs extracted" comparison. Loaded lazily
   * when parse completes so we always show fresh data.
   */
  const [current, setCurrent] = useState(null);

  /*
   * Per-field opt-in for the review panel. `useFromResume[key]
   * === true` means the user wants to apply the EXTRACTED value
   * for that key on confirm; false means keep the current saved
   * value. Default-on when extraction is non-empty AND current is
   * empty (sensible suggestion); default-off when both have values
   * (don't pre-check overwrites of existing data).
   */
  const [useFromResume, setUseFromResume] = useState({});

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

  /**
   * Load the candidate's currently-saved profile values so the
   * review panel can render side-by-side "Current vs Extracted"
   * rows. Also seeds `useFromResume` with sensible defaults:
   * checked when extraction has a value AND current is empty
   * (suggested merge), unchecked otherwise (don't pre-tick
   * destructive overwrites of saved data).
   */
  async function loadCurrentAndSeedDefaults(p) {
    let cur = null;
    try {
      const profileResp = await candidatesApi.profile();
      cur = profileResp?.profile || {};
    } catch { cur = {}; }
    setCurrent(cur);

    const meaningful = (v) => v != null && String(v).trim() !== '';
    const next = {};
    // Single-value fields where "use new" applies when extraction
    // beats current.
    const FIELD_PAIRS = [
      ['full_name',     'full_name',     cur.full_name],
      ['headline',      'job_title',     cur.headline],
      ['current_title', 'job_title',     cur.current_title],
      ['summary',       'summary',       cur.summary],
      ['location',      'location',      cur.location],
      ['linkedin_url',  'linkedin_url',  cur.linkedin_url],
      ['github_url',    'github_url',    cur.github_url],
      ['portfolio_url', 'portfolio_url', cur.portfolio_url],
    ];
    for (const [draftKey, parsedKey, currentVal] of FIELD_PAIRS) {
      const newVal = p?.[parsedKey];
      // Default-checked only when:
      //   1. extraction is non-empty (else nothing to apply), AND
      //   2. current is empty (filling a gap, not overwriting)
      next[draftKey] = meaningful(newVal) && !meaningful(currentVal);
    }
    // Skills: default checked when parser found any AND user has
    // fewer than 3 saved skills today.
    const currentSkillCount = Array.isArray(cur.skills) ? cur.skills.length : 0;
    next.skills = safeArray(p?.skills).length > 0 && currentSkillCount < 3;
    setUseFromResume(next);
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
      await loadCurrentAndSeedDefaults(p);
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

  /**
   * Strict opt-in confirm — only fields the user explicitly
   * checked via the "Use new value" toggle are sent. Empty
   * extractions and unchecked rows are skipped, so existing
   * profile data is preserved.
   *
   * Mirrors the backend's new strict-opt-in confirm() (see
   * resume.service.js > confirm). Both sides do the same
   * meaningful-value check so a misclick can't accidentally
   * apply an empty extraction.
   */
  async function handleConfirm() {
    if (!activeId) return;
    setStage('confirming');
    setError(null);
    try {
      const meaningful = (v) => v != null && String(v).trim() !== '';
      const payload = {};
      // Single-value fields — applied only when checked AND value is meaningful.
      const SINGLE_FIELDS = ['full_name', 'headline', 'current_title', 'summary',
                             'location', 'linkedin_url', 'github_url', 'portfolio_url'];
      for (const k of SINGLE_FIELDS) {
        if (useFromResume[k] && meaningful(draft[k])) {
          payload[k] = draft[k].trim();
        }
      }
      // Skills array — applied only when checked AND non-empty.
      if (useFromResume.skills && Array.isArray(draft.skills) && draft.skills.length > 0) {
        payload.skills = draft.skills;
      }

      // Nothing checked? Tell the user — saving would be a no-op.
      if (Object.keys(payload).length === 0) {
        setError({ message: 'Tick "Use new value" on at least one field, or click Reject to discard.' });
        setStage('review');
        return;
      }

      const result = await candidatesApi.resume.confirm(activeId, payload);
      setConfirmedAt(new Date());
      setStage('idle');
      setParsed(null);
      setActiveId(null);
      setUseFromResume({});
      setCurrent(null);
      onProfileUpdated?.();
      await loadList();
      // Hint at how many fields landed for confidence feedback.
      if (result?.applied_count != null) {
        // No banner update needed — confirmedAt already drives the green status row.
      }
    } catch (err) {
      setError(err);
      setStage('review');
    }
  }

  /* --- Resume management (§34) --- */

  /**
   * Reject the parsed preview without applying it. The resume file
   * stays on disk; the review panel closes. UI prompts for an
   * optional one-liner reason for an audit trail.
   */
  async function handleReject() {
    if (!activeId) return;
    // eslint-disable-next-line no-alert
    const reason = window.prompt('Optional: why are you rejecting this parsed data?', '');
    if (reason === null) return; // user hit Cancel
    setStage('confirming');
    setError(null);
    try {
      await candidatesApi.resume.reject(activeId, reason || 'Candidate rejected parsed data');
      setStage('idle');
      setParsed(null);
      setActiveId(null);
      await loadList();
    } catch (err) {
      setError(err);
      setStage('review');
    }
  }

  /** Promote a resume to primary; backend swaps everyone else off atomically. */
  async function handleSetPrimary(id) {
    setError(null);
    try {
      await candidatesApi.resume.setPrimary(id);
      await loadList();
    } catch (err) { setError(err); }
  }

  /** Soft-delete a resume. Confirms first because soft-delete is one-click. */
  async function handleDelete(id, name) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove "${name || 'this resume'}"? The file is recoverable by an admin.`)) return;
    setError(null);
    try {
      await candidatesApi.resume.delete(id);
      // If the user just deleted the resume they were reviewing, clear state.
      if (id === activeId) { setActiveId(null); setParsed(null); setStage('idle'); }
      await loadList();
    } catch (err) { setError(err); }
  }

  /** Open the signed-URL in a new tab (the URL expires in 10 min). */
  async function handleDownload(id) {
    setError(null);
    try {
      const data = await candidatesApi.resume.signedUrl(id);
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err); }
  }

  /**
   * Open a previously-uploaded resume's parsed data in the inline
   * review editor (without re-parsing). Lets the candidate edit a
   * past extraction and re-apply it to the profile.
   */
  async function handleReview(id) {
    setError(null);
    try {
      const data = await candidatesApi.resume.detail(id);
      const p = data?.parsed;
      if (!p) {
        setError({ message: 'This resume has no parsed data yet — try Re-parse.' });
        return;
      }
      setActiveId(id);
      setParsed(p);
      applyParsedToDraft(p);
      await loadCurrentAndSeedDefaults(p);
      setStage('review');
    } catch (err) { setError(err); }
  }

  /** Human-friendly file-size formatter. */
  function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
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

      {/*
       * Resume Management list (§34)
       * ---------------------------------------------------------------
       * Renders every uploaded resume with metadata + actions.
       *
       *   - "Primary" badge + Set primary button (radio-style — exactly one)
       *   - parse_status pill (pending / parsing / parsed / failed)
       *   - View (signed URL in new tab) · Edit parsed · Download · Delete
       *   - rejection_reason surfaces inline when present
       *
       * Hidden entirely when zero resumes exist — the upload button
       * + empty-state copy carries that screen.
       */}
      {resumes.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line-soft, #e2e0db)' }}>
          <h4 style={{ marginBottom: 12 }}>Your resumes</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resumes.map((r) => {
              const status = r.parse_status || 'pending';
              const statusBg =
                status === 'parsed' ? '#e6f4ea' :
                status === 'failed' ? '#fde9e3' :
                status === 'parsing' ? '#fff7e6' : 'var(--bone-2, #efe8da)';
              const statusFg =
                status === 'parsed' ? '#0f5132' :
                status === 'failed' ? '#b3361b' :
                status === 'parsing' ? '#7a4a14' : 'var(--muted, #6B6258)';
              return (
                <li
                  key={r.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 10,
                    padding: '12px 14px', borderRadius: 12,
                    background: r.is_primary ? 'var(--bone, #f5f0e6)' : 'var(--paper, #fff)',
                    border: '1px solid ' + (r.is_primary ? '#e8b574' : 'var(--line, #e2d9c7)'),
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>📄 {r.original_name}</strong>
                      {r.is_primary
                        ? <span style={{ background: 'var(--coral, #E85D3C)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 100, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>Primary</span>
                        : null}
                      <span style={{ background: statusBg, color: statusFg, fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 500, textTransform: 'capitalize' }}>
                        {status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted, #6B6258)', marginTop: 2 }}>
                      {fmtSize(r.size_bytes)} · uploaded {fmtDate(r.uploaded_at)}
                    </div>
                    {r.rejection_reason && (
                      <div style={{ fontSize: 12, color: 'var(--coral-deep, #C73E1D)', marginTop: 4 }}>
                        ⚠ Rejected: {r.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!r.is_primary && (
                      <button type="button" className="btn btn-ghost"
                              onClick={() => handleSetPrimary(r.id)}
                              style={{ padding: '4px 10px', fontSize: 12 }}>
                        Set primary
                      </button>
                    )}
                    {status === 'parsed' && (
                      <button type="button" className="btn btn-ghost"
                              onClick={() => handleReview(r.id)}
                              style={{ padding: '4px 10px', fontSize: 12 }}>
                        Edit parsed
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost"
                            onClick={() => handleDownload(r.id)}
                            style={{ padding: '4px 10px', fontSize: 12 }}>
                      Download
                    </button>
                    <button type="button" className="btn btn-ghost"
                            onClick={() => handleDelete(r.id, r.original_name)}
                            style={{ padding: '4px 10px', fontSize: 12, color: '#b3361b' }}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stage === 'review' && parsed && (
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line-soft, #e2e0db)' }}>
          <h4 style={{ marginBottom: 4 }}>Review extracted data</h4>
          <p className="muted" style={{ marginBottom: 14, fontSize: 12 }}>
            Confidence {Math.round(Number(parsed.confidence) || 0)}%. Tick "Use new value" only for fields you want to overwrite. Untouched rows keep their saved value.
          </p>

          {/*
           * Side-by-side comparison rows.
           * --------------------------------------------------
           * Each row shows: label · current saved value · new
           * extracted value · a "Use new value" checkbox. The
           * extracted-value cell is editable so the user can
           * correct extraction errors before applying.
           *
           * useFromResume[key] gates whether the row is sent on
           * confirm. Empty extractions render a muted hint and
           * lock the checkbox (no point applying empty over a
           * saved value).
           */}
          {[
            { key: 'full_name',     label: 'Full name',     curVal: current?.full_name },
            { key: 'headline',      label: 'Headline',      curVal: current?.headline },
            { key: 'current_title', label: 'Current title', curVal: current?.current_title },
            { key: 'location',      label: 'Location',      curVal: current?.location },
            { key: 'summary',       label: 'Summary',       curVal: current?.summary, long: true },
            { key: 'linkedin_url',  label: 'LinkedIn URL',  curVal: current?.linkedin_url },
            { key: 'github_url',    label: 'GitHub URL',    curVal: current?.github_url },
            { key: 'portfolio_url', label: 'Portfolio URL', curVal: current?.portfolio_url },
          ].map(({ key, label, curVal, long }) => {
            const newVal = draft[key];
            const hasNew = String(newVal ?? '').trim() !== '';
            const hasCur = String(curVal ?? '').trim() !== '';
            return (
              <div
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 1fr 40px',
                  gap: 12,
                  alignItems: 'start',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--line-soft, #ede5d3)',
                }}
              >
                <label style={{ fontSize: 13, fontWeight: 500, paddingTop: 8 }}>{label}</label>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted, #6B6258)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Current</div>
                  <div style={{
                    fontSize: 13, padding: '6px 10px', borderRadius: 8,
                    background: 'var(--bone, #f5f0e6)', minHeight: 36,
                    color: hasCur ? 'var(--ink, #1a1a1a)' : 'var(--muted, #6B6258)',
                  }}>
                    {hasCur ? curVal : <em>— not set —</em>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--coral, #E85D3C)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>From resume</div>
                  {long ? (
                    <textarea
                      value={newVal || ''}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      placeholder={hasNew ? '' : '(not extracted)'}
                      rows={3}
                      style={{
                        width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 8,
                        border: '1px solid var(--line, #e2d9c7)', fontFamily: 'inherit',
                        opacity: hasNew ? 1 : 0.6,
                      }}
                    />
                  ) : (
                    <input
                      value={newVal || ''}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      placeholder={hasNew ? '' : '(not extracted)'}
                      style={{
                        width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 8,
                        border: '1px solid var(--line, #e2d9c7)', fontFamily: 'inherit',
                        opacity: hasNew ? 1 : 0.6,
                      }}
                    />
                  )}
                </div>
                <label
                  title={hasNew ? 'Apply this value to your profile' : 'Nothing extracted — toggle disabled'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    paddingTop: 22, cursor: hasNew ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!useFromResume[key]}
                    disabled={!hasNew}
                    onChange={(e) => setUseFromResume({ ...useFromResume, [key]: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--coral, #E85D3C)' }}
                  />
                </label>
              </div>
            );
          })}

          {/* Skills row — list-based, special-cased */}
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 1fr 1fr 40px',
            gap: 12, alignItems: 'start', padding: '12px 0',
            borderBottom: '1px solid var(--line-soft, #ede5d3)',
          }}>
            <label style={{ fontSize: 13, fontWeight: 500, paddingTop: 8 }}>
              Skills <span style={{ color: 'var(--muted, #6B6258)', fontWeight: 400 }}>({draft.skills.length})</span>
            </label>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted, #6B6258)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Current</div>
              <div style={{
                fontSize: 13, padding: '6px 10px', borderRadius: 8,
                background: 'var(--bone, #f5f0e6)', minHeight: 36,
                color: (current?.skills?.length || 0) > 0 ? 'var(--ink, #1a1a1a)' : 'var(--muted, #6B6258)',
              }}>
                {(current?.skills?.length || 0) > 0
                  ? `${current.skills.length} saved skills`
                  : <em>— none saved —</em>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--coral, #E85D3C)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>From resume</div>
              <div className="skills-input">
                {draft.skills.map((s) => (
                  <span key={s} className="skill-pill">
                    {s}<button type="button" onClick={() => removeSkill(s)}>×</button>
                  </span>
                ))}
                <input
                  placeholder={draft.skills.length === 0 ? '(none extracted) — press enter to add manually' : 'Add a skill and press enter'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) { e.preventDefault(); addSkill(e.target.value); e.target.value = ''; } }}
                />
              </div>
              <small className="muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                Ticking applies all the chips above as your full skill set.
              </small>
            </div>
            <label
              title={draft.skills.length > 0 ? 'Replace saved skills with these' : 'Nothing extracted — toggle disabled'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                paddingTop: 22, cursor: draft.skills.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              <input
                type="checkbox"
                checked={!!useFromResume.skills}
                disabled={draft.skills.length === 0}
                onChange={(e) => setUseFromResume({ ...useFromResume, skills: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--coral, #E85D3C)' }}
              />
            </label>
          </div>

          {/* Selection summary */}
          {(() => {
            const checkedCount = Object.values(useFromResume).filter(Boolean).length;
            return (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted, #6B6258)' }}>
                {checkedCount > 0
                  ? `${checkedCount} field${checkedCount === 1 ? '' : 's'} selected to apply.`
                  : 'No fields ticked yet. Untouched fields keep their current value.'}
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setStage('idle'); setParsed(null); setActiveId(null); }}
              disabled={stage === 'confirming'}
              title="Close the preview without saving (your edits stay in the form)"
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleReject}
              disabled={stage === 'confirming' || !activeId}
              style={{ color: '#b3361b' }}
              title="Reject the parsed data — keeps the file uploaded, does not update profile"
            >
              Reject parsed data
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                if (!activeId) return;
                setStage('confirming'); setError(null);
                try {
                  // Save edits to the parsed-data row WITHOUT applying
                  // them to the candidate profile. The user can come
                  // back later and click "Apply to profile" to merge.
                  await candidatesApi.resume.updateParsed(activeId, {
                    full_name: draft.full_name,
                    job_title: draft.current_title,
                    summary: draft.summary,
                    location: draft.location,
                    linkedin_url: draft.linkedin_url,
                    github_url: draft.github_url,
                    portfolio_url: draft.portfolio_url,
                    skills: draft.skills,
                  });
                  setStage('review');
                } catch (err) { setError(err); setStage('review'); }
              }}
              disabled={stage === 'confirming' || !activeId}
              title="Save the corrected preview without updating your profile yet"
            >
              Save preview only
            </button>
            <button
              type="button"
              className="btn btn-coral"
              onClick={handleConfirm}
              disabled={stage === 'confirming' || Object.values(useFromResume).filter(Boolean).length === 0}
              title={Object.values(useFromResume).filter(Boolean).length === 0 ? 'Tick at least one "Use new value" first' : 'Apply ticked fields to your profile'}
            >
              {stage === 'confirming'
                ? 'Saving…'
                : `Apply selected (${Object.values(useFromResume).filter(Boolean).length}) →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
