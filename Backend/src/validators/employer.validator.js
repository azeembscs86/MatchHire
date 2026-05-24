'use strict';

/**
 * Employer validators
 * -------------------
 * All authenticated employer APIs are POST-only. The list/filter validators
 * (`jobListFilters`, `applicantListFilters`) operate on request bodies.
 */

const Joi = require('joi');

const companyUpdate = Joi.object({
  name: Joi.string().min(2).max(190),
  tagline: Joi.string().max(255).allow('', null),
  description: Joi.string().max(10000).allow('', null),
  industry: Joi.string().max(120).allow('', null),
  size: Joi.string().max(50).allow('', null),
  website: Joi.string().uri().max(255).allow('', null),
  logo_url: Joi.string().uri().max(500).allow('', null),
  cover_url: Joi.string().uri().max(500).allow('', null),
  location: Joi.string().max(190).allow('', null),
  country: Joi.string().max(80).allow('', null),
  founded_year: Joi.number().integer().min(1800).max(new Date().getFullYear()),
}).min(1);

const jobCreate = Joi.object({
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().min(10).max(20000).required(),
  responsibilities: Joi.string().max(10000).allow('', null),
  requirements: Joi.string().max(10000).allow('', null),
  benefits: Joi.string().max(10000).allow('', null),
  category_id: Joi.number().integer().positive().allow(null),
  job_type: Joi.string().valid('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance').default('full_time'),
  experience_level: Joi.string().valid('entry', 'junior', 'mid', 'senior', 'lead', 'executive').default('mid'),
  location: Joi.string().max(190).allow('', null),
  country: Joi.string().max(80).allow('', null),
  /*
   * `work_mode` is the canonical 3-state field shown as a badge on
   * every job card. Defaults to "onsite" if the employer leaves the
   * field empty — this matches the DB column default and means
   * cards never show a blank work-mode chip.
   */
  work_mode: Joi.string().valid('onsite', 'hybrid', 'remote').default('onsite'),
  /*
   * Legacy boolean alias kept so older clients that still send
   * `is_remote` keep working. The repository normalises it into
   * `work_mode` when the new field is absent.
   */
  is_remote: Joi.boolean().default(false),
  is_global_remote: Joi.boolean().default(false),
  salary_min: Joi.number().min(0).allow(null),
  salary_max: Joi.number().min(0).allow(null),
  salary_currency: Joi.string().max(8).default('USD'),
  salary_period: Joi.string().valid('hour', 'day', 'month', 'year').default('year'),
  skills_tags: Joi.array().items(Joi.string().max(60)).max(30).default([]),
  application_deadline: Joi.date().iso().allow(null),
  vacancies: Joi.number().integer().min(1).max(10000).default(1),
  is_featured: Joi.boolean().default(false),
  status: Joi.string().valid('draft', 'open').default('open'),
});

const jobUpdate = jobCreate.fork(
  ['title', 'description'],
  (s) => s.optional()
).min(1);

const interviewCreate = Joi.object({
  application_id: Joi.number().integer().positive().required(),
  scheduled_at: Joi.date().iso().required(),
  duration_minutes: Joi.number().integer().min(5).max(480).default(45),
  mode: Joi.string().valid('onsite', 'phone', 'video', 'assessment').default('video'),
  location: Joi.string().max(255).allow('', null),
  meeting_url: Joi.string().uri().max(500).allow('', null),
  notes: Joi.string().max(5000).allow('', null),
});

/** Body for POST /employers/jobs/list */
const jobListFilters = Joi.object({
  status: Joi.string().valid('draft', 'open', 'closed', 'archived').allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

/** Body for POST /employers/jobs/:jobId/applicants */
const applicantListFilters = Joi.object({
  status: Joi.string().valid('applied', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn').allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

/** Body for POST /employers/applications/:applicationId/reject (reason only). */
const rejectionReason = Joi.object({
  reason: Joi.string().max(500).allow('', null),
}).unknown(false);

module.exports = {
  companyUpdate,
  jobCreate,
  jobUpdate,
  interviewCreate,
  jobListFilters,
  applicantListFilters,
  rejectionReason,
};
