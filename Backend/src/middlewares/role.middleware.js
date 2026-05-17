'use strict';

/**
 * Role-based access control
 * -------------------------
 * Used after `requireAuth` to gate routes by role. Each helper returns 403
 * when the authenticated user is not in the allowed set.
 *
 *   requireRole(...allowed)   - generic
 *   requireCandidate          - candidate only
 *   requireEmployer           - employer only
 *   requireAdmin              - admin or super_admin
 *   requireSuperAdmin         - super_admin only
 */

const response = require('../utils/response.helper');
const { ROLES } = require('../constants/roles');

function requireRole(...allowed) {
  const set = new Set(allowed.flat());
  return function (req, res, next) {
    if (!req.user) return response.unauthorized(res, 'Authentication required');
    if (!set.has(req.user.role)) return response.forbidden(res, 'You do not have access to this resource');
    return next();
  };
}

const requireCandidate = requireRole(ROLES.CANDIDATE);
const requireEmployer = requireRole(ROLES.EMPLOYER);
const requireAdmin = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);
const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

module.exports = {
  requireRole,
  requireCandidate,
  requireEmployer,
  requireAdmin,
  requireSuperAdmin,
};
