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
  remote: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('latest', 'best_match', 'salary_high', 'salary_low', 'experience', 'featured').default('latest'),
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
