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
  summary: Joi.string().max(5000).allow('', null),
  current_title: Joi.string().max(150).allow('', null),
  years_experience: Joi.number().min(0).max(60),
  location: Joi.string().max(190).allow('', null),
  country: Joi.string().max(80).allow('', null),
  open_to_remote: Joi.boolean(),
  expected_salary_min: Joi.number().min(0).allow(null),
  expected_salary_max: Joi.number().min(0).allow(null),
  salary_currency: Joi.string().max(8),
  availability: Joi.string().valid('immediate', 'two_weeks', 'one_month', 'negotiable', 'not_looking'),
  resume_url: Joi.string().uri().max(500).allow('', null),
  portfolio_url: Joi.string().uri().max(500).allow('', null),
  linkedin_url: Joi.string().uri().max(500).allow('', null),
  github_url: Joi.string().uri().max(500).allow('', null),
  languages: Joi.array().items(Joi.string().max(50)).max(20),
  is_public: Joi.boolean(),
}).min(1);

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

const preferencesUpdate = Joi.object({
  desired_titles: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  preferred_locations: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  preferred_job_types: Joi.array().items(
    Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance')
  ).max(10).default([]),
  preferred_categories: Joi.array().items(Joi.string().max(120)).max(20).default([]),
  remote_only: Joi.boolean().default(false),
  salary_min: Joi.number().min(0).allow(null),
  salary_max: Joi.number().min(0).allow(null),
  salary_currency: Joi.string().max(8).default('USD'),
  notify_email: Joi.boolean().default(true),
  notify_push: Joi.boolean().default(false),
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
};
