/**
 * Admin API client
 * ----------------
 * Wrappers around `/api/v1/admin/*` (authenticated, POST-only, requires
 * role `admin` or `super_admin`).
 *
 * Every mutating endpoint writes to `admin_audit_logs` server-side.
 */
import { api, call } from './client.js';

export const adminApi = {
  dashboardStats() { return call(api.post('/admin/dashboard/stats')); },

  /**
   * Aggregated search-event trends (top keywords + zero-result rate
   * + conversion rate). Defaults to a 7-day window server-side;
   * pass `{ days: N }` to widen it (clamped 1–90 server-side).
   */
  searchTrends(body = {}) { return call(api.post('/admin/search-trends', body)); },

  users: {
    list(body = {}) { return call(api.post('/admin/users', body)); },
    setStatus(id, payload) { return call(api.post(`/admin/users/${id}/status`, payload)); },
  },

  companies: {
    pending(body = {}) { return call(api.post('/admin/companies/pending', body)); },
    verify(id, payload) { return call(api.post(`/admin/companies/${id}/verify`, payload)); },
  },

  jobs: {
    list(body = {}) { return call(api.post('/admin/jobs', body)); },
    setStatus(id, payload) { return call(api.post(`/admin/jobs/${id}/status`, payload)); },
  },

  reports() { return call(api.post('/admin/reports')); },
  auditLogs(body = {}) { return call(api.post('/admin/audit-logs', body)); },
  healthSummary() { return call(api.post('/admin/health-summary')); },
};
