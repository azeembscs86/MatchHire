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
const db = require('../config/database');

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

/**
 * requireActiveAccount
 *
 * Per-request status check that closes the post-login suspension
 * gap: a candidate suspended AFTER they signed in would otherwise
 * keep accessing the API until their JWT TTL expires (typically
 * 15–30 minutes). This middleware queries `users.status` once per
 * request and blocks anything outside the active set.
 *
 *   active     ✓ pass through
 *   pending    ✗ 403 ACCOUNT_PENDING       (awaiting admin approval)
 *   suspended  ✗ 403 ACCOUNT_DEACTIVATED   (super-admin disabled)
 *   inactive   ✗ 403 ACCOUNT_INACTIVE      (self-deactivated)
 *
 * Cost: one indexed PK lookup per authed request. If profiling
 * later shows this in the hot path, embed `status` in the JWT
 * claims (with a token-version bump for invalidation) — flagged
 * as deferred infra by the audit.
 *
 * Apply AFTER `requireAuth` so `req.user.id` is populated.
 */
function requireActiveAccount(req, res, next) {
  if (!req.user?.id) {
    return response.unauthorized(res, 'Authentication required');
  }
  db.queryOne('SELECT status FROM users WHERE id = ? LIMIT 1', [req.user.id])
    .then((row) => {
      if (!row) return response.unauthorized(res, 'Authentication token references unknown user');
      const status = String(row.status || '').toLowerCase();
      // Attach for downstream handlers + the role middleware.
      req.user.status = status;
      if (status === 'active') return next();
      const code = status === 'pending' ? 'ACCOUNT_PENDING'
        : status === 'suspended' ? 'ACCOUNT_DEACTIVATED'
        : 'ACCOUNT_INACTIVE';
      const message = status === 'pending'
        ? 'Your account is awaiting admin approval.'
        : status === 'suspended'
          ? 'Your account has been deactivated. Contact support if this is a mistake.'
          : 'Your account is inactive. Reactivate from your profile to continue.';
      return response.forbidden(res, message, { code, status });
    })
    .catch((err) => next(err));
}

module.exports = { authenticate, requireAuth, optionalAuth, requireActiveAccount };
