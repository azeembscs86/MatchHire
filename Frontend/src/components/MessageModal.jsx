/**
 * MessageModal
 *
 * Professional candidate-to-candidate messaging surface, opened
 * from the "Similar Professionals" feed and from another
 * candidate's detail page. Three guard rails the user can't talk
 * around:
 *
 *   - Server-side content filter (banned terms / phone / email
 *     patterns / off-platform contact hints).
 *   - Server-side similarity gate (>50% only).
 *   - Suggested templates for users who don't know how to open
 *     a professional message.
 *
 * The modal posts via `candidatesApi.sendMessage(...)`. Backend
 * errors (422 = blocked content, 403 = below similarity, 400 =
 * self-message, 404 = recipient gone) surface as inline status
 * messages with the server's exact wording.
 *
 * @param {object} props
 * @param {object} props.candidate     `{ id, name, current_title }`.
 * @param {function} props.onClose     Called when user closes.
 * @param {function} [props.onSent]    Called after a successful send.
 */
import { useEffect, useState } from 'react';
import { candidatesApi } from '../api/index.js';

const TEMPLATES = [
  {
    label: 'Discuss shared skills',
    subject: (n) => `Connecting on shared experience`,
    body: (n) => `Hi ${n}, I noticed we share similar skills. I'd love to ask about your experience with the stack you've been working on. Would you be open to a short professional discussion?`,
  },
  {
    label: 'Career guidance',
    subject: (n) => `Career guidance request`,
    body: (n) => `Hi ${n}, I'm exploring growth in a similar direction to your career path. Would you be open to sharing professional guidance on what worked for you?`,
  },
  {
    label: 'Technology deep-dive',
    subject: (n) => `Technical learning paths`,
    body: (n) => `Hi ${n}, I saw your experience in the tools we both use. I'd like to discuss professional learning paths and how you approached the trickier parts of the stack.`,
  },
];

function firstName(full) {
  return (full || '').trim().split(/\s+/)[0] || 'there';
}

export default function MessageModal({ candidate, onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  // Two distinct status slots: a soft hint (post-send success or
  // template applied) and a hard error (server reject).
  const [errorMsg, setErrorMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  // Close on Escape so the modal honours platform conventions.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function applyTemplate(tpl) {
    setSubject(tpl.subject(firstName(candidate.name)));
    setBody(tpl.body(firstName(candidate.name)));
    setErrorMsg(null);
    setOkMsg(`Loaded "${tpl.label}" template.`);
  }

  async function handleSend(e) {
    e?.preventDefault?.();
    if (sending) return;
    setErrorMsg(null);
    setOkMsg(null);
    if (body.trim().length < 10) {
      setErrorMsg('Message is too short — share a little more context.');
      return;
    }
    setSending(true);
    try {
      await candidatesApi.sendMessage(candidate.id, {
        subject: subject || null,
        body,
      });
      setOkMsg(`Message sent to ${firstName(candidate.name)}.`);
      onSent?.();
      // Auto-close on success so the user lands back on the list.
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      // Server returns 422 with the content-filter copy; 403 for
      // below-similarity. Surface whatever the server said.
      setErrorMsg(err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="msg-modal-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="msg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="msg-modal-title"
      >
        <header className="msg-modal-head">
          <div>
            <h3 id="msg-modal-title">Message {candidate.name}</h3>
            {candidate.current_title && (
              <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                {candidate.current_title}
              </p>
            )}
          </div>
          <button
            type="button"
            className="msg-modal-close"
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        <div className="msg-modal-templates">
          <span className="muted" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Quick templates
          </span>
          <div className="msg-template-row">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                className="msg-template-chip"
                onClick={() => applyTemplate(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form className="msg-modal-form" onSubmit={handleSend}>
          <label className="msg-modal-label">
            Subject <span className="muted">(optional)</span>
            <input
              type="text"
              className="msg-modal-input"
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Connecting on shared experience"
              disabled={sending}
            />
          </label>
          <label className="msg-modal-label">
            Message
            <textarea
              className="msg-modal-textarea"
              rows={6}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Keep it professional — career, skills, jobs, or networking."
              required
              disabled={sending}
            />
          </label>

          {errorMsg && (
            <div role="alert" className="msg-modal-error">{errorMsg}</div>
          )}
          {okMsg && !errorMsg && (
            <div role="status" className="msg-modal-ok">{okMsg}</div>
          )}

          <div className="msg-modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={sending}
            >Cancel</button>
            <button
              type="submit"
              className="btn btn-coral"
              disabled={sending || body.trim().length < 10}
              aria-busy={sending}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
