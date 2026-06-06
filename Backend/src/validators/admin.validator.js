'use strict';

/**
 * Admin validators
 * ----------------
 * Joi schemas guarding admin/super_admin endpoints. All authenticated admin
 * APIs are POST-only (project rule), so list/filter shapes are validated as
 * `req.body` rather than `req.query`.
 */

const Joi = require('joi');

const idParam = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const userStatusUpdate = Joi.object({
  status: Joi.string().valid('active', 'inactive', 'suspended', 'pending').required(),
  reason: Joi.string().max(500).allow('', null),
});

const companyVerify = Joi.object({
  verification_status: Joi.string().valid('verified', 'rejected', 'pending').required(),
  reason: Joi.string().max(500).allow('', null),
});

const jobStatusUpdate = Joi.object({
  status: Joi.string().valid('open', 'closed', 'archived').optional(),
  admin_status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  reason: Joi.string().max(500).allow('', null),
}).or('status', 'admin_status');

/** List filters for admin POST listing endpoints. */
const listFilters = Joi.object({
  keyword: Joi.string().max(190).allow('', null),
  role: Joi.string().valid('candidate', 'employer', 'admin', 'super_admin').allow('', null),
  status: Joi.string().max(40).allow('', null),
  // Moderation-queue filter on `jobs.admin_status`. Only meaningful
  // on the admin jobs listing; user/company endpoints ignore it.
  admin_status: Joi.string().valid('pending', 'approved', 'rejected').allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
}).unknown(false);

module.exports = {
  idParam,
  userStatusUpdate,
  companyVerify,
  jobStatusUpdate,
  listFilters,
};
