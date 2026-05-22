/**
 * MonthYearDatePicker
 *
 * Popover-style month + year picker — the "modern" replacement for
 * the older two-select `MonthYearPicker`. Same `YYYY-MM` wire shape
 * so the WorkExperienceCard form, `fromMonthInput()` helper, and
 * backend payload (`YYYY-MM-01`) are unchanged.
 *
 * UX
 * --
 *   - Renders as a single input-shaped button:
 *
 *         ┌──────────────────────────────────┐
 *         │ 📅  May 2018                  ▾ │
 *         └──────────────────────────────────┘
 *
 *     Clicking opens a popover with a year `<select>` at the top
 *     and a 4×3 month grid below. Selecting a month emits the new
 *     value and closes the popover.
 *
 *   - Future months disabled (calendar respects `max`, default =
 *     current month). End-date picker is also floored by the
 *     supplied `min` (typically the chosen start date).
 *
 *   - Inline error rendered below the field — coral on the bottom
 *     border + a short message — so validation reads naturally
 *     inside the form layout.
 *
 *   - Keyboard accessible: Enter/Space toggles the popover from the
 *     button; Esc closes; Tab walks the year select → month grid in
 *     reading order.
 *
 *   - Outside-click closes the popover so it doesn't fight with
 *     other inputs.
 *
 * Year range
 * ----------
 *   - Hard floor: 1990 (per product spec — earlier-career roles)
 *   - Ceiling: `new Date().getFullYear()` — recomputed every render
 *     so a calendar rollover doesn't need a redeploy
 *   - `min`/`max` props further constrain the selectable range
 *     within those bounds.
 *
 * Props
 * -----
 *   value         current `"YYYY-MM"` string (or empty)
 *   onChange      called with the new `"YYYY-MM"` value
 *   min           `"YYYY-MM"` lower bound (default `"1990-01"`)
 *   max           `"YYYY-MM"` upper bound (default = current month)
 *   disabled      read-only
 *   placeholder   button label when value is empty
 *   id            for label htmlFor association
 *   ariaLabel     accessible label override
 *   errorText     when truthy, renders below the field and tints
 *                 the border coral
 */
import { useEffect, useMemo, useRef, useState } from 'react';

const FLOOR_YEAR = 1990;

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Split `"YYYY-MM"` to `{ year, month }` strings, or empties. */
function split(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { year: '', month: '' };
  const [y, m] = s.split('-');
  return { year: y, month: m };
}

/** `"YYYY-MM"` of the current month — default ceiling. */
function currentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Compare `"YYYY-MM"` strings lexicographically. */
function cmp(a, b) {
  const A = String(a || ''); const B = String(b || '');
  if (A === B) return 0;
  return A < B ? -1 : 1;
}

/** Format a `"YYYY-MM"` for display: "May 2018". */
function format(value) {
  const { year, month } = split(value);
  if (!year || !month) return '';
  return `${MONTH_FULL[Number(month) - 1]} ${year}`;
}

export default function MonthYearDatePicker({
  value,
  onChange,
  min = `${FLOOR_YEAR}-01`,
  max,
  disabled = false,
  placeholder = 'Pick month',
  id,
  ariaLabel,
  errorText,
}) {
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);

  const effectiveMax = max || currentMonthYear();
  const { year, month } = split(value);

  // The currently-displayed year inside the popover. Defaults to
  // the selected year, else the max year so we land near "today".
  const [popoverYear, setPopoverYear] = useState(
    year || effectiveMax.slice(0, 4)
  );

  // Re-sync popover year if the parent's value changes externally
  // (e.g. edit mode loads an existing experience).
  useEffect(() => {
    if (year) setPopoverYear(year);
  }, [year]);

  // Year list — descending so the most recent years are at the top.
  const years = useMemo(() => {
    const minYear = Math.max(FLOOR_YEAR, Number(min.slice(0, 4)) || FLOOR_YEAR);
    const maxYear = Number(effectiveMax.slice(0, 4)) || new Date().getFullYear();
    const out = [];
    for (let y = maxYear; y >= minYear; y -= 1) out.push(String(y));
    return out;
  }, [min, effectiveMax]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Is `MM` in `popoverYear` selectable given min/max? */
  function monthDisabled(mm) {
    const candidate = `${popoverYear}-${mm}`;
    return cmp(candidate, min) < 0 || cmp(candidate, effectiveMax) > 0;
  }

  function pickMonth(mm) {
    if (monthDisabled(mm)) return;
    onChange?.(`${popoverYear}-${mm}`);
    setOpen(false);
    // Return focus to the button for accessibility.
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function toggleOpen() {
    if (disabled) return;
    setOpen((v) => !v);
  }

  const displayed = format(value);
  const hasError = !!errorText;
  const borderColor = hasError
    ? 'var(--coral, #E85D3C)'
    : open ? 'var(--ink, #0E1116)' : 'var(--line, #E2D9C7)';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Input-shaped trigger button */}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel || 'Pick month and year'}
        aria-invalid={hasError || undefined}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', textAlign: 'left',
          padding: '10px 12px',
          fontSize: 14, fontFamily: 'inherit',
          color: 'var(--ink, #0E1116)',
          background: disabled ? 'var(--bone-2, #EFE8DA)' : 'var(--paper, #fff)',
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'border-color .15s, box-shadow .15s',
          boxShadow: open ? '0 0 0 3px rgba(232,93,60,.15)' : 'none',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 16, opacity: 0.65 }}>📅</span>
        <span style={{ flex: 1, color: displayed ? 'inherit' : 'var(--muted, #6B6258)' }}>
          {displayed || placeholder}
        </span>
        <svg
          aria-hidden="true"
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: 'var(--muted, #6B6258)',
            transition: 'transform .2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Inline error — coral text below the field */}
      {hasError && (
        <div role="alert" style={{
          marginTop: 6, fontSize: 12, color: 'var(--coral-deep, #C73E1D)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span aria-hidden="true">⚠</span>{errorText}
        </div>
      )}

      {/* Popover */}
      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Select month and year"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0,
            zIndex: 20, width: 280, padding: 14,
            background: 'var(--paper, #fff)',
            border: '1px solid var(--line, #E2D9C7)',
            borderRadius: 14,
            boxShadow: '0 10px 30px rgba(14,17,22,0.08)',
          }}
        >
          {/* Year select */}
          <label style={{
            display: 'block', fontSize: 11, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--muted, #6B6258)',
            fontWeight: 600, marginBottom: 6,
          }}>
            Year
          </label>
          <select
            value={popoverYear}
            onChange={(e) => setPopoverYear(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px',
              fontSize: 14, fontFamily: 'inherit',
              border: '1px solid var(--line, #E2D9C7)',
              borderRadius: 8, background: '#fff',
              cursor: 'pointer', outline: 'none',
              marginBottom: 14,
            }}
            aria-label="Pick year"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Month grid */}
          <label style={{
            display: 'block', fontSize: 11, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--muted, #6B6258)',
            fontWeight: 600, marginBottom: 6,
          }}>
            Month
          </label>
          <div
            role="grid"
            aria-label={`Months of ${popoverYear}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}
          >
            {MONTH_LABELS.map((label, i) => {
              const mm = String(i + 1).padStart(2, '0');
              const isSelected = year === popoverYear && month === mm;
              const isDisabled = monthDisabled(mm);
              return (
                <button
                  key={mm}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onClick={() => pickMonth(mm)}
                  style={{
                    padding: '8px 0', fontSize: 13, fontFamily: 'inherit',
                    border: '1px solid ' + (isSelected ? 'var(--coral, #E85D3C)' : 'var(--line, #E2D9C7)'),
                    borderRadius: 8,
                    background: isSelected
                      ? 'var(--coral, #E85D3C)'
                      : isDisabled ? 'var(--bone-2, #EFE8DA)' : '#fff',
                    color: isSelected
                      ? '#fff'
                      : isDisabled ? 'var(--muted-2, #8B8278)' : 'var(--ink, #0E1116)',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.55 : 1,
                    transition: 'background .12s, border-color .12s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Footer hint + clear */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 12, fontSize: 11, color: 'var(--muted, #6B6258)',
          }}>
            <span>Future months disabled</span>
            {value && (
              <button
                type="button"
                onClick={() => { onChange?.(''); setOpen(false); }}
                style={{
                  background: 'transparent', border: 0,
                  color: 'var(--coral, #E85D3C)', cursor: 'pointer',
                  fontSize: 11, padding: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
