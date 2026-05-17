/**
 * Candidate API client
 * --------------------
 * Wrappers around `/api/v1/candidates/*` (authenticated, POST-only per
 * project rule). Pagination/filters travel in the request body.
 */
import { api, call } from './client.js';

export const candidatesApi = {
  /** Read profile + skills + preferences in one call. */
  profile() { return call(api.post('/candidates/profile')); },

  /** Update the candidate's profile (any subset of fields). */
  updateProfile(payload) { return call(api.post('/candidates/profile/update', payload)); },

  /** Replace the full set of skills (idempotent). */
  updateSkills(skills) { return call(api.post('/candidates/skills', { skills })); },

  /** Upsert job preferences. */
  updatePreferences(payload) { return call(api.post('/candidates/preferences', payload)); },

  /** Personalised job recommendations. */
  recommendedJobs(limit = 10) { return call(api.post('/candidates/recommended-jobs', { limit })); },

  favorites: {
    list(body = {}) { return call(api.post('/candidates/favorites/list', body)); },
    add(jobId) { return call(api.post(`/candidates/favorites/${jobId}/add`)); },
    remove(jobId) { return call(api.post(`/candidates/favorites/${jobId}/remove`)); },
  },

  applications: {
    apply(jobId, payload = {}) { return call(api.post(`/candidates/applications/${jobId}`, payload)); },
    list(body = {}) { return call(api.post('/candidates/applications/list', body)); },
  },

  dashboardStats() { return call(api.post('/candidates/dashboard/stats')); },

  /** Skill-based ranked recommendations. */
  matchJobs(body = {}) { return call(api.post('/candidates/jobs/match', body)); },

  /** Match-validated job application (rejects hard mismatches with a polite reason). */
  validateAndApply(jobId, body = {}) {
    return call(api.post(`/candidates/applications/${jobId}/validate-and-apply`, body));
  },

  resume: {
    list() { return call(api.post('/candidates/resume/list')); },
    /** Multipart upload. `file` is the browser File object. */
    upload(file) {
      const fd = new FormData();
      fd.append('resume', file);
      return call(api.post('/candidates/resume/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }));
    },
    parse(id) { return call(api.post(`/candidates/resume/${id}/parse`)); },
    preview(id) { return call(api.post(`/candidates/resume/${id}/preview`)); },
    confirm(id, fields = {}) { return call(api.post(`/candidates/resume/${id}/confirm`, fields)); },
    signedUrl(id) { return call(api.post(`/candidates/resume/${id}/download`)); },
  },
};
