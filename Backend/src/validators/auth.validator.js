'use strict';

/**
 * Auth validators
 * ---------------
 * Joi schemas for the authentication endpoints (registration, login, token
 * rotation, password reset/change). Password rule: minimum 8 chars and must
 * contain at least one letter and one digit.
 */

const Joi = require('joi');

const password = Joi.string().min(8).max(72).pattern(/[A-Za-z]/).pattern(/[0-9]/).required()
  .messages({ 'string.pattern.base': 'password must include letters and numbers' });

const registerCandidate = Joi.object({
  full_name: Joi.string().min(2).max(150).required(),
  email: Joi.string().email().max(190).required(),
  phone: Joi.string().max(30).allow('', null),
  password,
  headline: Joi.string().max(190).allow('', null),
  current_title: Joi.string().max(150).allow('', null),
  location: Joi.string().max(190).allow('', null),
  country: Joi.string().max(80).allow('', null),
  years_experience: Joi.number().min(0).max(60).default(0),
});

const registerEmployer = Joi.object({
  full_name: Joi.string().min(2).max(150).required(),
  email: Joi.string().email().max(190).required(),
  phone: Joi.string().max(30).allow('', null),
  password,
  designation: Joi.string().max(120).allow('', null),
  company: Joi.object({
    name: Joi.string().min(2).max(190).required(),
    website: Joi.string().uri().max(255).allow('', null),
    industry: Joi.string().max(120).allow('', null),
    size: Joi.string().max(50).allow('', null),
    location: Joi.string().max(190).allow('', null),
    country: Joi.string().max(80).allow('', null),
    description: Joi.string().max(5000).allow('', null),
  }).required(),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(1).max(72).required(),
});

const refreshToken = Joi.object({
  refresh_token: Joi.string().required(),
});

const forgotPassword = Joi.object({
  email: Joi.string().email().required(),
});

const resetPassword = Joi.object({
  token: Joi.string().required(),
  password,
});

const changePassword = Joi.object({
  current_password: Joi.string().required(),
  new_password: password,
});

module.exports = {
  registerCandidate,
  registerEmployer,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
};
