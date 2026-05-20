/**
 * SkillsPicker
 *
 * Multi-select skill input for the Candidate Profile. Replaces the
 * old "type and press enter" field with a proper picker:
 *
 *   - Type to search the catalogue (debounced 250ms)
 *   - Dropdown shows matching catalogue skills + a "Add custom"
 *     row that creates a new skill when no exact match exists
 *   - Selected skills render as chips with a remove (×) button
 *   - "Browse by category" panel toggles open to surface bulk-add
 *     buttons for each category
 *   - Min/max validation surfaced inline (defaults match the
 *     backend: min 3, max 30, name <= 80 chars)
 *   - Duplicate prevention (de-dupes by skill_id and by lowercased
 *     name)
 *
 * Behaviour:
 *   - The component owns the selection state. The parent passes
 *     `value` (current selection) and receives `onChange` calls so
 *     it can save when the user clicks "Save skills". The picker
 *     does NOT call the API directly — keeping API calls in the
 *     parent makes the save/cancel flow obvious.
 *
 * Props:
 *   value:       array of { id, name, category?, proficiency?,
 *                years_experience? } — the current selection
 *   onChange:    (next) => void — called whenever the selection
 *                changes (add, remove, custom add)
 *   minSkills?:  default 3
 *   maxSkills?:  default 30
 *   disabled?:   read-only mode
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { skillsApi } from '../api/index.js';

const DEFAULTS = { min: 3, max: 30, maxNameLen: 80 };

/** Tiny inline debounce — avoids adding a new hooks file. */
function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function lower(s) { return String(s || '').toLowerCase().trim(); }

export default function SkillsPicker({
  value = [],
  onChange,
  minSkills = DEFAULTS.min,
  maxSkills = DEFAULTS.max,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  // Map of selected skill_ids and lowercased names so add() can
  // de-dupe both flavours (catalogue pick + free-text custom).
  const selectedIds = useMemo(() => new Set(value.map((s) => s.id).filter(Boolean)), [value]);
  const selectedNames = useMemo(() => new Set(value.map((s) => lower(s.name))), [value]);

  const atMax = value.length >= maxSkills;
  const belowMin = value.length < minSkills;

  /* ---------- catalogue fetches ---------- */
  useEffect(() => {
    let cancelled = false;
    async function fetchSuggestions() {
      // Always fetch on focus (empty query → top alphabetical).
      setLoading(true);
      try {
        const data = await skillsApi.search(debouncedQuery, 12);
        if (!cancelled) setSuggestions(data?.records || []);
      } catch (_) {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (showSuggestions) fetchSuggestions();
    return () => { cancelled = true; };
  }, [debouncedQuery, showSuggestions]);

  async function loadCategories() {
    if (categories.length > 0 || categoriesLoading) return;
    setCategoriesLoading(true);
    try {
      const data = await skillsApi.categories();
      setCategories(data?.records || []);
    } catch (_) { /* surface inline */ }
    finally { setCategoriesLoading(false); }
  }

  /* ---------- close-on-outside-click ---------- */
  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /* ---------- mutators ---------- */
  function add(entry) {
    if (disabled || atMax) return;
    // Catalogue pick
    if (entry.id && selectedIds.has(entry.id)) return;
    // Free-text — de-dupe by name as well so "react.js" and "React.js" merge
    if (selectedNames.has(lower(entry.name))) return;
    onChange?.([...value, {
      id: entry.id || null,                  // null for unresolved free-text
      name: entry.name,
      category: entry.category || null,
      proficiency: entry.proficiency || 'intermediate',
      years_experience: entry.years_experience || 0,
      isCustom: !entry.id,
    }]);
    setQuery('');
  }

  function remove(idx) {
    if (disabled) return;
    const next = value.slice();
    next.splice(idx, 1);
    onChange?.(next);
  }

  function addCustomFromQuery() {
    const name = query.trim();
    if (!name) return;
    if (name.length > DEFAULTS.maxNameLen) return; // visible error below
    add({ name });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Prefer exact catalogue match if visible
      const exact = suggestions.find((s) => lower(s.name) === lower(query));
      if (exact) add(exact);
      else addCustomFromQuery();
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      // Remove last chip on backspace from empty input
      remove(value.length - 1);
    }
  }

  /* ---------- derived ---------- */
  const filteredSuggestions = useMemo(
    () => suggestions.filter((s) => !selectedIds.has(s.id)),
    [suggestions, selectedIds]
  );
  const showCustomRow = query.trim().length > 0
    && !filteredSuggestions.some((s) => lower(s.name) === lower(query))
    && !selectedNames.has(lower(query));
  const nameTooLong = query.length > DEFAULTS.maxNameLen;

  /* ---------- render ---------- */
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {/* Chips + input row */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
          minHeight: 44, border: '1px solid #e2e0db', borderRadius: 10,
          background: disabled ? '#f7f5ef' : '#fff',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((s, i) => (
          <span
            key={`${s.id || 'custom'}-${s.name}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 100, fontSize: 13,
              background: s.isCustom ? '#fff4e6' : 'var(--bone, #f5f0e6)',
              border: '1px solid ' + (s.isCustom ? '#e8b574' : '#e2e0db'),
              color: 'var(--ink, #1A1A1A)',
            }}
            title={s.category ? `Category: ${s.category}` : 'Custom skill'}
          >
            {s.name}
            {s.isCustom && (
              <span style={{ fontSize: 10, color: '#a06824', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                custom
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                aria-label={`Remove ${s.name}`}
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--muted, #6b6b6b)', fontSize: 16, lineHeight: 1, padding: 0,
                }}
              >×</button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled || atMax}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={onKeyDown}
          placeholder={atMax ? `Maximum ${maxSkills} skills reached` : value.length === 0 ? 'Search or type a skill…' : ''}
          style={{
            flex: '1 0 160px', minWidth: 160, border: 0, outline: 'none',
            padding: '4px 0', background: 'transparent', fontSize: 14,
          }}
          aria-label="Search skills"
        />
      </div>

      {/* Counter + browse-categories toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted, #6b6b6b)' }}>
        <div>
          <strong style={{ color: belowMin ? '#b3361b' : 'var(--ink, #1A1A1A)' }}>
            {value.length}
          </strong>
          {' / '}{maxSkills} selected
          {belowMin && <span style={{ marginLeft: 8, color: '#b3361b' }}>· at least {minSkills} required</span>}
          {nameTooLong && <span style={{ marginLeft: 8, color: '#b3361b' }}>· skill name max {DEFAULTS.maxNameLen} chars</span>}
        </div>
        <button
          type="button"
          onClick={() => { setShowCategories((v) => !v); loadCategories(); }}
          disabled={disabled}
          style={{
            background: 'transparent', border: '1px solid #e2e0db', borderRadius: 100,
            padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--ink, #1A1A1A)',
          }}
        >
          {showCategories ? 'Hide categories' : 'Browse by category'}
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && !disabled && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#fff', border: '1px solid #e2e0db', borderRadius: 10,
            maxHeight: 280, overflow: 'auto', zIndex: 10,
            boxShadow: '0 8px 24px rgba(26,26,26,0.08)',
          }}
          role="listbox"
        >
          {loading && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>Searching…</div>
          )}
          {!loading && filteredSuggestions.length === 0 && !showCustomRow && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>
              {query ? 'No matches in catalogue.' : 'Start typing or browse by category.'}
            </div>
          )}
          {!loading && filteredSuggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => add(s)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '10px 12px', border: 0, background: 'transparent',
                cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}
              onMouseDown={(e) => e.preventDefault()}
              role="option"
              aria-selected="false"
            >
              <span>{s.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted, #6b6b6b)' }}>{s.category}</span>
            </button>
          ))}
          {showCustomRow && !nameTooLong && (
            <button
              type="button"
              onClick={addCustomFromQuery}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '10px 12px', border: 0, borderTop: '1px solid #f1ece1',
                background: '#fff4e6', cursor: 'pointer', textAlign: 'left', fontSize: 14,
                color: '#a06824',
              }}
            >
              <span>+ Add &ldquo;{query.trim()}&rdquo; as a custom skill</span>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>custom</span>
            </button>
          )}
        </div>
      )}

      {/* Category browser panel */}
      {showCategories && !disabled && (
        <div
          style={{
            marginTop: 10, padding: 14, borderRadius: 12, background: 'var(--bone, #f5f0e6)',
            border: '1px solid #ede7da',
          }}
        >
          {categoriesLoading && <div style={{ fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>Loading categories…</div>}
          {!categoriesLoading && categories.map((g) => (
            <div key={g.category} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted, #6b6b6b)', marginBottom: 6 }}>
                {g.category} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {g.count}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.skills.map((s) => {
                  const already = selectedIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={already || atMax}
                      onClick={() => add({ ...s, category: g.category })}
                      style={{
                        padding: '4px 10px', borderRadius: 100, fontSize: 12,
                        background: already ? 'transparent' : '#fff',
                        border: '1px solid ' + (already ? '#cdc7b8' : '#e2e0db'),
                        color: already ? 'var(--muted, #6b6b6b)' : 'var(--ink, #1A1A1A)',
                        cursor: already || atMax ? 'default' : 'pointer',
                        opacity: already ? 0.5 : 1,
                      }}
                    >
                      {already ? '✓ ' : '+ '}{s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
