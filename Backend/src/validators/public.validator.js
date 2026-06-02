'use strict';

/**
 * Public validators
 * -----------------
 * Schemas for public (unauthenticated) endpoints. Public APIs remain GET,
 * so these schemas validate `req.query` for list endpoints and `req.params`
 * for path-id endpoints.
 */

const Joi = require('joi');

const idParam = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const jobIdParam = Joi.object({
  jobId: Joi.number().integer().positive().required(),
});

const applicationIdParam = Joi.object({
  applicationId: Joi.number().integer().positive().required(),
});

const candidateIdParam = Joi.object({
  candidateId: Joi.number().integer().positive().required(),
});

const jobsQuery = Joi.object({
  keyword: Joi.string().max(200).allow('', null),
  category: Joi.alternatives(Joi.string().max(150), Joi.number().integer().positive()).allow('', null),
  location: Joi.string().max(190).allow('', null),
  // Free-text company-name filter used by the Jobs page search bar.
  company: Joi.string().max(190).allow('', null),
  job_type: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance').allow('', null),
  experience_level: Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'executive').allow('', null),
  salary_min: Joi.number().min(0).allow(null),
  salary_max: Joi.number().min(0).allow(null),
  remote: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  company_id: Joi.number().integer().positive().allow(null),
  is_featured: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  // Restrict to jobs posted by verified companies. Wires through to
  // `jobRepo.listPublic`'s `c.verification_status = 'verified'` clause.
  verified_only: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  // Optional skill filter (CSV or repeated). Forwarded as-is to the
  // repository's `buildSkillsFilter` so the Jobs page sidebar can
  // hit the same search path as the homepage skill rail.
  skills: Joi.alternatives(
    Joi.string().max(500),
    Joi.array().items(Joi.string().max(60)).max(20),
  ).allow('', null),
  posted_within_days: Joi.number().integer().min(0).max(365).allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string().valid('latest', 'salary_high', 'salary_low', 'featured').default('latest'),
}).unknown(false);

const companiesQuery = Joi.object({
  keyword: Joi.string().max(190).allow('', null),
  industry: Joi.string().max(120).allow('', null),
  location: Joi.string().max(190).allow('', null),
  is_featured: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

const candidatesQuery = Joi.object({
  keyword: Joi.string().max(190).allow('', null),
  location: Joi.string().max(190).allow('', null),
  skill: Joi.string().max(80).allow('', null),
  remote: Joi.boolean().truthy('true', '1').falsy('false', '0').allow(null),
  experience_min: Joi.number().min(0).allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

module.exports = {
  idParam,
  jobIdParam,
  applicationIdParam,
  candidateIdParam,
  jobsQuery,
  companiesQuery,
  candidatesQuery,
};
