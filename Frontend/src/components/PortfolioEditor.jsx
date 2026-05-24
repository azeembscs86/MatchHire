/**
 * PortfolioEditor
 *
 * "Work Portfolio & Achievements" editor on the candidate Profile
 * page. One reusable surface for every kind of work evidence —
 * project, achievement, certificate, work sample, case study,
 * training, research, field experience, volunteer work, portfolio
 * link, publication, award.
 *
 * Behaviour
 *   - List shows existing items with edit + delete actions.
 *   - "Add evidence" pops a slide-down form that doubles as the
 *     edit form (one component, no two-page detour).
 *   - Submitting hits the candidate API; success refreshes the
 *     list and bumps the displayed portfolio-strength.
 *   - Each card carries an individual completeness score
 *     (server-computed) so the candidate can see which entries
 *     need more detail without clicking in.
 *
 * Non-goals (deferred):
 *   - File upload for `proof_file_url` — the `external_link`
 *     field covers the proof-URL case until the multer wiring
 *     ships. Field is in the schema and the editor reads it back
 *     when present.
 *   - AI suggestion helpers for title / description / impact —
 *     hooks left in place via the description field.
 */
import { useEffect, useState } from 'react';
import { candidatesApi } from '../api/index.js';

const ITEM_TYPES = [
  { value: 'project',          label: 'Project' },
  { value: 'achievement',      label: 'Achievement' },
  { value: 'certificate',      label: 'Certificate' },
  { value: 'work_sample',      label: 'Work sample' },
  { value: 'case_study',       label: 'Case study' },
  { value: 'training',         label: 'Training' },
  { value: 'research',         label: 'Research' },
  { value: 'field_experience', label: 'Field experience' },
  { value: 'volunteer',        label: 'Volunteer work' },
  { value: 'portfolio_link',   label: 'Portfolio link' },
  { value: 'publication',      label: 'Publication' },
  { value: 'award',            label: 'Award' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public',         label: 'Public — anyone can view' },
  { value: 'companies_only', label: 'Companies only (default)' },
  { value: 'private',        label: 'Private — only you' },
];

const EMPTY = {
  title: '',
  item_type: 'project',
  category: '',
  role_responsibility: '',
  skills_used: '',
  tools_used: '',
  description: '',
  impact: '',
  external_link: '',
  start_date: '',
  end_date: '',
  is_current: false,
  visibility: 'companies_only',
};

function listToCsv(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function formatRange(start, end, isCurrent) {
  const opt = { year: 'numeric', month: 'short' };
  const s = start ? new Date(start).toLocaleDateString(undefined, opt) : null;
  const e = isCurrent ? 'Present' : (end ? new Date(end).toLocaleDateString(undefined, opt) : null);
  if (!s && !e) return null;
  return [s, e].filter(Boolean).join(' – ');
}

/**
 * @param {object} props
 * @param {function} [props.onAfterWrite]  Called after every
 *   successful save / delete so the parent page (Profile) can
 *   refresh the completion score card.
 */
export default function PortfolioEditor({ onAfterWrite = null }) {
  const [state, setState] = useState({ records: [], strength: 0, loading: true, error: null });
  const [editing, setEditing] = useState(null); // null | 'new' | <id>
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await candidatesApi.portfolio.list();
      setState({
        records: data?.records || [],
        strength: Number(data?.portfolio_strength || 0),
        loading: false,
        error: null,
      });
    } catch (err) {
      setState({ records: [], strength: 0, loading: false, error: err });
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
    setErrorMsg(null);
  }

  function openEdit(item) {
    setForm({
      title: item.title || '',
      item_type: item.item_type || 'project',
      category: item.category || '',
      role_responsibility: item.role_responsibility || '',
      skills_used: listToCsv(item.skills_used),
      tools_used: listToCsv(item.tools_used),
      description: item.description || '',
      impact: item.impact || '',
      external_link: item.external_link || '',
      start_date: item.start_date ? item.start_date.slice(0, 10) : '',
      end_date: item.end_date ? item.end_date.slice(0, 10) : '',
      is_current: !!item.is_current,
      visibility: item.visibility || 'companies_only',
    });
    setEditing(item.id);
    setErrorMsg(null);
  }

  function cancel() {
    setEditing(null);
    setForm(EMPTY);
    setErrorMsg(null);
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (saving) return;
    if (!form.title || form.title.trim().length < 2) {
      setErrorMsg('Give your entry a short title (at least 2 characters).');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const payload = {
      ...form,
      skills_used: form.skills_used,   // server splits CSV or accepts array
      tools_used: form.tools_used,
      start_date: form.start_date || null,
      end_date: form.is_current ? null : (form.end_date || null),
      external_link: form.external_link || null,
    };
    try {
      if (editing === 'new') {
        await candidatesApi.portfolio.create(payload);
      } else {
        await candidatesApi.portfolio.update(editing, payload);
      }
      await load();
      cancel();
      onAfterWrite?.();
    } catch (err) {
      setErrorMsg(err?.message || 'Could not save your portfolio item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    try {
      await candidatesApi.portfolio.remove(item.id);
      await load();
      onAfterWrite?.();
    } catch (err) {
      window.alert(err?.message || 'Could not delete the item.');
    }
  }

  return (
    <div className="portfolio-editor">
      <header className="portfolio-head">
        <div>
          <h3>Work Portfolio &amp; Achievements</h3>
          <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
            Showcase your work, achievements, certificates, and career proof to help companies understand your real experience.
          </p>
        </div>
        <div className="portfolio-strength" title="Average completeness across your portfolio items">
          <span className="muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block' }}>
            Strength
          </span>
          <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 22 }}>{state.strength}%</strong>
        </div>
      </header>

      {!editing && (
        <div className="portfolio-actions-row">
          <button type="button" className="btn btn-coral" onClick={openNew}>
            + Add evidence
          </button>
        </div>
      )}

      {editing && (
        <form className="portfolio-form" onSubmit={handleSave}>
          <div className="portfolio-form-grid">
            <label className="portfolio-field portfolio-field-wide">
              <span>Title</span>
              <input
                type="text"
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Backend rewrite for ACME — Node.js + Redis"
                required
                disabled={saving}
              />
            </label>
            <label className="portfolio-field">
              <span>Type</span>
              <select
                value={form.item_type}
                onChange={(e) => setForm({ ...form, item_type: e.target.value })}
                disabled={saving}
              >
                {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="portfolio-field">
              <span>Category <small className="muted">(optional)</small></span>
              <input
                type="text"
                maxLength={120}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Backend engineering, ICU, Curriculum design"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Role / responsibility</span>
              <input
                type="text"
                maxLength={200}
                value={form.role_responsibility}
                onChange={(e) => setForm({ ...form, role_responsibility: e.target.value })}
                placeholder="What you owned end-to-end"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Skills used <small className="muted">(comma-separated)</small></span>
              <input
                type="text"
                value={form.skills_used}
                onChange={(e) => setForm({ ...form, skills_used: e.target.value })}
                placeholder="Node.js, MySQL, Redis, REST APIs"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Tools / equipment <small className="muted">(comma-separated)</small></span>
              <input
                type="text"
                value={form.tools_used}
                onChange={(e) => setForm({ ...form, tools_used: e.target.value })}
                placeholder="Docker, AWS, GitHub Actions, Postman"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Description</span>
              <textarea
                rows={4}
                maxLength={4000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What did you build / accomplish / solve?"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Impact / outcome <small className="muted">(measurable when possible)</small></span>
              <textarea
                rows={3}
                maxLength={2000}
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
                placeholder="e.g. Cut p95 latency from 800ms to 180ms"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>External link <small className="muted">(GitHub, Behance, publication URL …)</small></span>
              <input
                type="url"
                maxLength={500}
                value={form.external_link}
                onChange={(e) => setForm({ ...form, external_link: e.target.value })}
                placeholder="https://…"
                disabled={saving}
              />
            </label>
            <label className="portfolio-field">
              <span>Start date</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                disabled={saving}
              />
            </label>
            <label className="portfolio-field">
              <span>End date</span>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                disabled={saving || form.is_current}
              />
            </label>
            <label className="portfolio-field portfolio-field-checkbox">
              <input
                type="checkbox"
                checked={form.is_current}
                onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                disabled={saving}
              />
              <span>I'm currently working on this</span>
            </label>
            <label className="portfolio-field portfolio-field-wide">
              <span>Visibility</span>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                disabled={saving}
              >
                {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          {errorMsg && (
            <div role="alert" className="portfolio-form-error">{errorMsg}</div>
          )}
          <div className="portfolio-form-actions">
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-coral" disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : editing === 'new' ? 'Save evidence' : 'Update evidence'}
            </button>
          </div>
        </form>
      )}

      {state.loading ? (
        <p className="muted" style={{ fontSize: 13 }}>Loading portfolio…</p>
      ) : state.records.length === 0 && !editing ? (
        <div className="portfolio-empty">
          <p className="muted" style={{ margin: 0 }}>
            Showcase your work, achievements, certificates, and career proof to help companies understand your real experience.
          </p>
        </div>
      ) : (
        <ul className="portfolio-list">
          {state.records.map((item) => (
            <li key={item.id} className="portfolio-card">
              <div className="portfolio-card-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="portfolio-type">{(ITEM_TYPES.find((t) => t.value === item.item_type)?.label) || item.item_type}</div>
                  <h4 className="portfolio-title" title={item.title}>{item.title}</h4>
                  {item.role_responsibility && (
                    <p className="portfolio-role">{item.role_responsibility}</p>
                  )}
                </div>
                <div className="portfolio-card-meta">
                  <span className="portfolio-score" title="Completeness for this item">
                    {item.completeness_score}%
                  </span>
                  <span className={`portfolio-visibility v-${item.visibility}`}>
                    {(VISIBILITY_OPTIONS.find((o) => o.value === item.visibility)?.label.split(' —')[0]) || item.visibility}
                  </span>
                </div>
              </div>

              {formatRange(item.start_date, item.end_date, item.is_current) && (
                <p className="portfolio-dates">{formatRange(item.start_date, item.end_date, item.is_current)}</p>
              )}

              {item.description && (
                <p className="portfolio-description">{item.description}</p>
              )}

              {item.impact && (
                <p className="portfolio-impact"><strong>Impact: </strong>{item.impact}</p>
              )}

              {(item.skills_used?.length > 0 || item.tools_used?.length > 0) && (
                <div className="portfolio-tag-row">
                  {item.skills_used?.map((s) => (
                    <span key={`s-${s}`} className="portfolio-tag portfolio-tag-skill">{s}</span>
                  ))}
                  {item.tools_used?.map((s) => (
                    <span key={`t-${s}`} className="portfolio-tag portfolio-tag-tool">{s}</span>
                  ))}
                </div>
              )}

              {item.external_link && (
                <p className="portfolio-link">
                  <a href={item.external_link} target="_blank" rel="noopener noreferrer">
                    Proof / link ↗
                  </a>
                </p>
              )}

              <div className="portfolio-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>Edit</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(item)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
