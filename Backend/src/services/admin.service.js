'use strict';

/**
 * Admin service
 * -------------
 * Business logic for the admin/super_admin moderation surface.
 *
 *   - Aggregates platform-wide stats (cached briefly)
 *   - Updates user/company/job status and writes an audit log entry per action
 *   - Returns the live `health-summary` (DB + Redis up?, uptime, node version)
 *
 * Audit log writes flow through `meta.repository.writeAuditLog(...)`.
 */

const userRepo = require('../repositories/user.repository');
const companyRepo = require('../repositories/company.repository');
const jobRepo = require('../repositories/job.repository');
const appRepo = require('../repositories/application.repository');
const metaRepo = require('../repositories/meta.repository');
const cache = require('../cache/cache.helper');
const { buildPagination } = require('../utils/pagination');
const AppError = require('../utils/AppError');
const db = require('../config/database');
const redis = require('../config/redis');

async function dashboardStats() {
  const key = cache.Keys.dashboardStats('admin', 'global');
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const byRole = await userRepo.countByRole();
    const totalUsers = byRole.reduce((s, r) => s + Number(r.count), 0);
    const usersByRole = Object.fromEntries(byRole.map((r) => [r.role, Number(r.count)]));
    const totalJobs = await jobRepo.totalCount();
    const totalCompanies = await companyRepo.totalCount();
    const totalApplications = await appRepo.totalCount();
    return {
      users: { total: totalUsers, by_role: usersByRole },
      jobs: { total: totalJobs },
      companies: { total: totalCompanies },
      applications: { total: totalApplications },
    };
  });
}

async function listUsers(filters) {
  const { rows, total } = await userRepo.listWithFilters(filters);
  return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
}

async function updateUserStatus(admin_user_id, id, payload, meta = {}) {
  const user = await userRepo.findById(id);
  if (!user) throw new AppError('User not found', 404);
  await userRepo.setStatus(id, payload.status);
  await metaRepo.writeAuditLog({
    admin_user_id,
    action: 'update_user_status',
    entity_type: 'user',
    entity_id: id,
    description: `Set status to ${payload.status}`,
    meta: payload,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
  return userRepo.findById(id);
}

async function pendingCompanies(filters) {
  const { rows, total } = await companyRepo.listPending(filters);
  return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
}

async function verifyCompany(admin_user_id, id, payload, meta = {}) {
  const company = await companyRepo.findById(id);
  if (!company) throw new AppError('Company not found', 404);
  await companyRepo.updateVerification(id, payload.verification_status);
  await metaRepo.writeAuditLog({
    admin_user_id,
    action: 'verify_company',
    entity_type: 'company',
    entity_id: id,
    description: `Set verification to ${payload.verification_status}`,
    meta: payload,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
  await cache.deleteCache(cache.Keys.companyDetail(id));
  await cache.deleteByPattern(cache.Patterns.companiesList);
  return companyRepo.findById(id);
}

async function listJobsAdmin(filters) {
  const { rows, total } = await jobRepo.listAdmin(filters);
  return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
}

async function updateJobStatus(admin_user_id, id, payload, meta = {}) {
  const job = await jobRepo.findById(id);
  if (!job) throw new AppError('Job not found', 404);
  const fields = {};
  if (payload.status) fields.status = payload.status;
  if (payload.admin_status) fields.admin_status = payload.admin_status;
  await jobRepo.update(id, fields);
  await metaRepo.writeAuditLog({
    admin_user_id,
    action: 'update_job_status',
    entity_type: 'job',
    entity_id: id,
    description: `Updated job status`,
    meta: payload,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
  await cache.deleteCache(cache.Keys.jobDetail(id));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return jobRepo.findById(id);
}

async function reports() {
  const stats = await dashboardStats();
  const recentJobs = await db.query(
    `SELECT id, title, created_at, status FROM jobs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`
  );
  const recentSignups = await db.query(
    `SELECT id, full_name, email, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`
  );
  return { stats, recent_jobs: recentJobs, recent_signups: recentSignups };
}

async function auditLogs(filters) {
  const { rows, total } = await metaRepo.listAuditLogs(filters);
  return { records: rows, pagination: buildPagination(filters.page, filters.limit, total) };
}

async function healthSummary() {
  const dbOk = await db.ping();
  return {
    api: { status: 'up' },
    database: { status: dbOk ? 'up' : 'down' },
    redis: { status: redis.isReady() ? 'up' : 'down (fallback)' },
    uptime_seconds: Math.floor(process.uptime()),
    node_version: process.version,
  };
}

module.exports = {
  dashboardStats,
  listUsers,
  updateUserStatus,
  pendingCompanies,
  verifyCompany,
  listJobsAdmin,
  updateJobStatus,
  reports,
  auditLogs,
  healthSummary,
};
