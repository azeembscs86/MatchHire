'use strict';

/**
 * Candidate validators
 * --------------------
 * All authenticated candidate APIs are POST-only, so list pagination filters
 * are validated as request bodies (see `listFilters`).
 */

const Joi = require('joi');

const profileUpdate = Joi.object({
  full_name: Joi.string().min(2).max(150),
  phone: Joi.string().max(30).allow('', null),
  avatar_url: Joi.string().uri().max(500).allow('', null),
  headline: Joi.string().max(190).allow('', null),
  // Bio min/max enforced here so the frontend counter and the backend
  // agree without a second source of truth. 60 chars ~ "Frontend
  // engineer with seven years building production interfaces."
  summary: Joi.string().min(60).max(2000).allow('', null),
  current_title: Joi.string().max(150).allow('', null),
  // What you're hunting for (distinct from current_title).
  desired_role: Joi.string().max(190).allow('', null),
  years_experience: Joi.number().min(0).max(60),
  location: Joi.string().max(190).allow('', null),
  country: Joi.string().max(80).allow('', null),
  open_to_remote: Joi.boolean(),
  // Preferred work mode (matches employer-side `preferred_job_types`
  // domain but at a coarser grain — remote/hybrid/onsite).
  work_preference: Joi.string().valid('remote', 'hybrid', 'onsite').allow('', null),
  // Tri-state replacement for the boolean `open_to_remote`. Both are
  // kept so existing consumers (matching, search) keep working; the
  // service derives `open_to_remote` from this when both are sent.
  relocation_scope: Joi.string().valid('anywhere', 'region', 'remote_only').allow('', null),
  expected_salary_min: Joi.number().min(0).allow(null),
  expected_salary_max: Joi.number().min(0).allow(null),
  salary_currency: Joi.string().max(8),
  availability: Joi.string().valid('immediate', 'two_weeks', 'one_month', 'negotiable', 'not_looking'),
  resume_url: Joi.string().uri().max(500).allow('', null),
  portfolio_url: Joi.string().uri().max(500).allow('', null),
  linkedin_url: Joi.string().uri().max(500).allow('', null),
  github_url: Joi.string().uri().max(500).allow('', null),
  languages: Joi.array().items(Joi.string().max(50)).max(20),
  // Free-text education block (one entry per line, format up to the
  // candidate: "BS Computer Science · LUMS · 2018"). Structured
  // education table is on the Phase-2 roadmap. The resume parser
  // populates this on the confirm step from the parsed-education JSON.
  education: Joi.string().max(2000).allow('', null),
  // Save Draft = is_public:false, Save & Publish = is_public:true.
  // (Existing column kept; see DEVELOPER_GUIDE §profile-drafts.)
  is_public: Joi.boolean(),
}).min(1);

/**
 * One work-experience row. Used by both create + update endpoints;
 * `update` re-uses the schema with `.fork()` to make every field
 * optional so PATCH semantics work cleanly.
 *
 * `end_date` is allowed only when `is_current === false`; the
 * `when` rule makes the date conflict a validation error rather
 * than a silent server-side rewrite.
 */
const experienceBase = Joi.object({
  company: Joi.string().trim().min(1).max(190).required(),
  title: Joi.string().trim().min(1).max(190).required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().allow(null).when('is_current', {
    is: true,
    then: Joi.valid(null), // current role: end date must be null
    otherwise: Joi.optional(),
  }),
  is_current: Joi.boolean().default(false),
  description: Joi.string().max(5000).allow('', null),
});

const experienceCreate = experienceBase;

const experienceUpdate = experienceBase.fork(
  ['company', 'title', 'start_date'],
  (schema) => schema.optional()
).min(1);

const experienceIdParam = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// Entries can be either an existing skill (skill_id) or a custom
// free-text skill (name) the service will ensure-or-create. Joi
// `xor` enforces "exactly one of skill_id|name", giving a clear
// validation error if a caller sends neither (or both).
const skillEntry = Joi.object({
  skill_id: Joi.number().integer().positive(),
  name: Joi.string().trim().min(1).max(80),
  proficiency: Joi.string().valid('beginner', 'intermediate', 'advanced', 'expert').default('intermediate'),
  years_experience: Joi.number().min(0).max(60).default(0),
}).xor('skill_id', 'name');

const skillsUpdate = Joi.object({
  // 'set' (default) replaces the full set; 'add' appends to it.
  mode: Joi.string().valid('set', 'add').default('set'),
  // 1..30 for `add`, 3..30 for `set` (service enforces the
  // mode-specific min so we keep the validator simple).
  skills: Joi.array().items(skillEntry).min(1).max(30).required(),
});

/**
 * Full preferences payload — covers every section of the SPA's
 * Preferences page. The schema is intentionally permissive on the
 * structured arrays so the frontend can ship new chip values
 * without a backend deploy (we only validate the SHAPE, not
 * specific enum members on the open vocab fields). Closed-vocab
 * fields (job_scope, preferred_job_types, email_frequency) are
 * still pinned to their enum.
 *
 * Defaults are applied here so a partial payload never lands as
 * NULL in a column that has a NOT NULL constraint.
 */
const preferencesUpdate = Joi.object({
  // ---- Original (matching-engine) fields ----
  desired_titles: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  preferred_locations: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  preferred_job_types: Joi.array().items(
    Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance')
  ).max(10).default([]),
  preferred_categories: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  // Scope of the job search. `local` = same city; `country` = same
  // country; `global_remote` = remote-only across borders;
  // `hybrid` (default) = any of the above ranked by proximity.
  job_scope: Joi.string().valid('local', 'country', 'global_remote', 'hybrid').default('hybrid'),
  remote_only: Joi.boolean().default(false),
  salary_min: Joi.number().min(0).allow(null),
  salary_max: Joi.number().min(0).allow(null),
  salary_currency: Joi.string().max(8).default('USD'),
  notify_email: Joi.boolean().default(true),
  notify_push: Joi.boolean().default(false),

  // ---- Migration 032 — full Preferences page coverage ----
  // Priorities ranking (ordered list of priority ids, max 8).
  priorities: Joi.array().items(Joi.string().max(40)).max(8).default([]),
  // Multi-select: entry / junior / mid / senior / staff / principal.
  experience_levels: Joi.array().items(Joi.string().max(40)).max(8).default([]),
  // Multi-select benefits the user expects (equity, bonus, healthcare …).
  compensation_benefits: Joi.array().items(Joi.string().max(60)).max(20).default([]),
  // Multi-select work modes: remote / hybrid / onsite. Complementary
  // to `job_scope` (which is single-select scope of the search).
  work_modes: Joi.array().items(Joi.string().valid('remote', 'hybrid', 'onsite')).max(3).default([]),
  // Multi-select company stages (seed / series_a_b / series_c_plus / late_stage / public).
  company_stages: Joi.array().items(Joi.string().max(40)).max(8).default([]),
  // Free-text deal breakers list.
  deal_breakers: Joi.array().items(Joi.string().max(280)).max(50).default([]),

  // Location preferences (Phase-1 toggles now persisted).
  relocate_open: Joi.boolean().default(false),
  visa_sponsorship_needed: Joi.boolean().default(false),
  timezone_overlap_required: Joi.boolean().default(false),

  // Match-algorithm weights (any keys, integer 0–100 each).
  match_weights: Joi.object().pattern(Joi.string().max(40), Joi.number().min(0).max(100)).default({}),

  // Email digest cadence + match-score floor.
  email_frequency: Joi.string().valid('real_time', 'daily', 'weekly', 'off').default('daily'),
  minimum_match_score: Joi.number().integer().min(50).max(100).default(70),

  // Four granular notification flags.
  recruiter_messages: Joi.boolean().default(true),
  interview_reminders: Joi.boolean().default(true),
  weekly_profile_insights: Joi.boolean().default(true),
  salary_trend_alerts: Joi.boolean().default(false),
});

const applyToJob = Joi.object({
  cover_letter: Joi.string().max(5000).allow('', null),
  expected_salary: Joi.number().min(0).allow(null),
  resume_url: Joi.string().uri().max(500).allow('', null),
});

/** Shared body schema for POST list endpoints (applications, favorites). */
const listFilters = Joi.object({
  status: Joi.string().max(40).allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

/** Body for /candidates/recommended-jobs: just an optional limit. */
const recommendedFilters = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
}).unknown(false);

/** Body for /candidates/jobs/match: optional override filters. */
const matchFilters = Joi.object({
  country: Joi.string().max(120).allow('', null),
  city: Joi.string().max(140).allow('', null),
  role: Joi.string().max(200).allow('', null),
  skills: Joi.alternatives(Joi.string().max(500), Joi.array().items(Joi.string().max(60))).allow(null),
  experience_level: Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'executive').allow('', null),
  job_scope: Joi.string().valid('local', 'country', 'global_remote', 'hybrid').allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  include_below_threshold: Joi.boolean().default(false),
}).unknown(false);

/**
 * Onboarding-wizard advance payload. The step index is bounded to
 * [0, 6] (matches the 7 wizard panes); `complete: true` is only
 * meaningful on the final step but is accepted at any step so the
 * backend can be the authoritative gate.
 */
const onboardingAdvance = Joi.object({
  step: Joi.number().integer().min(0).max(6).required(),
  complete: Joi.boolean().default(false),
});

/** Apply validation + persist match (POST body). */
const validateAndApply = Joi.object({
  cover_letter: Joi.string().max(5000).allow('', null),
  expected_salary: Joi.number().min(0).allow(null),
  resume_url: Joi.string().uri().max(500).allow('', null),
}).unknown(false);

module.exports = {
  profileUpdate,
  skillsUpdate,
  preferencesUpdate,
  applyToJob,
  listFilters,
  recommendedFilters,
  matchFilters,
  validateAndApply,
  experienceCreate,
  experienceUpdate,
  experienceIdParam,
  onboardingAdvance,
};
