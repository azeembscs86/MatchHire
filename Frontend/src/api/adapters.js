/**
 * View-model adapters
 * -------------------
 * Map MatchHire API records into the prop shapes the existing card
 * components expect. The cards themselves stay design-neutral - they
 * still receive `{ co, l, cl, title, loc, ... }` so the visual output
 * is byte-for-byte identical to the original static design.
 *
 * Centralising this mapping here means every page calls a `to*` helper
 * and the card surface remains free of API knowledge.
 */

const LOGO_TONES = ['lg-1', 'lg-2', 'lg-3', 'lg-4', 'lg-5', 'lg-6', 'lg-7', 'lg-8'];

/**
 * Pick a deterministic logo tone from a stable id so the same company
 * always renders the same colour swatch across reloads.
 */
function toneFor(id) {
  const n = Math.abs(Number(id) || 0) || 0;
  return LOGO_TONES[n % LOGO_TONES.length];
}

function firstLetter(s) {
  const str = (s || '').trim();
  return str ? str[0].toUpperCase() : '·';
}

function splitTags(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return String(s).split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Format a salary range for display. UI-only — the backend storage
 * format (raw `salary_min`, `salary_max`, `salary_currency`,
 * `salary_period`) is untouched.
 *
 * Display convention (May 2031 unification):
 *   - Everything renders as MONTHLY. If the row already stores
 *     monthly figures (`salary_period === 'month'`/`'monthly'`) we
 *     use them as-is; otherwise we treat the values as annual and
 *     divide by 12.
 *   - Full thousands separators (no `120K` shorthand) so a candidate
 *     reads "PKR 500,000/month" rather than guessing what 500K means.
 *   - Currency symbol mapping: USD → "$", everything else uses the
 *     ISO code prefix ("PKR 100,000/month", "EUR 8,500/month").
 *   - Ranges share a single `/month` suffix.
 *
 * Examples:
 *   formatSalary(120000, 180000, 'USD', 'year')   → "$10,000 – 15,000/month"
 *   formatSalary(1200000, null, 'PKR', 'year')    → "From PKR 100,000/month"
 *   formatSalary(8500, 12000, 'EUR', 'month')     → "EUR 8,500 – 12,000/month"
 *   formatSalary(null, null, 'USD', 'year')       → "Competitive"
 */
function formatSalary(min, max, currency = 'USD', period = 'year') {
  if (!min && !max) return 'Competitive';
  const sym = currency === 'USD' ? '$' : `${currency} `;
  const isAlreadyMonthly = /^month/i.test(String(period || ''));
  const toMonth = (n) => {
    if (n == null) return null;
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    const monthly = isAlreadyMonthly ? num : num / 12;
    // Round to the nearest hundred so the figure reads cleanly
    // (avoids "PKR 99,166.67/month"). Sub-1k values keep their
    // unit to handle freelance hourly-but-tagged-yearly edge cases.
    if (monthly >= 1000) return Math.round(monthly / 100) * 100;
    return Math.round(monthly);
  };
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const monthMin = toMonth(min);
  const monthMax = toMonth(max);
  if (monthMin != null && monthMax != null) {
    return `${sym}${fmt(monthMin)} – ${fmt(monthMax)}/month`;
  }
  if (monthMin != null) return `From ${sym}${fmt(monthMin)}/month`;
  return `Up to ${sym}${fmt(monthMax)}/month`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

/** Map an experience_level enum to a human-readable label. */
function experienceLabel(level) {
  if (!level) return null;
  const map = {
    entry: 'Entry-level',
    junior: 'Junior',
    mid: 'Mid-level',
    senior: 'Senior',
    lead: 'Lead',
    executive: 'Executive',
  };
  return map[String(level).toLowerCase()] || level;
}

/**
 * Compact deadline label for the JobCard's metadata row.
 *   - past         → "Expired"
 *   - within 24h   → "Closes today" / "Closes tomorrow"
 *   - within 7d    → "Closes in 4d"
 *   - else         → "Closes Aug 12"
 */
function deadlineLabel(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = ts - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 7) return `Closes in ${days}d`;
  return `Closes ${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Map a backend job record into the JobCard's `job` prop shape. */
export function toJobCardShape(j) {
  if (!j) return null;
  const jobTypeLabel = String(j.job_type || 'full_time')
    .replace(/_/g, '-')
    .replace(/(^|-)([a-z])/g, (_m, p, c) => (p ? '-' : '') + c.toUpperCase());
  const score = j.match_score != null ? Number(j.match_score) : null;
  return {
    id: j.id,
    co: j.company_name || 'Company',
    l: firstLetter(j.company_name),
    cl: toneFor(j.company_id || j.id),
    title: j.title,
    city: j.city || null,
    country: j.country || null,
    // Canonical 3-state work mode shown as a badge on every job
    // card. Falls back to 'onsite' when the API didn't supply one
    // — old rows pre-migration-039 could carry NULL even though
    // the DB default is 'onsite', and we don't want to render an
    // empty chip on the card. Backend migration 039 backfills the
    // column too, so this is defence-in-depth.
    workMode: (() => {
      const v = String(j.work_mode || '').toLowerCase();
      if (v === 'remote' || v === 'hybrid' || v === 'onsite') return v;
      if (j.is_global_remote || j.is_remote) return 'remote';
      return 'onsite';
    })(),
    isGlobalRemote: !!j.is_global_remote,
    loc: [j.city || j.location, j.country, j.is_global_remote ? 'Global remote' : (j.is_remote ? 'Remote' : null)]
      .filter(Boolean)
      .join(' · ') || 'Remote',
    type: jobTypeLabel,
    pay: formatSalary(j.salary_min, j.salary_max, j.salary_currency, j.salary_period),
    tags: splitTags(j.skills_tags).slice(0, 4),
    // Compact metadata used by the JobCard's secondary chip row, so every
    // critical field is visible without making the card taller:
    experience: experienceLabel(j.experience_level),
    deadline: deadlineLabel(j.application_deadline),
    deadlineRaw: j.application_deadline || null,
    isExpired: j.is_expired === true
      || (j.application_deadline ? new Date(j.application_deadline).getTime() < Date.now() : false),
    // True when the application deadline is within the next 3 days
    // (and the job isn't already past). Drives the "Closing soon"
    // trust badge on JobCard so candidates can prioritise time-
    // sensitive roles at a glance.
    closingSoon: (() => {
      if (!j.application_deadline) return false;
      const ts = new Date(j.application_deadline).getTime();
      if (!Number.isFinite(ts)) return false;
      const ms = ts - Date.now();
      return ms > 0 && ms <= 3 * 86400000;
    })(),
    time: relativeTime(j.published_at || j.created_at),
    // Real backend match score (0..100) when present; the old
    // "60+x*5" simulation is gone now that the API returns real values.
    matchScore: score,
    match: score != null ? `${score}% match` : null,
    reasons: Array.isArray(j.reasons) ? j.reasons : [],
    missing: Array.isArray(j.missing) ? j.missing : [],
    featured: !!j.is_featured,
    // Employer-side surfacing: when the API row carries posting
    // status / applicant + view tallies, pass them through so a
    // shared JobCard can render the company-side badge cluster
    // (status pill + applicants chip + views chip) without
    // affecting the candidate-side rendering — JobCard treats
    // these as opt-in and skips them when null.
    status: j.status || null,
    applicationsCount: Number.isFinite(Number(j.applications_count)) ? Number(j.applications_count) : null,
    viewsCount: Number.isFinite(Number(j.views_count)) ? Number(j.views_count) : null,
    // Short summary preview rendered between the title and the
    // skills row so the card carries useful job context at a
    // glance instead of feeling empty. Cap aggressively (180
    // chars) so a verbose backend description can never push
    // the fixed-height slot's clamp past 2 lines.
    summary: shortSummary(j.description),
  };
}

/**
 * Strip basic HTML / markdown noise from a job description and
 * return the first ~180 chars suitable for a card preview. The
 * CSS .text-clamp-2 on the rendered element handles the final
 * "fits 2 lines" truncation; this just prevents the React tree
 * from carrying multi-paragraph blobs around.
 */
function shortSummary(raw) {
  if (!raw) return null;
  const plain = String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return null;
  return plain.length > 180 ? `${plain.slice(0, 178).trim()}…` : plain;
}

/**
 * Map an array of backend job records to JobCard view-models while
 * filtering out anything that's expired, missing, or otherwise not
 * displayable on a candidate-facing list.
 *
 * Use this everywhere a list of jobs gets rendered (Home rails, Jobs
 * feed, Favorites, Saved-for-later, Dashboard matches, JobDetail
 * similar rail). The backend already excludes expired jobs from the
 * candidate-facing endpoints; this is a defence-in-depth safety net
 * so a stale cache or a misbehaving endpoint can never paint an
 * "Expired" card in front of a candidate.
 *
 * Callers that need to render an expired job intentionally — the
 * JobDetail hero, an admin view — should keep using `toJobCardShape`
 * directly so the `isExpired` flag survives.
 */
export function filterActiveJobs(records) {
  return (records || [])
    .map(toJobCardShape)
    .filter((j) => j && !j.isExpired);
}

/** Map a backend company into the CompanyCard's `company` prop shape. */
export function toCompanyCardShape(c) {
  if (!c) return null;
  return {
    id: c.id,
    n: c.name,
    l: firstLetter(c.name),
    cl: toneFor(c.id),
    ind: c.industry || 'Technology',
    d: c.tagline || c.description?.slice(0, 140) || '',
    jobs: c.open_jobs ?? 0,
    size: c.size || '—',
  };
}

/** Map a backend candidate into the CandidateCard's `candidate` prop shape. */
export function toCandidateCardShape(c, idx = 0) {
  if (!c) return null;
  const ratingScore = c.profile_strength
    ? (Math.round((Number(c.profile_strength) / 100) * 50) / 10).toFixed(1)
    : '4.5';
  const skills = splitTags(c.skills?.map ? c.skills.map((s) => s.name).join(',') : '');
  return {
    id: c.id,
    rank: `#${idx + 1}`,
    a: firstLetter(c.full_name),
    cl: toneFor(c.id),
    n: c.full_name,
    role: c.headline || c.current_title || 'Open to roles',
    skills: skills.slice(0, 4),
    loc: c.location || c.country || 'Remote',
    rate: c.years_experience != null ? `${c.years_experience}+ yrs exp` : 'Open',
    rating: `★ ${ratingScore}`,
  };
}

export { formatSalary };
export const _internals = { toneFor, formatSalary, relativeTime, splitTags };
