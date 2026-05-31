/**
 * CompanyRejectionModal
 *
 * Mandatory-reason modal for rejecting a candidate's application.
 * Replaces the previous inline one-click reject button — the backend
 * validator (employer.validator.js → `rejectionReason`) requires a
 * canonical reason key, so a no-reason reject would always have
 * failed Joi validation.
 *
 * Reason catalogue is sourced from the shared
 * `data/rejection-reasons.js` module so the employer-side picker and
 * the candidate-side decoded-reason card always agree on labels.
 * "Other" reveals an inline text box and the Reject CTA stays
 * disabled until the candidate has supplied non-empty custom text.
 *
 * @param {boolean}  props.open
 * @param {string}   [props.candidateName]
 * @param {string}   [props.jobTitle]
 * @param {function} props.onClose      — call to dismiss without rejecting
 * @param {function} props.onConfirm    — async(reasonKey, customReason)
 */
import { useEffect, useState } from 'react';
import { REJECTION_REASONS } from '../data/rejection-reasons.js';

export default function CompanyRejectionModal({
  open,
  candidateName,
  jobTitle,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset modal state every time it opens. Without this, picking a
  // reason, closing, then re-opening would carry the prior selection
  // forward into the next reject.
  useEffect(() => {
    if (open) {
      setReason('');
      setCustomReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Lock body scroll while the modal is open so the page behind
  // doesn't scroll under the dialog.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const needsCustom = reason === 'other';
  const canSubmit = !!reason && (!needsCustom || customReason.trim().length > 0) && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm?.(reason, needsCustom ? customReason.trim() : undefined);
    } catch (e) {
      setError(e?.message || 'Could not reject the application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose?.(); }}
      data-testid="company-reject-modal"
    >
      <div className="modal" style={{ maxWidth: 560, gridTemplateColumns: '1fr' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close" type="button" disabled={submitting}>×</button>
        <div className="modal-form" style={{ padding: '32px 28px' }}>
          <h2 style={{ marginBottom: 4 }}>Reject application</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {candidateName ? <strong>{candidateName}</strong> : 'Candidate'}
            {jobTitle ? <> · applied for <em>{jobTitle}</em></> : null}
            . The reason you pick is shown on the candidate's dashboard along with improvement
            suggestions — be specific so it's useful to them.
          </p>

          <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }} disabled={submitting}>
            <legend style={{
              fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
              color: 'var(--muted)', fontWeight: 600, marginBottom: 10,
            }}>
              Reason (required)
            </legend>
            <div style={{ display: 'grid', gap: 8 }}>
              {REJECTION_REASONS.map((r) => (
                <label
                  key={r.key}
                  className={`reject-reason${reason === r.key ? ' is-active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px',
                    border: `1px solid ${reason === r.key ? 'var(--coral)' : 'var(--line)'}`,
                    borderRadius: 10, cursor: 'pointer',
                    background: reason === r.key ? 'var(--bone-2)' : 'var(--paper)',
                  }}
                >
                  <input
                    type="radio"
                    name="rejection-reason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    data-testid={`reject-reason-${r.key}`}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 14, color: 'var(--ink)' }}>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {needsCustom && (
            <div style={{ marginBottom: 14 }}>
              <label style={{
                fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
                color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8,
              }}>
                Custom reason (required)
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value.slice(0, 500))}
                placeholder="Briefly explain the rejection so the candidate can act on it…"
                rows={3}
                disabled={submitting}
                data-testid="reject-custom-reason"
                style={{
                  width: '100%', padding: 10, borderRadius: 10,
                  border: '1px solid var(--line)', fontSize: 14,
                  resize: 'vertical', minHeight: 80,
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>
                {customReason.length}/500
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
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
              data-testid="reject-confirm"
              aria-busy={submitting}
            >
              {submitting ? 'Rejecting…' : 'Reject application'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
