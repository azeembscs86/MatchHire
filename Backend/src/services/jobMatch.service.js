'use strict';

/**
 * Job match coordinator
 * ---------------------
 * High-level glue between the raw scoring engine (`match.service`) and the
 * AI copy generator (`ai.service`). Used by the new home / jobs / recommended
 * endpoints to:
 *
 *   - Load a candidate context (profile + skills + preferences)
 *   - Score every candidate job using the standard 0..100 rubric
 *   - Add matchedSkills / missingSkills / matchReasons / aiRecommendationLabel
 *     / aiSummary on every record
 *   - Filter rows under the personalised threshold (default 40%)
 *   - Sort by descending score (best match first)
 *
 * Threshold rule (per product spec):
 *   - Logged-in users:  minimum 40% match
 *   - Guests:           no personalised matching, return jobs as-is
 *
 * Single source of truth for the % calculation:
 *   skills_match: 50%, category/department: 15%, experience: 15%,
 *   location: 10%, job type / preference: 10%.
 * This file derives those weights from the underlying breakdown returned
 * by `match.service.scoreJob` so the two stay in lockstep.
 */

const matchService = require('./match.service');
const aiService = require('./ai.service');
const jobRepo = require('../repositories/job.repository');

const LOGGED_IN_THRESHOLD = 40;

/* ============================================================================
 * Helpers
 * ========================================================================== */

function splitTags(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim()).filter(Boolean);
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}

function lower(s) { return String(s || '').toLowerCase(); }

/**
 * Extract the matched skill names from the (candidate, job) pair using
 * the same overlap rule as `match.service.pickSkillsMatch`.
 */
function pickMatchedSkills(job, candidate) {
  const required = splitTags(job?.skills_tags);
  if (!required.length) return [];
  const have = (candidate?.skills || []).map((s) => lower(s?.name || s));
  const matched = [];
  for (const r of required) {
    const lr = lower(r);
    if (have.some((h) => h === lr || h.includes(lr) || lr.includes(h))) {
      matched.push(r);
    }
  }
  return matched;
}

/**
 * Re-shape a single scored row into the public match payload.
 *
 * Returned keys (camelCase wrapper, plus the existing snake_case `match_score`
 * for backwards compatibility with current JobCard wiring):
 *
 *   matchPercentage, matchedSkills, missingSkills, matchReasons,
 *   aiRecommendationLabel, aiSummary, match_score (alias), reasons, missing
 */
function decorate(job, candidate) {
  const breakdown = matchService.scoreJob(job, candidate);
  const matched = pickMatchedSkills(job, candidate);
  const label = aiService.labelForScore(breakdown.score);
  const summary = aiService.summariseMatch({
    job, candidate,
    score: breakdown.score,
    matched,
    missing: breakdown.missing,
    reasons: breakdown.reasons,
  });
  return {
    ...job,
    matchPercentage: breakdown.score,
    matchedSkills: matched,
    missingSkills: breakdown.missing,
    matchReasons: breakdown.reasons,
    aiRecommendationLabel: label,
    aiSummary: summary,
    // Aliases so the existing frontend adapters (which read `match_score`,
    // `reasons`, `missing`) keep working without code changes.
    match_score: breakdown.score,
    reasons: breakdown.reasons,
    missing: breakdown.missing,
    decision: breakdown.decision,
  };
}

/* ============================================================================
 * Public API
 * ========================================================================== */

/**
 * Score a raw list of jobs against a candidate (or return them untouched if
 * `candidate` is null — guest mode).
 *
 * @param {Array} jobs        raw job rows from the repository
 * @param {object|null} candidate  loadCandidateContext output, or null for guests
 * @param {object} opts
 *   - threshold {number}  override the default min score (40 for logged-in)
 *   - filter    {boolean} drop rows below threshold (default true for logged-in)
 *   - limit     {number}  cap returned rows after sort
 */
function rankJobs(jobs, candidate, opts = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  if (!candidate) {
    // Guest path — no personalisation. Hand the rows back as-is, no score.
    return jobs;
  }
  const threshold = opts.threshold != null ? Number(opts.threshold) : LOGGED_IN_THRESHOLD;
  const shouldFilter = opts.filter !== false;
  const decorated = jobs
    .map((job) => decorate(job, candidate))
    .sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
  const filtered = shouldFilter
    ? decorated.filter((r) => (r.matchPercentage || 0) >= threshold)
    : decorated;
  return opts.limit ? filtered.slice(0, Number(opts.limit)) : filtered;
}

/**
 * Score a SINGLE job for an optional viewer. When `viewerUserId` is null
 * the job is returned unmodified. When a candidate context is available
 * the full match block is decorated onto the result.
 */
async function decorateOne(job, viewerUserId) {
  if (!job || !viewerUserId) return job;
  const candidate = await jobRepo.loadCandidateContext(viewerUserId);
  if (!candidate) return job;
  return decorate(job, candidate);
}

/**
 * Personalised recommended jobs for a logged-in candidate.
 *
 * Strategy: over-fetch open jobs filtered by basic candidate-context
 * preferences (so the score has good source material), score them all,
 * apply the 40% threshold, sort by descending score, cap to `limit`.
 *
 * @param {number} userId   - candidate user id
 * @param {object} opts     - { limit, includeBelowThreshold, oversample }
 */
async function recommendedFor(userId, opts = {}) {
  const candidate = await jobRepo.loadCandidateContext(userId);
  if (!candidate) return { records: [], candidateMissing: true };

  const oversample = Math.min(Math.max(Number(opts.oversample) || 80, 20), 200);
  const { rows } = await jobRepo.listLocationBased({
    country: candidate.country || undefined,
    city: candidate.city || undefined,
    job_scope: candidate.job_scope || 'hybrid',
    page: 1,
    limit: oversample,
  });

  // If the location-based pull came back light, top up with the generic
  // open-job list so candidates in cities with thin listings still get
  // results.
  let pool = rows;
  if (pool.length < 20) {
    const fallback = await jobRepo.listPublic({ page: 1, limit: oversample, sort: 'latest' });
    const seen = new Set(pool.map((r) => r.id));
    for (const j of fallback.rows) {
      if (!seen.has(j.id)) pool.push(j);
    }
  }

  const records = rankJobs(pool, candidate, {
    filter: !opts.includeBelowThreshold,
    threshold: opts.threshold != null ? opts.threshold : LOGGED_IN_THRESHOLD,
    limit: Math.min(Number(opts.limit) || 12, 50),
  });
  return { records, candidate };
}

module.exports = {
  rankJobs,
  decorate,
  decorateOne,
  recommendedFor,
  LOGGED_IN_THRESHOLD,
};
