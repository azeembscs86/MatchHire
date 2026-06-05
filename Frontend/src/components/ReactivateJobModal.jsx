/**
 * ReactivateJobModal
 *
 * Lets a company reopen an expired (or closed) job posting. Two
 * usage paths:
 *
 *   1. Date-only — the recruiter picks a new `application_deadline`
 *      and submits. Backend keeps `admin_status='approved'` and the
 *      job rejoins the public feed instantly.
 *   2. Content edit — the recruiter expands "Update job details"
 *      and tweaks title / description / requirements / skills /
 *      salary / location alongside the new date. Backend flips
 *      `admin_status='pending'` so super-admin can re-moderate
 *      before the public feed picks it up again.
 *
 * The modal renders the same .modal / .modal-form chrome as
 * `CompanyRejectionModal` for visual consistency. Submit is
 * disabled until a valid future deadline is chosen.
 *
 * @param {boolean}  open
 * @param {object}   job              — the job being reactivated (id + content)
 * @param {function} onClose          — dismiss the modal
 * @param {function} onConfirm        — async(payload) → calls /reactivate
 */
import { useEffect, useState } from 'react';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysFromTodayIso() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const fieldLabelStyle = {
  fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8,
};
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
  borderRadius: 10, fontSize: 14, background: 'var(--paper)', color: 'var(--ink)',
};

export default function ReactivateJobModal({ open, job, onClose, onConfirm }) {
  const [deadline, setDeadline] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Content-edit fields. Pre-filled from the job's current values
  // each time the modal opens so the recruiter sees "what's
  // currently live" rather than blank fields.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [skills, setSkills] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDeadline(thirtyDaysFromTodayIso());
    setShowAdvanced(false);
    setTitle(job?.title || '');
    setDescription(job?.description || '');
    setRequirements(job?.requirements || '');
    // skills_tags persists as CSV — render as CSV so edits stay
    // round-trippable without a tokeniser.
    setSkills(Array.isArray(job?.skills_tags)
      ? job.skills_tags.join(', ')
      : String(job?.skills_tags || ''));
    setSalaryMin(job?.salary_min != null ? String(job.salary_min) : '');
    setSalaryMax(job?.salary_max != null ? String(job.salary_max) : '');
    setLocation(job?.location || '');
    setError(null);
    setSubmitting(false);
  }, [open, job]);

  // Body-scroll lock + Escape dismiss while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape' && !submitting) onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const deadlineDate = deadline ? new Date(deadline) : null;
  const deadlineValid = !!deadlineDate
    && Number.isFinite(deadlineDate.getTime())
    && deadlineDate.getTime() > Date.now();
  const canSubmit = deadlineValid && !submitting;

  // Build the payload. application_deadline is always included.
  // Content fields are only added when the advanced panel is open
  // — that way a "date-only" reactivation stays date-only and
  // doesn't flip admin_status to pending unnecessarily.
  function buildPayload() {
    const payload = {
      application_deadline: new Date(deadline).toISOString(),
    };
    if (showAdvanced) {
      const trim = (v) => (v == null ? '' : String(v).trim());
      if (trim(title)) payload.title = trim(title);
      if (trim(description)) payload.description = trim(description);
      if (trim(requirements) !== trim(job?.requirements)) payload.requirements = trim(requirements) || null;
      const skillsArr = skills.split(',').map((s) => s.trim()).filter(Boolean);
      payload.skills_tags = skillsArr;
      if (salaryMin !== '') payload.salary_min = Number(salaryMin);
      if (salaryMax !== '') payload.salary_max = Number(salaryMax);
      if (trim(location) !== trim(job?.location)) payload.location = trim(location) || null;
    }
    return payload;
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm?.(buildPayload());
    } catch (e) {
      setError(e?.message || 'Could not reactivate the job. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose?.(); }}
      data-testid="reactivate-job-modal"
    >
      <div className="modal" style={{ maxWidth: 620, gridTemplateColumns: '1fr' }}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
          type="button"
          disabled={submitting}
        >×</button>
        <div className="modal-form" style={{ padding: '32px 28px' }}>
          <h2 style={{ marginBottom: 4 }}>Reactivate this job?</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {job?.title ? <strong>{job.title}</strong> : 'This job'} will go back into the public feed
            once you set a new application deadline. Date-only changes go live
            immediately. Editing the description, requirements, salary or skills
            sends the posting back to super-admin for re-approval.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="reactivate-deadline" style={fieldLabelStyle}>
              New application deadline *
            </label>
            <input
              id="reactivate-deadline"
              type="date"
              value={deadline}
              min={todayIso()}
              onChange={(e) => setDeadline(e.target.value)}
              style={inputStyle}
              required
              data-testid="reactivate-deadline"
            />
            {deadline && !deadlineValid && (
              <div style={{ fontSize: 12, color: 'var(--coral-deep, #C73E1D)', marginTop: 6 }}>
                Deadline must be a future date.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="btn btn-ghost"
            style={{ marginBottom: 16, padding: '6px 0', background: 'transparent', textAlign: 'left' }}
            data-testid="reactivate-toggle-advanced"
          >
            {showAdvanced
              ? '− Hide job-detail edits'
              : '+ Also update job details (requires admin re-approval)'}
          </button>

          {showAdvanced && (
            <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={fieldLabelStyle}>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle}
                  maxLength={200}
                  data-testid="reactivate-title"
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
                  maxLength={20000}
                  data-testid="reactivate-description"
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Requirements</label>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                  maxLength={10000}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Required skills (comma-separated)</label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="React, Node.js, PostgreSQL"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabelStyle}>Salary min</label>
                  <input
                    type="number"
                    min={0}
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabelStyle}>Salary max</label>
                  <input
                    type="number"
                    min={0}
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={fieldLabelStyle}>Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Karachi, Remote…"
                  style={inputStyle}
                  maxLength={190}
                />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 12,
              background: '#fde9e3', color: '#b3361b', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >Cancel</button>
            <button
              type="button"
              className="btn btn-coral"
              onClick={handleConfirm}
              disabled={!canSubmit}
              data-testid="reactivate-confirm"
              aria-busy={submitting}
            >
              {submitting ? 'Reactivating…' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
