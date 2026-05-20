'use strict';

/**
 * Mail validators
 * ---------------
 * Joi schemas for the `/mail/*` test surface. The send-test body is
 * intentionally minimal (just `email`) per the product spec; the
 * optional OTP / welcome variants accept the template knobs so QA can
 * eyeball both templates without writing custom code.
 *
 * Validation runs through the shared `validate.middleware`, which
 * returns the canonical `{ Response: {...}, Errors: [...] }` envelope
 * on failure.
 */

const Joi = require('joi');

const sendTest = Joi.object({
  email: Joi.string().email().max(190).required(),
  // Optional template selector: defaults to a plain text smoke message.
  template: Joi.string().valid('plain', 'welcome', 'otp').default('plain'),
  // Optional template knobs (ignored when template === 'plain').
  name: Joi.string().max(150).allow('', null),
  code: Joi.string().max(12).allow('', null),
  purpose: Joi.string().max(80).allow('', null),
  expiresInMinutes: Joi.number().integer().min(1).max(60),
}).unknown(false);

const sendOtp = Joi.object({
  email: Joi.string().email().max(190).required(),
  code: Joi.string().min(4).max(12).required(),
  name: Joi.string().max(150).allow('', null),
  purpose: Joi.string().max(80).allow('', null),
  expiresInMinutes: Joi.number().integer().min(1).max(60).default(10),
}).unknown(false);

const sendWelcome = Joi.object({
  email: Joi.string().email().max(190).required(),
  name: Joi.string().max(150).allow('', null),
  dashboardUrl: Joi.string().uri().max(500).allow('', null),
}).unknown(false);

module.exports = {
  sendTest,
  sendOtp,
  sendWelcome,
};
