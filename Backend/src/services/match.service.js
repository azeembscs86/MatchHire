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
 *   - Company dashboard                   applicant insights
 *
 * Algorithm (transparent and tunable - no external API)
 *
 *   role_match      0..25   keyword overlap between job title and
 *                           candidate headline / current_title.
 *   skills_match    0..30   intersection size of job.skills_tags and
 *                           candidate skills, normalised by the number
 *                           of skills the job requires.
 *   experience      0..15   does the candidate's years_experience hit
 *                           the experience_level band? linear penalty
 *                           below the floor.
 *   location_match  0..15   city > country > remote-compatible.
 *   salary_match    0..10   does the candidate's expected range
 *                           overlap with the job's range?
 *   category_match  0..05   job_category in candidate.preferred_categories.
 *
 * `validateApplication(score, gaps)` decides whether an applicant
 * should be allowed to submit at all - returning a clear, polite
 * rejection message if not.
 */

const cache = require('./cache.service');

const LEVEL_TO_YEARS = {
  entry: 0, junior: 1, mid: 3, senior: 6, lead: 9, executive: 12,
};

const ACCEPT_THRESHOLD = 60;     // >= apply allowed
const BORDERLINE_THRESHOLD = 45; // accepted but flagged for the employer

function splitCsv(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  return String(s).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function lower(s) { return String(s || '').toLowerCase(); }

/** Build a score component object so callers see the breakdown. */
function pickRoleMatch(job, candidate) {
  const haystacks = [candidate.headline, candidate.current_title]
    .filter(Boolean)
    .map(lower);
  const title = lower(job.title);
  if (!title || haystacks.length === 0) return { score: 0, reason: null };

  const words = title.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const hit = words.find((w) => haystacks.some((h) => h.includes(w)));
  if (!hit) return { score: 0, reason: null };
  return { score: 25, reason: `Title matches your current role` };
}

function pickSkillsMatch(job, candidate) {
  const required = splitCsv(job.skills_tags);
  const have = (candidate.skills || []).map((s) => lower(s.name || s));
  if (required.length === 0) return { score: 15, reason: null, missing: [] };
  const overlap = required.filter((r) => have.some((h) => h === r || h.includes(r) || r.includes(h)));
  const ratio = overlap.length / required.length;
  const score = Math.round(30 * ratio);
  const missing = required.filter((r) => !overlap.some((o) => o === r));
  let reason = null;
  if (overlap.length >= 3) reason = `Matches ${overlap.length} of ${required.length} required skills`;
  else if (overlap.length >= 1) reason = `Matches ${overlap.length} required skill${overlap.length > 1 ? 's' : ''}`;
  return { score, reason, missing };
}

function pickExperienceMatch(job, candidate) {
  const level = job.experience_level || 'mid';
  const floor = LEVEL_TO_YEARS[level] ?? 3;
  const yrs = Number(candidate.years_experience || 0);
  if (yrs >= floor) return { score: 15, reason: `You meet the ${level} experience band` };
  if (yrs >= floor - 1) return { score: 10, reason: `Close to the ${level} experience band` };
  if (yrs >= floor - 2) return { score: 6, reason: null };
  return { score: 0, reason: null, gap: `Job needs ~${floor}+ yrs; profile shows ${yrs}` };
}

function pickLocationMatch(job, candidate) {
  // Remote-friendly first
  if (job.is_global_remote || (job.work_mode === 'remote' && (!job.country || candidate.open_to_remote))) {
    return { score: 12, reason: 'Remote role - works from anywhere' };
  }
  const cCity = lower(candidate.city || candidate.location);
  const jCity = lower(job.city || job.location);
  const cCountry = lower(candidate.country);
  const jCountry = lower(job.country);
  if (cCity && jCity && cCity === jCity) return { score: 15, reason: `Available in ${job.city || job.location}` };
  if (cCountry && jCountry && cCountry === jCountry) return { score: 10, reason: `In the same country (${job.country})` };
  if (candidate.open_to_remote && job.work_mode !== 'onsite') return { score: 6, reason: null };
  return { score: 0, reason: null, gap: `Location mismatch (${job.location || job.country || '—'})` };
}

function pickSalaryMatch(job, candidate) {
  if (!candidate.expected_salary_min && !candidate.expected_salary_max) return { score: 5, reason: null };
  if (!job.salary_min && !job.salary_max) return { score: 5, reason: null };
  const cMin = Number(candidate.expected_salary_min || 0);
  const cMax = Number(candidate.expected_salary_max || cMin * 1.5 || 0);
  const jMin = Number(job.salary_min || 0);
  const jMax = Number(job.salary_max || jMin * 1.5 || 0);
  const overlaps = !(jMax < cMin || jMin > cMax);
  if (overlaps) return { score: 10, reason: 'Salary range overlaps your expectations' };
  return { score: 0, reason: null, gap: 'Salary band outside your expectations' };
}

function pickCategoryMatch(job, candidate) {
  const prefs = splitCsv(candidate.preferred_categories);
  if (!prefs.length || !job.category_name) return { score: 3, reason: null };
  const hit = prefs.some((p) => p === lower(job.category_name) || p === lower(job.category_slug));
  return hit
    ? { score: 5, reason: `In a category you preferred (${job.category_name})` }
    : { score: 0, reason: null, gap: `Category "${job.category_name}" is not in your preferences` };
}

/**
 * Score a single (candidate, job) pair. `candidate` should be the
 * combined view: profile + skills (array of {name}) + preferences.
 * Returns `{ score, reasons[], missing[], gaps[], decision }`.
 */
function scoreJob(job, candidate) {
  const components = [
    pickRoleMatch(job, candidate),
    pickSkillsMatch(job, candidate),
    pickExperienceMatch(job, candidate),
    pickLocationMatch(job, candidate),
    pickSalaryMatch(job, candidate),
    pickCategoryMatch(job, candidate),
  ];
  const score = Math.min(100, components.reduce((s, c) => s + (c.score || 0), 0));
  const reasons = components.map((c) => c.reason).filter(Boolean);
  const gaps = components.map((c) => c.gap).filter(Boolean);
  const missing = components.find((c) => c.missing)?.missing || [];

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

/**
 * Cached scorer used by hot paths (match recommendations + apply
 * validation). The cache key includes both the candidate and job
 * id; invalidation happens through `cache.invalidate.candidate*`
 * and `cache.invalidate.job(...)` whenever upstream data shifts.
 *
 * When Redis is unavailable this falls back to the unc ached
 * `scoreJob`. Either way the algorithm is the same.
 */
async function scoreJobCached(job, candidate) {
  if (!job?.id || !candidate?.id) return scoreJob(job, candidate);
  const key = cache.Keys.matchScore(candidate.id, job.id);
  const hit = await cache.get(key);
  if (hit) return hit;
  const result = scoreJob(job, candidate);
  await cache.set(key, result, cache.TTL.MATCH_SCORE);
  return result;
}

module.exports = {
  scoreJob,
  scoreJobCached,
  validateApplication,
  ACCEPT_THRESHOLD,
  BORDERLINE_THRESHOLD,
};
