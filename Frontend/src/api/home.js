/**
 * Home / smart-jobs API client
 * ----------------------------
 * Wrappers around the auth-aware home + jobs feed (`/api/v1/home`,
 * `/api/v1/jobs`, `/api/v1/jobs/recommended`, `/api/v1/jobs/:id`).
 *
 * These endpoints accept an optional bearer token. The shared axios
 * client automatically attaches it when present, so the same call
 * returns guest data for anonymous visitors and personalised data for
 * signed-in candidates — no separate call paths needed.
 */
import { api, call } from './client.js';

export const homeApi = {
  /** Full homepage payload (auth-aware). */
  home() { return call(api.get('/home')); },

  /** Smart jobs feed (auth-aware, personalised when logged in). */
  jobs(params = {}) { return call(api.get('/jobs', { params })); },

  /** Personalised recommended jobs (logged-in candidates only). */
  recommended(limit = 12) { return call(api.get('/jobs/recommended', { params: { limit } })); },

  /** Single job detail (decorated with match info when logged in). */
  job(id) { return call(api.get(`/jobs/${id}`)); },
};
