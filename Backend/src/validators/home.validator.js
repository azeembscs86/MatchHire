'use strict';

/**
 * Home / smart-jobs validators
 * ----------------------------
 * Schemas for the new auth-aware GET endpoints under `/api/v1`:
 *
 *   GET /jobs               -> jobsQuery
 *   GET /jobs/recommended   -> recommendedQuery
 *
 * Mirrors the shape of `public.validator.js > jobsQuery` but adds:
 *   - skills            comma-separated skill tags (for personalisation)
 *   - include_below_threshold  diagnostic override
 *   - threshold         personalised cutoff override (0..100)
 */

const Joi = require('joi');

const jobsQuery = Joi.object({
  keyword: Joi.string().max(200).allow('', null),
  category: Joi.alternatives(Joi.string().max(150), Joi.number().integer().positive()).allow('', null),
  location: Joi.string().max(190).allow('', null),
  skills: Joi.string().max(500).allow('', null),
  job_type: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance').allow('', null),
  experience_level: Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'executive').allow('', null),
  salary_min: Joi.number().min(0).allow(null),
  salary_max: Joi.number().min(0).allow(null),
  // `remote` is the legacy boolean alias. New clients send `work_mode`
  // (3-state: onsite/hybrid/remote). Both are accepted; the repository
  // prefers `work_mode` when present.
  remote: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  work_mode: Joi.string().valid('onsite', 'hybrid', 'remote').allow('', null),
  // "Posted within" — number of days. NULL/0 means "any time".
  // Accept both `posted_within_days` (canonical) and `posted_within`
  // (frontend's existing name) so the param name doesn't break either
  // direction during the cleanup.
  posted_within_days: Joi.number().integer().min(0).max(365).allow(null),
  posted_within: Joi.number().integer().min(0).max(365).allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  // Sort whitelist mirrors what `jobs.controller`/`job.repository` can
  // honour, plus client-side sort hints (`closing_soon`, `remote_first`)
  // the frontend reorders locally after the response lands.
  sort: Joi.string().valid(
    'latest', 'best_match', 'salary_high', 'salary_low',
    'experience', 'featured', 'closing_soon', 'remote_first',
  ).default('latest'),
  include_below_threshold: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
  threshold: Joi.number().min(0).max(100).allow(null),
}).unknown(false);

const recommendedQuery = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(12),
}).unknown(false);

module.exports = {
  jobsQuery,
  recommendedQuery,
};
