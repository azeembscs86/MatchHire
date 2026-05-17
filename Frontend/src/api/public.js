/**
 * Public API client
 * -----------------
 * Wrappers around `/api/v1/public/*`. These endpoints are unauthenticated
 * and stay GET (server uses Redis cache when available). Filters travel
 * as URL query parameters.
 */
import { api, call } from './client.js';

export const publicApi = {
  jobs(params = {}) { return call(api.get('/public/jobs', { params })); },
  searchJobs(params = {}) { return call(api.get('/public/jobs/search', { params })); },
  job(id) { return call(api.get(`/public/jobs/${id}`)); },

  companies(params = {}) { return call(api.get('/public/companies', { params })); },
  company(id) { return call(api.get(`/public/companies/${id}`)); },

  candidates(params = {}) { return call(api.get('/public/candidates', { params })); },
  candidate(id) { return call(api.get(`/public/candidates/${id}`)); },

  categories() { return call(api.get('/public/categories')); },
  skills() { return call(api.get('/public/skills')); },

  topCandidates(limit = 8) { return call(api.get('/public/top-candidates', { params: { limit } })); },
  featuredCompanies(limit = 8) { return call(api.get('/public/featured-companies', { params: { limit } })); },
  featuredJobs(limit = 8) { return call(api.get('/public/featured-jobs', { params: { limit } })); },

  /** Role-aware menu structure (added in this milestone). */
  navigation() { return call(api.get('/public/navigation')); },
};
