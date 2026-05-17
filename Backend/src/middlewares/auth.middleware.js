'use strict';

/**
 * Authentication middleware
 * -------------------------
 * Decodes the `Authorization: Bearer <jwt>` header and attaches a minimal
 * `req.user` (id, role, email, full_name) on success.
 *
 *   requireAuth   - rejects unauthenticated requests with 401
 *   optionalAuth  - attaches `req.user` if the token is valid, never errors
 *
 * Role checks are performed by the separate `role.middleware.js`.
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const response = require('../utils/response.helper');

function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && typeof req.query.access_token === 'string') return req.query.access_token;
  return null;
}

function authenticate(options = { required: true }) {
  return function (req, res, next) {
    const token = extractToken(req);
    if (!token) {
      if (options.required) return response.unauthorized(res, 'Authentication token missing');
      return next();
    }
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = {
        id: decoded.sub,
        role: decoded.role,
        email: decoded.email,
        full_name: decoded.full_name,
      };
      return next();
    } catch (_err) {
      if (options.required) return response.unauthorized(res, 'Invalid or expired token');
      return next();
    }
  };
}

const requireAuth = authenticate({ required: true });
const optionalAuth = authenticate({ required: false });

module.exports = { authenticate, requireAuth, optionalAuth };
