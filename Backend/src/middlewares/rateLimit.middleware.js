'use strict';

/**
 * Rate-limiting middleware (express-rate-limit)
 * ---------------------------------------------
 * `defaultLimiter` - applied at `/api/v1`, sized for normal API traffic.
 * `authLimiter`    - tighter limit on register/login/refresh/reset endpoints
 *                    to slow down credential stuffing.
 *
 * Limits respond with the standard MatchHire error envelope so frontends do
 * not need to special-case "Too Many Requests".
 */

const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    Response: { responseCode: 0, status: 'Error', message: 'Too many requests, please try again later.' },
    Data: null,
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    Response: { responseCode: 0, status: 'Error', message: 'Too many authentication attempts.' },
    Data: null,
  },
});

module.exports = { defaultLimiter, authLimiter };
