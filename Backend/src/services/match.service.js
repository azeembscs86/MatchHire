'use strict';

/**
 * Match service
 * -------------
 * Scores a single (candidate, job) pair from 0..100 along with the
 * reasons it scored well and the gaps that pulled it down. Used by:
 *
 *   - /candidates/jobs/match              ranked recommendations
 *   - /public/jobs/location-based         location-prioritised feed
 *   - /candidates/applications/.../apply  apply-time validation
 *   - /employers/recommended-candidates   AI-ranked candidates view
 *   - /employers/candidates/:id/matching-jobs    panel on cand detail
 *
 * Algorithm (transparent + tunable, no external API)
 *
 * Weights — Nov 2026 rebalance, per product brief:
 *
 *   skills_match    0..55   intersection size of job.skills_tags and
 *                           candidate skills, normalised by the
 *                           number of skills the job requires. Now
 *                           the dominant signal — the platform is
 *                           hiring on capability first.
 *   role_match      0..20   keyword overlap between job title and
 *                           candidate headline / current_title.
 *   experience      0..15   does the candidate's years_experience hit
 *                           the experience_level band? SOFT penalty
 *                           below the floor — small gaps (1–3 yrs)
 *                           still earn most of the points, large
 *                           gaps reduce but never instantly reject.
 *   location_match  0..05   city > country > otherwise. LOW priority
 *                           by design — geography mismatches are not
 *                           supposed to drown out strong matches.
 *   work_mode_match 0..05   remote / hybrid / onsite alignment. Also
 *                           LOW priority for the same reason.
 *
 *   Total                  0..100
 *
 * Salary and category were removed from the weighted score in the
 * Nov 2026 rebalance — they remain available as separate signals
 * inside the response (`reasons` / `gaps`) but they no longer move
 * the headline number.
 */

const LEVEL_TO_YEARS = {
  entry: 0, junior: 1, mid: 3, senior: 6, lead: 9, executive: 12,
};

// Apply-time decisions. The accept threshold stays at 60 so the
// existing "candidate-can-apply-here" gate keeps its prior bar even
// after the weight rebalance — typical strong candidates land 70–95
// with the new weights, well above this floor.
const ACCEPT_THRESHOLD = 60;
const BORDERLINE_THRESHOLD = 45;

function splitCsv(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  return String(s).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function lower(s) { return String(s || '').toLowerCase(); }

/* -------------------------------------------------------------- *
 * Per-component scoring functions. Each returns
 *   { score, reason?, gap?, missing? }
 * so the caller can render a breakdown without re-running anything.
 * -------------------------------------------------------------- */

function pickRoleMatch(job, candidate) {
  const haystacks = [candidate.headline, candidate.current_title]
    .filter(Boolean)
    .map(lower);
  const title = lower(job.title);
  if (!title || haystacks.length === 0) return { score: 0, reason: null };
  const words = title.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const hit = words.find((w) => haystacks.some((h) => h.includes(w)));
  if (!hit) return { score: 0, reason: null };
  return { score: 20, reason: 'Title matches your current role' };
}

function pickSkillsMatch(job, candidate) {
  const required = splitCsv(job.skills_tags);
  const have = (candidate.skills || []).map((s) => lower(s.name || s));
  // Jobs with no listed skills can't be skill-scored — credit half
  // the weight as a neutral baseline so they still register on
  // role / experience / location alone.
  if (required.length === 0) return { score: 28, reason: null, missing: [] };
  const overlap = required.filter((r) => have.some((h) => h === r || h.includes(r) || r.includes(h)));
  const ratio = overlap.length / required.length;
  const score = Math.round(55 * ratio);
  const missing = required.filter((r) => !overlap.some((o) => o === r));
  let reason = null;
  if (overlap.length >= 3) reason = `Matches ${overlap.length} of ${required.length} required skills`;
  else if (overlap.length >= 1) reason = `Matches ${overlap.length} required skill${overlap.length > 1 ? 's' : ''}`;
  return { score, reason, missing };
}

/**
 * Experience match with soft penalty.
 *
 *   gap = floor - candidate_years
 *   gap <= 0   → full credit (15)
 *   gap == 1   → 13 (very close)
 *   gap == 2   → 11 (still strongly considered — spec says "2-3 yr
 *                    differences shouldn't reject")
 *   gap == 3   →  9
 *   gap == 4   →  7
 *   gap == 5   →  5
 *   gap >  5   →  3 (floor — never zero, "very large mismatch should
 *                   reduce score but not instantly reject")
 *
 * Over-qualification (candidate years far exceed floor) is never
 * penalised — it always reads as "exceeds the band".
 */
function pickExperienceMatch(job, candidate) {
  const level = job.experience_level || 'mid';
  const floor = LEVEL_TO_YEARS[level] ?? 3;
  const yrs = Number(candidate.years_experience || 0);
  if (yrs >= floor) {
    return { score: 15, reason: `You meet the ${level} experience band` };
  }
  const gap = floor - yrs;
  if (gap <= 1) return { score: 13, reason: `Close to the ${level} experience band` };
  if (gap <= 2) return { score: 11, reason: `Within 2 years of the ${level} band` };
  if (gap <= 3) return { score: 9, reason: null };
  if (gap <= 4) return { score: 7, reason: null };
  if (gap <= 5) return { score: 5, reason: null };
  return { score: 3, reason: null, gap: `Job ${level} band wants ~${floor}+ yrs; profile shows ${yrs}` };
}

/**
 * Location match — LOW priority. Cap at 5 points so geography never
 * dominates skills. Even a city mismatch still earns 2 points (soft
 * penalty, not rejection).
 */
function pickLocationMatch(job, candidate) {
  const cCity = lower(candidate.city || candidate.location);
  const jCity = lower(job.city || job.location);
  const cCountry = lower(candidate.country);
  const jCountry = lower(job.country);
  if (cCity && jCity && cCity === jCity) {
    return { score: 5, reason: `Available in ${job.city || job.location}` };
  }
  if (cCountry && jCountry && cCountry === jCountry) {
    return { score: 4, reason: `Same country (${job.country})` };
  }
  // Different city / country — small penalty, never zero. Remote-
  // friendly roles get the same soft pass; the `pickWorkModeMatch`
  // component handles work-mode compatibility separately.
  return { score: 2, reason: null };
}

/**
 * Work-mode match — LOW priority. Caps at 5 points. Onsite mismatch
 * for a remote-leaning candidate is a 2-point penalty, not a
 * disqualification.
 */
function pickWorkModeMatch(job, candidate) {
  if (job.is_global_remote) {
    return { score: 5, reason: 'Global remote role' };
  }
  const mode = lower(job.work_mode) || (job.is_remote ? 'remote' : 'onsite');
  const openRemote = !!candidate.open_to_remote;
  if (mode === 'remote' && openRemote) return { score: 5, reason: 'Remote-friendly' };
  if (mode === 'hybrid') return { score: 4, reason: 'Hybrid arrangement' };
  if (mode === 'onsite' && !openRemote) return { score: 4, reason: 'Onsite role' };
  // Mismatched preference (e.g. onsite job vs remote-leaning
  // candidate). Soft penalty, never zero.
  return { score: 2, reason: null };
}

/* -------------------------------------------------------------- *
 * Diagnostic-only components. Not part of the weighted score; their
 * outputs flow into `reasons` / `gaps` so the UI can still surface
 * salary / category context without those signals dominating.
 * -------------------------------------------------------------- */

function pickSalaryDiagnostic(job, candidate) {
  if (!candidate.expected_salary_min && !candidate.expected_salary_max) return {};
  if (!job.salary_min && !job.salary_max) return {};
  const cMin = Number(candidate.expected_salary_min || 0);
  const cMax = Number(candidate.expected_salary_max || cMin * 1.5 || 0);
  const jMin = Number(job.salary_min || 0);
  const jMax = Number(job.salary_max || jMin * 1.5 || 0);
  const overlaps = !(jMax < cMin || jMin > cMax);
  return overlaps
    ? { reason: 'Salary range overlaps your expectations' }
    : { gap: 'Salary band outside your expectations' };
}

function pickCategoryDiagnostic(job, candidate) {
  const prefs = splitCsv(candidate.preferred_categories);
  if (!prefs.length || !job.category_name) return {};
  const hit = prefs.some((p) => p === lower(job.category_name) || p === lower(job.category_slug));
  return hit
    ? { reason: `In a category you preferred (${job.category_name})` }
    : {};
}

/**
 * Score a single (candidate, job) pair.
 *
 * `candidate` should be the combined view: profile + skills (array
 * of `{name}`) + preferences. Use `jobRepo.loadCandidateContext()`
 * to build the right shape.
 *
 * Returns `{ score, reasons[], missing[], gaps[], decision }`.
 */
function scoreJob(job, candidate) {
  const scoring = [
    pickSkillsMatch(job, candidate),
    pickRoleMatch(job, candidate),
    pickExperienceMatch(job, candidate),
    pickLocationMatch(job, candidate),
    pickWorkModeMatch(job, candidate),
  ];
  const diagnostics = [
    pickSalaryDiagnostic(job, candidate),
    pickCategoryDiagnostic(job, candidate),
  ];

  const score = Math.min(100, scoring.reduce((s, c) => s + (c.score || 0), 0));
  const reasons = [...scoring, ...diagnostics].map((c) => c.reason).filter(Boolean);
  const gaps = [...scoring, ...diagnostics].map((c) => c.gap).filter(Boolean);
  const missing = scoring.find((c) => c.missing)?.missing || [];

  const decision = score >= ACCEPT_THRESHOLD
    ? 'accepted'
    : score >= BORDERLINE_THRESHOLD
      ? 'below_threshold'
      : 'rejected';

  return { score, reasons, gaps, missing, decision };
}

/**
 * Apply-time validation: reject hard mismatches with a polite,
 * specific reason; accept everything at or above the threshold.
 * Returns `{ allowed, score, reasons, missing, gaps, decision, message }`.
 */
function validateApplication(job, candidate) {
  const result = scoreJob(job, candidate);
  let message = null;
  if (result.decision === 'rejected') {
    if (result.missing && result.missing.length) {
      message = `Your profile is missing key skills for this role: ${result.missing.slice(0, 4).join(', ')}.`;
    } else if (result.gaps && result.gaps.length) {
      message = result.gaps[0];
    } else {
      message = 'Your profile does not meet the minimum requirements for this role yet.';
    }
  }
  return {
    ...result,
    allowed: result.decision !== 'rejected',
    message,
  };
}

module.exports = {
  scoreJob,
  validateApplication,
  ACCEPT_THRESHOLD,
  BORDERLINE_THRESHOLD,
};
