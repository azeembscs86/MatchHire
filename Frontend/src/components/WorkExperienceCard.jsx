/**
 * WorkExperienceCard
 *
 * Multi-row work-history editor for the Profile page. Each row in
 * `experiences` is rendered either as a compact summary (when
 * collapsed) or as a full edit form (when expanded — which is also
 * how new "add another role" rows appear).
 *
 * State model:
 *   - `experiences`     parent-owned list of saved rows (source of truth)
 *   - `draft`           the row currently being edited (id when editing
 *                       an existing row, null when adding a new one)
 *   - `busy`            blocks the Save button while a request is in flight
 *
 * The component is fully controlled from the outside — every CRUD
 * call goes through the wrappers passed in via props so the Profile
 * page can re-pull completion / publish state at the same moment.
 */
import { useEffect, useState } from 'react';
import { candidatesApi } from '../api/index.js';
import MonthYearDatePicker from './MonthYearDatePicker.jsx';

const BLANK = {
  company: '',
  title: '',
  start_date: '',
  end_date: '',
  is_current: false,
  description: '',
};

function toMonthInput(d) {
  // Backend sends ISO `YYYY-MM-DD` (or full datetime). The <input type="month">
  // control expects `YYYY-MM`; trim the day.
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return s.length === 10 ? s.slice(0, 7) : s;
}

function fromMonthInput(m) {
  // Persist as the first-of-month date so the column type is a clean DATE.
  if (!m) return null;
  return /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : m;
}

function monthLabel(d) {
  if (!d) return '';
  const s = String(d).slice(0, 7);
  const [y, mo] = s.split('-');
  if (!y || !mo) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(mo) - 1] || mo} ${y}`;
}

export default function WorkExperienceCard({ experiences, onChange, onAfterWrite }) {
  // `editingId === 0` means "adding a new role"; `null` means nothing open.
  const [editingId, setEditingId] = useState(null);
  /*
   * Transient success banner — shows for 4 seconds after a save
   * or delete so the user has unambiguous feedback that their
   * action persisted. Surfaces the new total count so adding a
   * 2nd / 3rd / 4th experience is obviously distinct from
   * "saved over the first one".
   */
  const [successText, setSuccessText] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function startAdd() {
    setEditingId(0);
    setDraft({ ...BLANK });
    setError(null);
  }

  function startEdit(exp) {
    setEditingId(exp.id);
    setDraft({
      company: exp.company || '',
      title: exp.title || '',
      start_date: toMonthInput(exp.start_date),
      end_date: toMonthInput(exp.end_date),
      is_current: !!exp.is_current,
      description: exp.description || '',
    });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setDraft(BLANK);
    setError(null);
  }

  async function save(e) {
    e?.preventDefault?.();
    if (busy) return;
    if (!draft.company.trim() || !draft.title.trim() || !draft.start_date) {
      setError({ message: 'Company, title, and start date are required.' });
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      company: draft.company.trim(),
      title: draft.title.trim(),
      start_date: fromMonthInput(draft.start_date),
      end_date: draft.is_current ? null : fromMonthInput(draft.end_date),
      is_current: !!draft.is_current,
      description: draft.description?.trim() || null,
    };
    try {
      const wasEditing = !!(editingId && editingId > 0);
      if (wasEditing) {
        await candidatesApi.experience.update(editingId, payload);
      } else {
        await candidatesApi.experience.create(payload);
      }
      // Refetch the full list so the new/updated row appears with
      // its server-assigned id + canonical date format.
      const data = await candidatesApi.experience.list();
      const nextList = data?.experiences || [];
      onChange?.(nextList);
      onAfterWrite?.();
      cancel();
      // Visible confirmation — auto-dismiss after 4s. Total count
      // makes "I added another one" feel different from "I edited
      // the existing one".
      const total = nextList.length;
      setSuccessText(
        wasEditing
          ? `Experience updated. ${total} total on your profile.`
          : `Experience added. ${total} total on your profile.`
      );
      setTimeout(() => setSuccessText(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (busy) return;
    if (!confirm('Remove this work experience?')) return;
    setBusy(true);
    setError(null);
    try {
      await candidatesApi.experience.remove(id);
      const data = await candidatesApi.experience.list();
      const nextList = data?.experiences || [];
      onChange?.(nextList);
      onAfterWrite?.();
      if (editingId === id) cancel();
      setSuccessText(`Experience removed. ${nextList.length} remaining.`);
      setTimeout(() => setSuccessText(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const isEmpty = experiences.length === 0 && editingId == null;

  // Render newest-first so a freshly-added row visibly surfaces at
  // the top. `is_current` always sorts ahead of past roles; then
  // sorted by start_date desc.
  const sortedExperiences = [...experiences].sort((a, b) => {
    if (!!a.is_current !== !!b.is_current) return a.is_current ? -1 : 1;
    return String(b.start_date || '').localeCompare(String(a.start_date || ''));
  });

  return (
    <div className="form-card">
      <div className="form-card-head">
        <h3>
          Work experience
          {experiences.length > 0 && (
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 500,
              padding: '2px 10px', borderRadius: 100,
              background: 'var(--bone, #f5f0e6)',
              color: 'var(--muted, #6B6258)',
            }}>
              {experiences.length} role{experiences.length === 1 ? '' : 's'}
            </span>
          )}
        </h3>
        <span className="step">04 / 05</span>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fde9e3', color: '#b3361b', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error.message || 'Could not save experience.'}
        </div>
      )}

      {successText && (
        <div role="status" style={{ background: '#e6f4ea', color: '#0f5132', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ✓ {successText}
        </div>
      )}

      {isEmpty && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Add the roles that shaped your career. Recruiters look here first.
        </p>
      )}

      {/* Saved entries — collapsed summary view (newest first) */}
      {sortedExperiences.map((exp) => {
        if (editingId === exp.id) {
          return (
            <ExperienceForm
              key={exp.id}
              draft={draft}
              setDraft={setDraft}
              onCancel={cancel}
              onSave={save}
              busy={busy}
              error={error}
              onClearError={() => setError(null)}
            />
          );
        }
        return (
          <div
            key={exp.id}
            style={{
              padding: '14px 16px',
              background: 'var(--bone)',
              borderRadius: 10,
              marginBottom: 10,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 500 }}>
                {exp.title}
                {exp.is_current ? <span className="muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>· Current role</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {exp.company} · {monthLabel(exp.start_date)} – {exp.is_current ? 'Present' : monthLabel(exp.end_date) || '—'}
              </div>
              {exp.description ? (
                <div style={{ fontSize: 13, color: '#2C2C2C', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                  {exp.description}
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => startEdit(exp)} style={{ padding: '6px 12px', fontSize: 12 }}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => remove(exp.id)}
                style={{ padding: '6px 12px', fontSize: 12, color: 'var(--coral-deep)' }}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {/* Add-new form (when editingId === 0) */}
      {editingId === 0 && (
        <ExperienceForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancel}
          onSave={save}
          busy={busy}
          error={error}
          onClearError={() => setError(null)}
        />
      )}

      {editingId == null && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={startAdd}
          style={{ marginTop: experiences.length ? 4 : 8 }}
        >
          + Add another role
        </button>
      )}
    </div>
  );
}

/**
 * Inline form for one experience row. Used by both "edit existing"
 * and "add new" paths so the layout is identical.
 */
function ExperienceForm({ draft, setDraft, onCancel, onSave, busy, error, onClearError }) {
  function update(patch) { setDraft((d) => ({ ...d, ...patch })); }

  /*
   * `triedSave` gates the inline validation messages. The form opens
   * clean (no red banner, no red inline messages) until the user has
   * actually clicked Save. After a failed save, errors appear and
   * stay visible until the user fixes them — at which point a
   * `useEffect` below clears the banner so the form looks healthy
   * again the moment the fields become valid.
   */
  const [triedSave, setTriedSave] = useState(false);

  const isCompanyMissing = !draft.company?.trim();
  const isTitleMissing = !draft.title?.trim();
  const isStartMissing = !draft.start_date;

  // Auto-clear the parent-owned banner the moment all required
  // fields are filled. Matches the spec rule:
  //   "Hide error immediately after fields are valid."
  useEffect(() => {
    if (!error) return;
    if (!isCompanyMissing && !isTitleMissing && !isStartMissing) {
      onClearError?.();
    }
  }, [error, isCompanyMissing, isTitleMissing, isStartMissing, onClearError]);

  return (
    <div style={{ padding: '14px 0 6px', borderTop: '1px dashed var(--line)', marginTop: 4 }}>
      <div className="form-row">
        <div className="form-field">
          <label>Company *</label>
          <input
            value={draft.company}
            onChange={(e) => update({ company: e.target.value })}
            placeholder="Acme Inc."
            maxLength={190}
            aria-invalid={triedSave && isCompanyMissing || undefined}
            style={triedSave && isCompanyMissing
              ? { borderColor: 'var(--coral, #E85D3C)' }
              : undefined}
          />
          {triedSave && isCompanyMissing && (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: 'var(--coral-deep, #C73E1D)' }}>
              ⚠ Company is required.
            </div>
          )}
        </div>
        <div className="form-field">
          <label>Job title *</label>
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Senior Frontend Engineer"
            maxLength={190}
            aria-invalid={triedSave && isTitleMissing || undefined}
            style={triedSave && isTitleMissing
              ? { borderColor: 'var(--coral, #E85D3C)' }
              : undefined}
          />
          {triedSave && isTitleMissing && (
            <div role="alert" style={{ marginTop: 6, fontSize: 12, color: 'var(--coral-deep, #C73E1D)' }}>
              ⚠ Job title is required.
            </div>
          )}
        </div>
      </div>
      <div className="form-row">
        {/*
         * Modern popover date pickers (year list + month grid +
         * calendar icon) replacing the older dual-select shape.
         * Both emit "YYYY-MM" so `fromMonthInput()`/`toMonthInput()`
         * + the `YYYY-MM-01` backend payload are unchanged.
         *
         * Year range: 1990 → current year (live via
         * `new Date().getFullYear()`). Future months disabled.
         * The end-date picker's `min` is the start date, so
         * picking an end before start is impossible at the UI
         * level (no need for a post-validation race).
         */}
        <div className="form-field">
          <label htmlFor="exp-start-date">Start date *</label>
          <MonthYearDatePicker
            id="exp-start-date"
            ariaLabel="Start date"
            value={draft.start_date}
            onChange={(v) => update({ start_date: v })}
            placeholder="Pick start month"
            // Inline error shown ONLY after a save attempt: see
            // `triedSave` gate below. Avoids the "validation
            // shouting on page load" UX problem.
            errorText={triedSave && !draft.start_date ? 'Start date is required.' : null}
          />
        </div>
        <div className="form-field">
          <label htmlFor="exp-end-date">End date</label>
          <MonthYearDatePicker
            id="exp-end-date"
            ariaLabel="End date"
            value={draft.is_current ? '' : draft.end_date}
            // Floor end-date at the chosen start month.
            min={draft.start_date || undefined}
            disabled={draft.is_current}
            onChange={(v) => update({ end_date: v })}
            placeholder={draft.is_current ? 'Present' : 'Pick end month'}
          />
        </div>
      </div>
      <div className="form-row single">
        <div className="form-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="exp-current"
            type="checkbox"
            checked={draft.is_current}
            onChange={(e) => update({ is_current: e.target.checked, ...(e.target.checked ? { end_date: '' } : {}) })}
            style={{ width: 16, height: 16, accentColor: 'var(--coral)' }}
          />
          <label htmlFor="exp-current" style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
            I currently work here
          </label>
        </div>
      </div>
      <div className="form-row single">
        <div className="form-field">
          <label>What you did</label>
          <textarea
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="One or two short paragraphs about your impact: what you shipped, the size of the team, and the outcomes you drove."
            maxLength={5000}
            style={{ minHeight: 110 }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {/*
         * Save click — flips `triedSave` on so inline errors render
         * BEFORE delegating to the parent's `onSave`. The new
         * popover date picker already prevents picking an end date
         * before start at the UI level, so we no longer need a
         * separate `hasDateError` race-condition guard.
         */}
        <button
          type="button"
          className="btn btn-coral"
          onClick={(e) => { setTriedSave(true); onSave?.(e); }}
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save role'}
        </button>
      </div>
    </div>
  );
}
