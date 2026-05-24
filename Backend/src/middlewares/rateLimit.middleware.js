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

// In non-production environments, skip the rate limiter for
// requests originating from localhost. The QA automation suite
// makes hundreds of requests in quick succession (axe-core
// page audits, link integrity walks, responsive viewport
// renders), all from 127.0.0.1 — and triggering "Too many
// requests" on every other re-run is a noisy false positive that
// doesn't represent anything users would hit in production.
//
// Production is unaffected: NODE_ENV=production always enforces.
function isLocalhost(req) {
  if (process.env.NODE_ENV === 'production') return false;
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const defaultLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
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
  skip: isLocalhost,
  message: {
    Response: { responseCode: 0, status: 'Error', message: 'Too many authentication attempts.' },
    Data: null,
  },
});

module.exports = { defaultLimiter, authLimiter };
