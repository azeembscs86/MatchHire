/**
 * Auth API client
 * ---------------
 * Thin wrappers around `/api/v1/auth/*`. Each function returns the
 * unwrapped `Data` payload (see `call` in client.js) or throws an
 * `Error` with `errors`/`httpStatus`/`status` on failure.
 *
 * The backend exposes two register endpoints (one per role); this
 * module hides that fork behind a single `register(role, payload)`
 * call so consumers don't branch on role themselves.
 */
import { api, call, tokens } from './client.js';

export const authApi = {
  /** Register a candidate or employer; backend issues access + refresh tokens. */
  register(role, payload) {
    const path = role === 'employer' ? '/auth/register/employer' : '/auth/register/candidate';
    return call(api.post(path, payload));
  },

  /**
   * Exchange email + password for tokens + user.
   * `rememberMe` (default false) tells the backend whether to issue
   * a long-lived refresh token; AuthContext separately decides which
   * browser store to persist tokens in.
   */
  login(email, password, rememberMe = false) {
    return call(api.post('/auth/login', { email, password, rememberMe }));
  },

  /** Revoke the current refresh token on the server, then wipe local storage. */
  async logout() {
    const refresh_token = tokens.getRefresh();
    try { await call(api.post('/auth/logout', { refresh_token })); } catch (_) { /* best-effort */ }
    tokens.clear();
  },

  /** Rotate the refresh + access token pair. */
  refresh() {
    const refresh_token = tokens.getRefresh();
    return call(api.post('/auth/refresh-token', { refresh_token }));
  },

  /** Begin a password reset. Response is generic (does not leak whether the email exists). */
  forgotPassword(email) { return call(api.post('/auth/forgot-password', { email })); },

  /** Read-only check that a reset token is still valid (does NOT consume it). */
  verifyResetToken(token) { return call(api.post('/auth/verify-reset-token', { token })); },

  /** Exchange a reset token for a new password. */
  resetPassword(token, password) { return call(api.post('/auth/reset-password', { token, password })); },

  /** Change password for the authenticated user. */
  changePassword(current_password, new_password) {
    return call(api.post('/auth/change-password', { current_password, new_password }));
  },

  /** Return the authenticated user + role-specific profile. */
  me() { return call(api.post('/auth/me')); },

  /** Consume an email-verification token (POST variant used by the SPA). */
  verifyEmail(token) { return call(api.post('/auth/verify-email', { token })); },

  /** Re-issue a verification email. Response is intentionally vague (does not leak whether the email exists). */
  resendVerification(email) { return call(api.post('/auth/resend-verification-email', { email })); },
};
