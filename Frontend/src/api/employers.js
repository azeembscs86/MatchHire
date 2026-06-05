/**
 * Employer API client
 * -------------------
 * Wrappers around `/api/v1/employers/*` (authenticated, POST-only).
 *
 * Ownership is enforced server-side: every mutation on a job verifies
 * that the calling employer belongs to the company that owns the job,
 * so the client doesn't need to track that itself.
 */
import { api, call } from './client.js';

export const employersApi = {
  company: {
    get() { return call(api.post('/employers/company-profile')); },
    update(payload) { return call(api.post('/employers/company-profile/update', payload)); },
  },

  jobs: {
    create(payload) { return call(api.post('/employers/jobs', payload)); },
    list(body = {}) { return call(api.post('/employers/jobs/list', body)); },
    update(jobId, payload) { return call(api.post(`/employers/jobs/${jobId}/update`, payload)); },
    remove(jobId) { return call(api.post(`/employers/jobs/${jobId}/delete`)); },
    close(jobId) { return call(api.post(`/employers/jobs/${jobId}/close`)); },
    /**
     * Reactivate an expired or closed job. `payload` requires a
     * future ISO `application_deadline`; optional content fields
     * (title, description, requirements, skills_tags, salary_*,
     * work_mode, etc.) flip the job into admin-pending state.
     * Date-only reactivations go live immediately.
     *
     * Response Data shape:
     *   { job, requires_approval: boolean, fields_changed: string[] }
     */
    reactivate(jobId, payload) {
      return call(api.post(`/employers/jobs/${jobId}/reactivate`, payload));
    },
    applicants(jobId, body = {}) { return call(api.post(`/employers/jobs/${jobId}/applicants`, body)); },
    /**
     * AI bulk-shortlist: backend walks every actionable applicant
     * on the job, scores each candidate against the role, and
     * flips status to 'shortlisted' for matches >= 60%. Idempotent
     * — rows already in a downstream state are skipped.
     *
     * Response shape:
     *   {
     *     job_id, threshold,
     *     actionable, shortlisted, skipped_below_threshold,
     *     shortlisted_application_ids: number[]
     *   }
     */
    autoShortlist(jobId) {
      return call(api.post(`/employers/jobs/${jobId}/auto-shortlist`));
    },
  },

  applications: {
    shortlist(applicationId) { return call(api.post(`/employers/applications/${applicationId}/shortlist`)); },
    /**
     * Reject an application. `reason` must be one of the canonical
     * keys from `data/rejection-reasons.js` (Joi-enforced server-side).
     * When `reason === 'other'`, `customReason` is required — the
     * employer-supplied free text is persisted alongside the key so
     * the candidate sees the original wording.
     */
    reject(applicationId, reason, customReason) {
      const body = { reason };
      if (customReason) body.custom_reason = customReason;
      return call(api.post(`/employers/applications/${applicationId}/reject`, body));
    },
  },

  scheduleInterview(payload) { return call(api.post('/employers/interviews', payload)); },

  dashboardStats() { return call(api.post('/employers/dashboard/stats')); },

  /**
   * Matching jobs at the logged-in employer's company for the given
   * candidate. Server filters to active, non-expired postings with
   * match score > 60 and sorts highest match first.
   */
  matchingJobsForCandidate(candidateId) {
    return call(api.post(`/employers/candidates/${candidateId}/matching-jobs`));
  },

  /**
   * AI-ranked candidates that match the viewer's active jobs above
   * 50%. Replaces the generic candidate browse for company viewers.
   * Server enforces the floor + sorts by best score; the client just
   * renders.
   */
  recommendedCandidates(body = {}) {
    return call(api.post('/employers/recommended-candidates', body));
  },

  /**
   * Request a short-lived signed URL for a candidate's resume.
   * Backend enforces role=employer + candidate-is-public + has a
   * resume on file. Caller opens the URL directly — the storage
   * path itself never reaches the browser.
   */
  downloadCandidateResume(candidateId) {
    return call(api.post(`/employers/candidates/${candidateId}/resume/download`));
  },
};
