'use strict';

/**
 * Auth controller
 * ---------------
 * HTTP boundary for the `/api/v1/auth` namespace. Translates between request
 * payload and the auth service. All flows (register, login, refresh, reset,
 * change-password, me) are intentionally POST per project rule.
 *
 * The service layer enforces business rules (duplicate email, hashing,
 * refresh token rotation, password reset token expiry).
 */

const authService = require('../services/auth.service');
const response = require('../utils/response.helper');

/** Snapshot request metadata used for refresh-token bookkeeping + audit. */
function meta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** POST /auth/register/candidate — creates a user (role=candidate) + profile. */
exports.registerCandidate = async (req, res) => {
  const data = await authService.registerCandidate(req.body, meta(req));
  return response.created(res, data, 'Candidate registered successfully');
};

/** POST /auth/register/employer — creates user + company + employer profile. */
exports.registerEmployer = async (req, res) => {
  const data = await authService.registerEmployer(req.body, meta(req));
  return response.created(res, data, 'Employer registered successfully');
};

/** POST /auth/login — verifies password, issues access + refresh tokens. */
exports.login = async (req, res) => {
  const data = await authService.login(req.body, meta(req));
  return response.success(res, data, 'Login successful');
};

/** POST /auth/logout — revokes the supplied refresh token. */
exports.logout = async (req, res) => {
  await authService.logout(req.body?.refresh_token);
  return response.success(res, {}, 'Logged out successfully');
};

/** POST /auth/refresh-token — rotates the refresh token, issues new access. */
exports.refreshToken = async (req, res) => {
  const data = await authService.rotateRefreshToken(req.body.refresh_token, meta(req));
  return response.success(res, data, 'Token refreshed');
};

/** POST /auth/forgot-password — issues a one-hour reset token (returned in demo). */
exports.forgotPassword = async (req, res) => {
  const data = await authService.forgotPassword(req.body.email);
  return response.success(res, {
    message: 'If the email exists, a reset link has been sent',
    reset_token: data.token,
  }, 'Password reset initiated');
};

/** POST /auth/reset-password — exchanges the reset token for a new password. */
exports.resetPassword = async (req, res) => {
  await authService.resetPassword(req.body);
  return response.success(res, {}, 'Password reset successful');
};

/** POST /auth/change-password — authenticated; revokes refresh tokens after success. */
exports.changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  return response.success(res, {}, 'Password changed successfully');
};

/** POST /auth/me — returns the authenticated user + role-specific profile. */
exports.me = async (req, res) => {
  const data = await authService.me(req.user.id);
  return response.success(res, data, 'User profile fetched');
};

/** GET /auth/verify-email/:token — link target from the verification email. */
exports.verifyEmailByLink = async (req, res) => {
  const data = await authService.verifyEmail(req.params.token);
  return response.success(res, data, 'Email verified successfully');
};

/** POST /auth/verify-email — accepts the token in the body (used by SPAs). */
exports.verifyEmail = async (req, res) => {
  const data = await authService.verifyEmail(req.body.token);
  return response.success(res, data, 'Email verified successfully');
};

/** POST /auth/resend-verification-email — re-issues the verification token. */
exports.resendVerification = async (req, res) => {
  const data = await authService.resendVerification(req.body.email, meta(req));
  return response.success(res, data, 'If the account exists and is unverified, a new email has been sent.');
};
