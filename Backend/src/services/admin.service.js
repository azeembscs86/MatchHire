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

    // Moderation queue counter — surfaces the "Pending job
    // approvals" tile on the admin dashboard. One round-trip
    // alongside the other counts so it lands in the same cache
    // window. Reads from `admin_status='pending'` directly rather
    // than going through listAdmin to avoid a paginated query.
    const pendingJobsRow = await db.queryOne(
      `SELECT COUNT(*) AS n FROM jobs WHERE deleted_at IS NULL AND admin_status = 'pending'`
    );
    const pendingJobsTotal = Number(pendingJobsRow?.n || 0);
    const pendingCompaniesRow = await db.queryOne(
      `SELECT COUNT(*) AS n FROM companies WHERE deleted_at IS NULL AND verification_status = 'pending'`
    );
    const pendingCompaniesTotal = Number(pendingCompaniesRow?.n || 0);

    // Hiring rate — what fraction of applications convert into a
    // hired status. Computed in one round-trip so the dashboard tile
    // updates with the same TTL as the rest of the stats.
    const hiredRow = await db.queryOne(
      `SELECT COUNT(*) AS n FROM applications WHERE status = 'hired'`
    );
    const hiredTotal = Number(hiredRow?.n || 0);
    const hiringRate = totalApplications > 0
      ? Math.round((hiredTotal / totalApplications) * 1000) / 10  // one decimal
      : 0;

    // User activity counters — drives the "Active users" tile on the
    // admin dashboard and is the cheapest signal for User Activity
    // Monitoring. Reads existing `users.last_login_at` so no new
    // column or session table is required.
    const activity24h = Number((await db.queryOne(
      `SELECT COUNT(*) AS n FROM users
        WHERE deleted_at IS NULL
          AND last_login_at IS NOT NULL
          AND last_login_at >= (NOW() - INTERVAL 24 HOUR)`
    ))?.n || 0);
    const activity7d = Number((await db.queryOne(
      `SELECT COUNT(*) AS n FROM users
        WHERE deleted_at IS NULL
          AND last_login_at IS NOT NULL
          AND last_login_at >= (NOW() - INTERVAL 7 DAY)`
    ))?.n || 0);
    const activity30d = Number((await db.queryOne(
      `SELECT COUNT(*) AS n FROM users
        WHERE deleted_at IS NULL
          AND last_login_at IS NOT NULL
          AND last_login_at >= (NOW() - INTERVAL 30 DAY)`
    ))?.n || 0);

    return {
      users: { total: totalUsers, by_role: usersByRole },
      jobs: { total: totalJobs, pending: pendingJobsTotal },
      companies: { total: totalCompanies, pending: pendingCompaniesTotal },
      applications: { total: totalApplications, hired: hiredTotal },
      hiring_rate: hiringRate,
      activity: { last_24h: activity24h, last_7d: activity7d, last_30d: activity30d },
    };
  });
}

/**
 * Aggregated search-event trends for the admin dashboard.
 *
 * Reads from the existing `search_events` table (migration 027) —
 * already capturing every front-end search with keyword, result
 * count, click, and conversion data. The endpoint surfaces the
 * three numbers most useful for moderation triage:
 *
 *   top_keywords         the 10 most-searched terms in the window
 *   zero_result_rate     % of searches that returned no rows
 *   conversion_rate      % of searches that led to an application
 *   total_searches       window total — frames the percentages
 *
 * Window defaults to the last 7 days; callers may pass a custom
 * `days` filter (clamped to 1–90). Cached briefly so dashboard
 * loads don't hammer the analytics index.
 */
async function searchTrends({ days = 7 } = {}) {
  const window = Math.max(1, Math.min(90, Number(days) || 7));
  const key = `admin:search-trends:${window}`;
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const params = [window];
    const top = await db.query(
      `SELECT LOWER(keyword) AS keyword, COUNT(*) AS searches,
              SUM(CASE WHEN no_results = 1 THEN 1 ELSE 0 END) AS dry_runs,
              SUM(CASE WHEN converted_application_id IS NOT NULL THEN 1 ELSE 0 END) AS conversions
         FROM search_events
        WHERE keyword IS NOT NULL AND keyword <> ''
          AND created_at >= (NOW() - INTERVAL ? DAY)
        GROUP BY LOWER(keyword)
        ORDER BY searches DESC
        LIMIT 10`,
      params
    );
    const totals = await db.queryOne(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN no_results = 1 THEN 1 ELSE 0 END) AS dry_runs,
              SUM(CASE WHEN converted_application_id IS NOT NULL THEN 1 ELSE 0 END) AS conversions
         FROM search_events
        WHERE created_at >= (NOW() - INTERVAL ? DAY)`,
      params
    );
    const total = Number(totals?.total || 0);
    const zeroResultRate = total > 0
      ? Math.round((Number(totals.dry_runs || 0) / total) * 1000) / 10
      : 0;
    const conversionRate = total > 0
      ? Math.round((Number(totals.conversions || 0) / total) * 1000) / 10
      : 0;
    return {
      window_days: window,
      total_searches: total,
      zero_result_rate: zeroResultRate,
      conversion_rate: conversionRate,
      top_keywords: (top || []).map((r) => ({
        keyword: r.keyword,
        searches: Number(r.searches || 0),
        dry_runs: Number(r.dry_runs || 0),
        conversions: Number(r.conversions || 0),
      })),
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
  searchTrends,
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
