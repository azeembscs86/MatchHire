/**
 * MonthYearPicker
 *
 * Themed month + year selector for the Profile page's work-history
 * date fields. Drop-in replacement for `<input type="month">`:
 * accepts and emits the same `"YYYY-MM"` string shape so the
 * existing `toMonthInput()` / `fromMonthInput()` helpers in
 * WorkExperienceCard keep working — and the backend payload
 * (`YYYY-MM-01` ISO date) is unchanged.
 *
 * Why a custom picker?
 *   - Native `<input type="month">` UI varies wildly across
 *     browsers (tiny on iOS Safari, no calendar on Firefox)
 *     and can't be themed.
 *   - Two `<select>` dropdowns are 100% themeable, fully
 *     keyboard-accessible, mobile-friendly out of the box, and
 *     match the project's coral/bone/ink palette.
 *
 * Year range:
 *   - Hard-coded floor: 2000
 *   - Ceiling: `new Date().getFullYear()` — computed on every
 *     render so a new year doesn't require a deploy.
 *   - Future MONTHS within the current year are rendered
 *     `disabled` and skipped on auto-correct.
 *
 * Validation:
 *   - `min` / `max` props (each `YYYY-MM`) further constrain the
 *     selectable range. End-date picker passes `min={startDate}`
 *     so the user can't pick a finish date before they started.
 *   - When the supplied `value` is out of the [min, max] band the
 *     component renders an inline error and surfaces it via
 *     `onValidate?.(errorMessage | null)` for the parent.
 *
 * @param {object} props
 * @param {string} props.value         Current value `"YYYY-MM"` (or empty).
 * @param {(v: string) => void} props.onChange  Emits `"YYYY-MM"` or `""`.
 * @param {string} [props.min]         Lower bound `"YYYY-MM"`, default `"2000-01"`.
 * @param {string} [props.max]         Upper bound `"YYYY-MM"`, default current month.
 * @param {boolean} [props.disabled]   Read-only mode.
 * @param {string} [props.id]          For label `htmlFor` association.
 * @param {string} [props.ariaLabel]   Fallback accessible label.
 * @param {string} [props.placeholder] Shown on the year select when empty.
 * @param {(err: string|null) => void} [props.onValidate]
 *        Called whenever the picker's validity changes — parent can
 *        surface its own copy of the error if it wants to.
 */
import { useEffect, useMemo, useState } from 'react';

const FLOOR_YEAR = 2000;
const MONTHS = [
  { value: '01', label: 'January'  },
  { value: '02', label: 'February' },
  { value: '03', label: 'March'    },
  { value: '04', label: 'April'    },
  { value: '05', label: 'May'      },
  { value: '06', label: 'June'     },
  { value: '07', label: 'July'     },
  { value: '08', label: 'August'   },
  { value: '09', label: 'September'},
  { value: '10', label: 'October'  },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

/** Split a `"YYYY-MM"` value into `{ year, month }` strings, or empties. */
function split(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { year: '', month: '' };
  const [year, month] = s.split('-');
  return { year, month };
}

/** Combine year + month back to `"YYYY-MM"`, or empty if either is missing. */
function join(year, month) {
  if (!year || !month) return '';
  return `${year}-${month}`;
}

/** `"YYYY-MM"` of the current month — used as the default max. */
function currentMonthYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Compare two `"YYYY-MM"` strings lexicographically. Returns -1/0/1.
 * Empty strings sort first.
 */
function cmp(a, b) {
  const A = String(a || '');
  const B = String(b || '');
  if (A === B) return 0;
  return A < B ? -1 : 1;
}

export default function MonthYearPicker({
  value,
  onChange,
  min = `${FLOOR_YEAR}-01`,
  max,
  disabled = false,
  id,
  ariaLabel,
  placeholder = 'Year',
  onValidate,
}) {
  const effectiveMax = max || currentMonthYear();
  const { year, month } = split(value);

  // Year list — recomputed on every render so the ceiling tracks
  // `new Date().getFullYear()` automatically when the calendar rolls over.
  const years = useMemo(() => {
    const minYear = Math.max(FLOOR_YEAR, Number(min.slice(0, 4)) || FLOOR_YEAR);
    const maxYear = Number(effectiveMax.slice(0, 4)) || new Date().getFullYear();
    // Descending so the most recent years come first — matches user expectation.
    const out = [];
    for (let y = maxYear; y >= minYear; y -= 1) out.push(String(y));
    return out;
  }, [min, effectiveMax]);

  // Validate the CURRENT value against [min, max] and surface any error.
  const error = useMemo(() => {
    if (!value) return null;
    if (cmp(value, min) < 0) return `Pick a date on or after ${min}.`;
    if (cmp(value, effectiveMax) > 0) {
      return effectiveMax === currentMonthYear()
        ? 'Future dates aren’t allowed.'
        : `Pick a date on or before ${effectiveMax}.`;
    }
    return null;
  }, [value, min, effectiveMax]);

  // Tell the parent whenever validity flips. Effect (not direct
  // call) so we don't double-fire during render.
  useEffect(() => { onValidate?.(error); }, [error, onValidate]);

  /** When the user changes year or month, re-emit the combined value. */
  function setYear(nextYear) {
    if (!nextYear) { onChange?.(''); return; }
    // Re-validate the month: if we land in a year/month combo that
    // exceeds `effectiveMax`, snap month down so the user doesn't
    // sit on an invalid state.
    let nextMonth = month;
    if (nextMonth) {
      const candidate = join(nextYear, nextMonth);
      if (cmp(candidate, effectiveMax) > 0) {
        nextMonth = effectiveMax.slice(5, 7);
      } else if (cmp(candidate, min) < 0) {
        nextMonth = min.slice(5, 7);
      }
    }
    onChange?.(join(nextYear, nextMonth));
  }
  function setMonth(nextMonth) {
    if (!nextMonth) { onChange?.(join(year, '')); return; }
    onChange?.(join(year, nextMonth));
  }

  /** Is `MM` selectable in the currently picked year? */
  function monthDisabled(mm) {
    if (!year) return false;
    const candidate = join(year, mm);
    return cmp(candidate, min) < 0 || cmp(candidate, effectiveMax) > 0;
  }

  // Shared inline-style for both selects so the theme stays
  // consistent without dragging in a new CSS file. Hover/focus
  // states applied via a small CSS-in-JS attribute toggle.
  const selectStyle = {
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    background: disabled ? 'var(--bone-2)' : 'var(--paper, #fff)',
    color: 'var(--ink)',
    border: `1px solid ${error ? 'var(--coral)' : 'var(--line)'}`,
    borderRadius: 10,
    padding: '10px 32px 10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    width: '100%',
    transition: 'border-color .15s, box-shadow .15s',
    backgroundImage:
      'url("data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"12\\" height=\\"12\\" viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"%236B6258\\" stroke-width=\\"2.4\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><polyline points=\\"6 9 12 15 18 9\\"/></svg>")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  };

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1.5fr) minmax(96px, 1fr)',
          gap: 8,
        }}
      >
        {/* Month select */}
        <select
          id={id ? `${id}-month` : undefined}
          aria-label={ariaLabel ? `${ariaLabel} — month` : 'Month'}
          aria-invalid={!!error}
          disabled={disabled || !year}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={selectStyle}
          onFocus={(e) => { e.target.style.borderColor = error ? 'var(--coral-deep)' : 'var(--ink)'; e.target.style.boxShadow = '0 0 0 3px rgba(232,93,60,.15)'; }}
          onBlur={(e) => { e.target.style.borderColor = error ? 'var(--coral)' : 'var(--line)'; e.target.style.boxShadow = 'none'; }}
        >
          <option value="">Month</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value} disabled={monthDisabled(m.value)}>
              {m.label}{monthDisabled(m.value) ? ' – unavailable' : ''}
            </option>
          ))}
        </select>

        {/* Year select */}
        <select
          id={id ? `${id}-year` : id}
          aria-label={ariaLabel ? `${ariaLabel} — year` : 'Year'}
          aria-invalid={!!error}
          disabled={disabled}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={selectStyle}
          onFocus={(e) => { e.target.style.borderColor = error ? 'var(--coral-deep)' : 'var(--ink)'; e.target.style.boxShadow = '0 0 0 3px rgba(232,93,60,.15)'; }}
          onBlur={(e) => { e.target.style.borderColor = error ? 'var(--coral)' : 'var(--line)'; e.target.style.boxShadow = 'none'; }}
        >
          <option value="">{placeholder}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Inline validation message — matches the form's existing error tone. */}
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 6, fontSize: 12, color: 'var(--coral-deep, #C73E1D)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span aria-hidden="true">⚠</span>{error}
        </div>
      )}
    </div>
  );
}
