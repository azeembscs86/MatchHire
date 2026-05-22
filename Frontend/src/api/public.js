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
  /**
   * "Recommended Jobs for You" rail on the Job Detail page. When the
   * client is signed in, the backend re-ranks by the candidate's own
   * skills and excludes already-applied rows. Always excludes expired
   * postings and the anchor job itself.
   */
  similarJobs(id, limit = 6) {
    return call(api.get(`/public/jobs/${id}/similar`, { params: { limit } }));
  },

  companies(params = {}) { return call(api.get('/public/companies', { params })); },
  company(id) { return call(api.get(`/public/companies/${id}`)); },

  candidates(params = {}) { return call(api.get('/public/candidates', { params })); },
  candidate(id) { return call(api.get(`/public/candidates/${id}`)); },

  categories() { return call(api.get('/public/categories')); },
  skills() { return call(api.get('/public/skills')); },

  topCandidates(limit = 8) { return call(api.get('/public/top-candidates', { params: { limit } })); },
  featuredCompanies(limit = 8) { return call(api.get('/public/featured-companies', { params: { limit } })); },
  featuredJobs(limit = 8) { return call(api.get('/public/featured-jobs', { params: { limit } })); },

  /** Role-aware menu structure. */
  navigation() { return call(api.get('/public/navigation')); },

  /** Location-prioritised feed; carries match_score when authed. */
  locationBasedJobs(params = {}) { return call(api.get('/public/jobs/location-based', { params })); },

  /** Country / city reference data for the location picker. */
  countries() { return call(api.get('/public/countries')); },
  cities(country_id) { return call(api.get('/public/cities', { params: { country_id } })); },

  /** Server-side IP geolocation fallback (used when the browser denies permission). */
  geolocate() { return call(api.get('/public/geolocate')); },
};
