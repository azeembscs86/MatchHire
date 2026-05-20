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

  /**
   * Save Draft vs. Save & Publish toggle. Flips
   * `candidate_profiles.is_public` server-side. Kept separate from
   * `updateProfile` so the two buttons don't have to re-send the
   * whole form just to flip a single bit.
   */
  setPublishState(publish) {
    return call(api.post('/candidates/profile/publish-state', { publish: !!publish }));
  },

  /**
   * Work experience CRUD. Used by the multi-row Work Experience
   * card on the Profile page.
   */
  experience: {
    list() { return call(api.post('/candidates/experiences/list')); },
    create(payload) { return call(api.post('/candidates/experiences', payload)); },
    update(id, payload) { return call(api.post(`/candidates/experiences/${id}`, payload)); },
    remove(id) { return call(api.delete(`/candidates/experiences/${id}`)); },
  },

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

  /** Profile completion + recommended skills/titles + AI suggestions. */
  profileMatch() { return call(api.post('/candidates/profile-match')); },

  /**
   * Per-section completion breakdown (image/basic/contact/skills/...).
   * Drives the ProfileCompletionCard's progress bar + hints.
   */
  profileCompletion() { return call(api.get('/candidates/profile-completion')); },

  /** Composite read for the /profile/review page. */
  reviewProfile() { return call(api.get('/candidates/review-profile')); },

  /**
   * Upload (or replace) the profile image. `file` is the browser
   * File object — multer expects field name `image`.
   */
  uploadProfileImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    return call(api.post('/candidates/profile-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }));
  },

  /** Remove the candidate's profile image. */
  deleteProfileImage() { return call(api.delete('/candidates/profile-image')); },

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
