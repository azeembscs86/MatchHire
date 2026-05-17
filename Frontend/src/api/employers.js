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
    applicants(jobId, body = {}) { return call(api.post(`/employers/jobs/${jobId}/applicants`, body)); },
  },

  applications: {
    shortlist(applicationId) { return call(api.post(`/employers/applications/${applicationId}/shortlist`)); },
    reject(applicationId, reason) { return call(api.post(`/employers/applications/${applicationId}/reject`, { reason })); },
  },

  scheduleInterview(payload) { return call(api.post('/employers/interviews', payload)); },

  dashboardStats() { return call(api.post('/employers/dashboard/stats')); },
};
