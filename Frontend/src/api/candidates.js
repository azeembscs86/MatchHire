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

  /**
   * Saved-for-later jobs (apply intent surface).
   *
   * Distinct from `favorites` — see migration 035. The save endpoint
   * is idempotent server-side (re-saving touches `updated_at`), so
   * the SPA can call it as a fire-and-forget toggle without
   * pre-checking existence.
   *
   * `eligibility` is a no-write dry-run that returns the same verdict
   * shape `validate-and-apply` uses (`{ can_apply, decision,
   * match_score, missing, message }`). The apply modal hits it
   * before opening so the Apply button can be gated client-side.
   */
  savedJobs: {
    list(body = {}) { return call(api.post('/candidates/saved-jobs/list', body)); },
    save(jobId)     { return call(api.post(`/candidates/saved-jobs/${jobId}/save`)); },
    remove(jobId)   { return call(api.post(`/candidates/saved-jobs/${jobId}/remove`)); },
    eligibility(jobId) { return call(api.post(`/candidates/saved-jobs/${jobId}/eligibility`)); },
  },

  applications: {
    apply(jobId, payload = {}) { return call(api.post(`/candidates/applications/${jobId}`, payload)); },
    list(body = {}) { return call(api.post('/candidates/applications/list', body)); },
    /** Withdraw one of the candidate's own applications (status → withdrawn). */
    withdraw(applicationId) { return call(api.post(`/candidates/applications/${applicationId}/withdraw`)); },
  },

  dashboardStats() { return call(api.post('/candidates/dashboard/stats')); },

  /**
   * AI Career-dashboard score band. Returns four derived 0–100
   * scores (profile / AI match / interview readiness / salary
   * potential) plus tier labels and diagnostic counts. Cached
   * server-side for `DASHBOARD_STATS` TTL.
   */
  employabilitySnapshot() {
    return call(api.post('/candidates/employability-snapshot'));
  },

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

  /**
   * Onboarding Wizard state surface.
   * Per-step DATA is saved through the other endpoints
   * (updateProfile, updateSkills, experience.*, updatePreferences,
   * resume.*); these endpoints only persist the wizard's progress
   * so the user can resume after closing the tab.
   */
  onboarding: {
    /** Read current step + completion breakdown. */
    state() { return call(api.post('/candidates/onboarding/state')); },
    /** Move to a new step (or pass `complete: true` to finish). */
    advance(step, complete = false) {
      return call(api.post('/candidates/onboarding/advance', { step, complete }));
    },
    /** Reset to step 0 (clears the completion timestamp). */
    reset() { return call(api.post('/candidates/onboarding/reset')); },
  },

  /**
   * Work Portfolio & Achievements — CRUD for the logged-in
   * candidate. The companion foreign-viewer fetch lives on
   * `publicApi.candidatePortfolio` so the visibility gate runs
   * on the server.
   */
  portfolio: {
    list() { return call(api.post('/candidates/portfolio/list')); },
    create(payload) { return call(api.post('/candidates/portfolio', payload)); },
    update(id, payload) { return call(api.post(`/candidates/portfolio/${id}/update`, payload)); },
    remove(id) { return call(api.post(`/candidates/portfolio/${id}/delete`)); },
  },

  /**
   * "Similar Professionals" feed for the logged-in candidate.
   * Server returns rows with similarity_score > 50%, sorted desc.
   */
  similarCandidates(body = {}) {
    return call(api.post('/candidates/similar', body));
  },

  /**
   * Send a candidate-to-candidate professional message. Server
   * gates on content (regex / banned terms) + similarity (>50%);
   * 422 on content reject, 403 on similarity gate.
   */
  sendMessage(candidateId, payload) {
    return call(api.post(`/candidates/${candidateId}/message`, payload));
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
    /* Resume management (§34) — five candidate-facing actions on top
       of the upload/parse/confirm pipeline. */
    detail(id)        { return call(api.post(`/candidates/resume/${id}/detail`)); },
    setPrimary(id)    { return call(api.post(`/candidates/resume/${id}/set-primary`)); },
    delete(id)        { return call(api.post(`/candidates/resume/${id}/delete`)); },
    updateParsed(id, fields = {}) { return call(api.post(`/candidates/resume/${id}/parsed-data`, fields)); },
    reject(id, reason = '')       { return call(api.post(`/candidates/resume/${id}/reject`, { reason })); },
  },
};
