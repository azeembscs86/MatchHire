'use strict';

/**
 * Candidate service
 * -----------------
 * Business logic for candidate-only flows. Responsible for:
 *
 *   - Combining profile + skills + preferences into the read model
 *   - Recomputing `profile_strength` after profile/skill changes
 *   - Job application: enforces "open" jobs only, single application per
 *     (job, candidate) pair, and increments the job's applications_count
 *   - Cache invalidation on writes (candidate detail/list, dashboard)
 */

const userRepo = require('../repositories/user.repository');
const candidateRepo = require('../repositories/candidate.repository');
const jobRepo = require('../repositories/job.repository');
const favRepo = require('../repositories/favorite.repository');
const appRepo = require('../repositories/application.repository');
const interviewRepo = require('../repositories/interview.repository');
const matchRepo = require('../repositories/match.repository');
const matchService = require('./match.service');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');
const db = require('../config/database');

async function getProfile(user_id) {
  const profile = await candidateRepo.findProfileByUserId(user_id);
  const skills = await candidateRepo.listSkills(user_id);
  const preferences = await candidateRepo.getPreferences(user_id);
  return { profile, skills, preferences };
}

async function updateProfile(user_id, payload) {
  const userFields = {};
  for (const k of ['full_name', 'phone', 'avatar_url']) {
    if (k in payload) userFields[k] = payload[k];
  }
  if (Object.keys(userFields).length) await userRepo.updateById(user_id, userFields);

  const profileFields = {};
  const allowed = [
    'headline','summary','current_title','desired_role','years_experience',
    'location','country',
    'open_to_remote','work_preference','relocation_scope',
    'expected_salary_min','expected_salary_max','salary_currency','availability',
    'resume_url','portfolio_url','linkedin_url','github_url','languages','is_public',
  ];
  for (const k of allowed) {
    if (k in payload) profileFields[k] = payload[k];
  }

  // Derive `open_to_remote` from `relocation_scope` when the caller
  // sent the new tri-state without also explicitly sending the
  // legacy boolean. Keeps every existing read path (matching,
  // search, public profile) working without changes.
  if ('relocation_scope' in profileFields && !('open_to_remote' in profileFields)) {
    profileFields.open_to_remote = profileFields.relocation_scope !== null
      && profileFields.relocation_scope !== 'onsite_only';
  }

  if (Object.keys(profileFields).length) await candidateRepo.upsertProfile(user_id, profileFields);

  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id), cache.Keys.topCandidates());
  return getProfile(user_id);
}

/**
 * Toggle the profile's publish state. "Save Draft" sets `is_public=0`,
 * "Save & Publish" sets `is_public=1`. Splits out from updateProfile
 * so the UI can wire one button to each path without sending the
 * whole form payload.
 */
async function setPublishState(user_id, publish) {
  await candidateRepo.upsertProfile(user_id, { is_public: publish ? 1 : 0 });
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id), cache.Keys.topCandidates());
  return getProfile(user_id);
}

async function updateSkills(user_id, skills) {
  await candidateRepo.replaceSkills(user_id, skills);
  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id));
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  return candidateRepo.listSkills(user_id);
}

async function updatePreferences(user_id, preferences) {
  await candidateRepo.upsertPreferences(user_id, preferences);
  return candidateRepo.getPreferences(user_id);
}

async function recommendedJobs(user_id, limit = 10) {
  return jobRepo.recommendedForUser(user_id, limit);
}

async function addFavorite(user_id, job_id) {
  const job = await jobRepo.findById(job_id);
  if (!job) throw new AppError('Job not found', 404);
  await favRepo.add(user_id, job_id);
  return { user_id, job_id };
}

async function removeFavorite(user_id, job_id) {
  const removed = await favRepo.remove(user_id, job_id);
  if (!removed) throw new AppError('Favorite not found', 404);
  return true;
}

async function listFavorites(user_id, paging) {
  return favRepo.list(user_id, paging);
}

async function applyToJob(user_id, job_id, payload) {
  const job = await jobRepo.findById(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') throw new AppError('Job is no longer accepting applications', 400);
  const existing = await appRepo.findByJobAndCandidate(job_id, user_id);
  if (existing) throw new AppError('You already applied to this job', 409);
  const id = await appRepo.create({
    job_id,
    candidate_user_id: user_id,
    company_id: job.company_id,
    cover_letter: payload.cover_letter,
    resume_url: payload.resume_url,
    expected_salary: payload.expected_salary,
  });
  await cache.deleteCache(cache.Keys.jobDetail(job_id));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(id);
}

async function listApplications(user_id, paging) {
  return appRepo.listForCandidate(user_id, paging);
}

async function dashboardStats(user_id) {
  const key = cache.Keys.dashboardStats('candidate', user_id);
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const applications = await appRepo.statsForCandidate(user_id);
    const interviews = await interviewRepo.listForCandidate(user_id);
    const favs = await favRepo.list(user_id, { page: 1, limit: 5 });
    const profile = await candidateRepo.findProfileByUserId(user_id);
    return {
      applications,
      interviews: { upcoming: interviews.filter((i) => i.status === 'scheduled').slice(0, 5), total: interviews.length },
      favorites: { recent: favs.rows.slice(0, 5), total: favs.total },
      profile_strength: profile?.profile_strength || 0,
    };
  });
}

/**
 * Skill-based job matching for the authenticated candidate.
 *
 * Pulls a candidate-shaped context once, then scores every open job
 * matching the supplied filters and returns them sorted by descending
 * match score. Only returns rows above the soft threshold by default;
 * caller can override with `include_below_threshold`.
 */
async function matchJobs(user_id, payload = {}) {
  const candidate = await jobRepo.loadCandidateContext(user_id);
  if (!candidate) throw new AppError('Profile not found', 404);

  const limit = Math.min(Number(payload.limit) || 20, 50);
  const filters = {
    country: payload.country || candidate.country,
    city: payload.city || candidate.city,
    role: payload.role,
    skills: payload.skills,
    experience_level: payload.experience_level,
    job_scope: payload.job_scope || candidate.job_scope || 'hybrid',
    page: payload.page || 1,
    limit: 60, // over-fetch a little so post-scoring still has volume
  };
  const { rows } = await jobRepo.listLocationBased(filters);
  const scored = rows
    .map((job) => ({ job, m: matchService.scoreJob(job, candidate) }))
    .sort((a, b) => b.m.score - a.m.score);
  const filtered = payload.include_below_threshold
    ? scored
    : scored.filter((r) => r.m.score >= matchService.BORDERLINE_THRESHOLD);
  const records = filtered.slice(0, limit).map(({ job, m }) => ({
    ...job,
    match_score: m.score,
    reasons: m.reasons,
    missing: m.missing,
    decision: m.decision,
  }));
  return { records };
}

/**
 * Apply-and-validate: score the candidate against the job first; if
 * the match clears the threshold create the application AND store the
 * match result, otherwise reject politely and record the attempt so
 * admins can audit it.
 */
async function applyWithValidation(user_id, job_id, payload = {}) {
  const job = await jobRepo.findByIdRaw(job_id);
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'open') throw new AppError('Job is no longer accepting applications', 400);

  const candidate = await jobRepo.loadCandidateContext(user_id);
  if (!candidate) throw new AppError('Complete your profile before applying', 400);

  const verdict = matchService.validateApplication(job, candidate);

  if (!verdict.allowed) {
    await matchRepo.save({
      application_id: null,
      candidate_user_id: user_id,
      job_id,
      match_score: verdict.score,
      decision: 'rejected',
      reasons: verdict.reasons,
      missing: verdict.missing,
      rejection_message: verdict.message,
    });
    return {
      accepted: false,
      decision: 'rejected',
      match_score: verdict.score,
      reasons: verdict.reasons,
      missing: verdict.missing,
      message: verdict.message,
    };
  }

  // Soft-accept / accept paths still create the application; the
  // employer dashboard sees the match score next to it.
  const existing = await appRepo.findByJobAndCandidate(job_id, user_id);
  if (existing) throw new AppError('You already applied to this job', 409);

  const application_id = await appRepo.create({
    job_id,
    candidate_user_id: user_id,
    company_id: job.company_id,
    cover_letter: payload.cover_letter || null,
    resume_url: payload.resume_url || null,
    expected_salary: payload.expected_salary ?? null,
  });
  await db.getPool().execute(
    `UPDATE applications SET match_score = ? WHERE id = ?`,
    [verdict.score, application_id]
  );
  await matchRepo.save({
    application_id,
    candidate_user_id: user_id,
    job_id,
    match_score: verdict.score,
    decision: verdict.decision,
    reasons: verdict.reasons,
    missing: verdict.missing,
  });
  await cache.deleteCache(cache.Keys.jobDetail(job_id));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('candidate'));
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));

  return {
    accepted: true,
    decision: verdict.decision,
    match_score: verdict.score,
    reasons: verdict.reasons,
    missing: verdict.missing,
    application_id,
  };
}

module.exports = {
  getProfile,
  updateProfile,
  setPublishState,
  updateSkills,
  updatePreferences,
  recommendedJobs,
  addFavorite,
  removeFavorite,
  listFavorites,
  applyToJob,
  applyWithValidation,
  listApplications,
  dashboardStats,
  matchJobs,
};
