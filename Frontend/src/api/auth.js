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

  /** Exchange email + password for tokens + user. */
  login(email, password) {
    return call(api.post('/auth/login', { email, password }));
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

  /** Begin a password reset; backend returns the token in demo mode. */
  forgotPassword(email) { return call(api.post('/auth/forgot-password', { email })); },

  /** Exchange a reset token for a new password. */
  resetPassword(token, password) { return call(api.post('/auth/reset-password', { token, password })); },

  /** Change password for the authenticated user. */
  changePassword(current_password, new_password) {
    return call(api.post('/auth/change-password', { current_password, new_password }));
  },

  /** Return the authenticated user + role-specific profile. */
  me() { return call(api.post('/auth/me')); },
};
