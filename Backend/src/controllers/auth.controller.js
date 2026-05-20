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

/**
 * POST /auth/login — verifies password, issues access + refresh tokens.
 * Accepts `rememberMe` (optional, default false). When true the
 * backend issues a long-lived refresh token (90d) and the frontend
 * persists tokens in localStorage so the session survives browser
 * restarts. When false, the refresh-token TTL matches the env default
 * (typically 7d) and the frontend uses sessionStorage so a tab close
 * ends the session.
 */
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

/**
 * POST /auth/forgot-password — start a password reset.
 *
 * The response is intentionally the SAME shape regardless of whether
 * the email matches an account ("If this email exists, password
 * reset instructions have been sent."). This prevents user
 * enumeration via the public endpoint. In non-production the dev
 * convenience link is included on the `Data` block so the SPA flow
 * can be exercised without an inbox.
 */
exports.forgotPassword = async (req, res) => {
  const data = await authService.forgotPassword(req.body.email, meta(req));
  return response.success(res, {
    // Dev-only conveniences (null in production)
    reset_url: data.reset_url || null,
    reset_token: data.reset_token || null,
    expires_at: data.expires_at || null,
  }, 'If this email exists, password reset instructions have been sent.');
};

/**
 * POST /auth/verify-reset-token — read-only token check.
 * Used by the SPA reset page on mount to decide whether to render
 * the new-password form or redirect to /forgot-password with an
 * "expired" banner. Does NOT consume the token.
 */
exports.verifyResetToken = async (req, res) => {
  const data = await authService.verifyResetToken(req.body.token);
  if (!data.valid) {
    return response.error(
      res,
      data.reason === 'expired' ? 'Reset link expired'
        : data.reason === 'used' ? 'Reset link already used'
        : 'Invalid reset link',
      400,
      { reason: data.reason }
    );
  }
  return response.success(res, data, 'Reset token is valid');
};

/** POST /auth/reset-password — exchanges the reset token for a new password. */
exports.resetPassword = async (req, res) => {
  await authService.resetPassword(req.body, meta(req));
  return response.success(res, {}, 'Password reset successful. You can now sign in with your new password.');
};

/** POST /auth/change-password — authenticated; revokes refresh tokens after success. */
exports.changePassword = async (req, res) => {
  await authService.changePassword(req.user.id, req.body, meta(req));
  return response.success(res, {}, 'Password changed successfully. Sign in again on your other devices.');
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
