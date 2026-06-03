'use strict';

/**
 * Admin controller
 * ----------------
 * HTTP boundary for the `/api/v1/admin` namespace. Available only to users
 * with role `admin` or `super_admin`. Every endpoint is POST per the
 * project rule for authenticated APIs; list filters live on `req.body`.
 *
 * Each mutating endpoint writes an entry to `admin_audit_logs` (handled in
 * the service layer) capturing the actor, IP, and target entity.
 */

const service = require('../services/admin.service');
const response = require('../utils/response.helper');

/** Build the audit-log metadata captured for each admin action. */
function meta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** Top-level platform stats: users by role, jobs/companies/applications totals. */
exports.dashboardStats = async (req, res) => {
  const data = await service.dashboardStats();
  return response.success(res, data, 'Admin dashboard stats');
};

/**
 * Aggregated search trends (top keywords, zero-result rate,
 * conversion rate) for the admin moderation dashboard. Reads from
 * the existing `search_events` table; no new schema. Defaults to a
 * 7-day window; pass `{ days: N }` in the body to widen it (clamped
 * to 1–90 server-side).
 */
exports.searchTrends = async (req, res) => {
  const data = await service.searchTrends({ days: req.body?.days });
  return response.success(res, data, 'Search trends');
};

/** Paginated list of platform users, filterable by keyword/role/status. */
exports.listUsers = async (req, res) => {
  const data = await service.listUsers(req.body);
  return response.list(res, data.records, data.pagination, 'Users returned');
};

/** Set a user's status (active/inactive/suspended/pending) with audit log. */
exports.updateUserStatus = async (req, res) => {
  const data = await service.updateUserStatus(req.user.id, Number(req.params.id), req.body, meta(req));
  return response.success(res, data, 'User status updated');
};

/** Companies awaiting verification by an admin. */
exports.pendingCompanies = async (req, res) => {
  const data = await service.pendingCompanies(req.body);
  return response.list(res, data.records, data.pagination, 'Pending companies returned');
};

/** Approve or reject a company's verification status. */
exports.verifyCompany = async (req, res) => {
  const data = await service.verifyCompany(req.user.id, Number(req.params.id), req.body, meta(req));
  return response.success(res, data, 'Company verification updated');
};

/** Admin view of every job (including drafts, archived, rejected). */
exports.listJobs = async (req, res) => {
  const data = await service.listJobsAdmin(req.body);
  return response.list(res, data.records, data.pagination, 'Jobs returned');
};

/** Change job `status` and/or `admin_status` (moderation). */
exports.updateJobStatus = async (req, res) => {
  const data = await service.updateJobStatus(req.user.id, Number(req.params.id), req.body, meta(req));
  return response.success(res, data, 'Job status updated');
};

/** High-level reports payload (combines stats + recent activity). */
exports.reports = async (req, res) => {
  const data = await service.reports();
  return response.success(res, data, 'Reports returned');
};

/** Paginated audit log of admin actions. */
exports.auditLogs = async (req, res) => {
  const data = await service.auditLogs(req.body);
  return response.list(res, data.records, data.pagination, 'Audit logs returned');
};

/** Health summary: DB up?, Redis up?, uptime, node version. */
exports.healthSummary = async (req, res) => {
  const data = await service.healthSummary();
  return response.success(res, data, 'Health summary');
};
