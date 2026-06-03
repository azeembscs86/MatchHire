'use strict';

/**
 * Admin routes
 * ------------
 * Mounted at `/api/v1/admin`. All routes require authentication and role
 * `admin` or `super_admin`. Every endpoint is POST per project rule.
 *
 * Mutating endpoints (status changes, verifications) write to the
 * `admin_audit_logs` table inside the service layer.
 */

const router = require('express').Router();
const controller = require('../controllers/admin.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireAdmin } = require('../middlewares/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/admin.validator');

router.use(requireAuth, requireAdmin);

/**
 * @swagger
 * /admin/dashboard/stats:
 *   post:
 *     tags: [Admin]
 *     summary: Platform-wide dashboard stats
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Stats, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/dashboard/stats', asyncHandler(controller.dashboardStats));

/**
 * @swagger
 * /admin/search-trends:
 *   post:
 *     tags: [Admin]
 *     summary: Aggregated search-event trends (top keywords + rates)
 *     description: |
 *       Reads from `search_events`. Returns the top 10 keywords in
 *       the window plus overall zero-result and conversion rates.
 *       Window defaults to 7 days; pass `{ days: N }` to widen it
 *       (clamped 1–90 server-side).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days: { type: integer, minimum: 1, maximum: 90, default: 7 }
 *     responses:
 *       '200': { description: Trends, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/search-trends', asyncHandler(controller.searchTrends));

/**
 * @swagger
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: List platform users with filters
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminUserListFilters' }
 *           example: { page: 1, limit: 10, role: "candidate", keyword: "kim" }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.post('/users', validate(v.listFilters), asyncHandler(controller.listUsers));

/**
 * @swagger
 * /admin/users/{id}/status:
 *   post:
 *     tags: [Admin]
 *     summary: Set a user's status
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UserStatusUpdate' }
 *           example: { status: "suspended", reason: "Multiple ToS violations" }
 *     responses:
 *       '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/users/:id/status', validate(v.idParam, 'params'), validate(v.userStatusUpdate), asyncHandler(controller.updateUserStatus));

/**
 * @swagger
 * /admin/companies/pending:
 *   post:
 *     tags: [Admin]
 *     summary: Companies awaiting verification
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminUserListFilters' }
 *           example: { page: 1, limit: 10 }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.post('/companies/pending', validate(v.listFilters), asyncHandler(controller.pendingCompanies));

/**
 * @swagger
 * /admin/companies/{id}/verify:
 *   post:
 *     tags: [Admin]
 *     summary: Verify or reject a company
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyVerifyRequest' }
 *           example: { verification_status: "verified", reason: "Domain match + reachable contact" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/companies/:id/verify', validate(v.idParam, 'params'), validate(v.companyVerify), asyncHandler(controller.verifyCompany));

/**
 * @swagger
 * /admin/jobs:
 *   post:
 *     tags: [Admin]
 *     summary: List jobs across the platform (admin view)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminUserListFilters' }
 *           example: { page: 1, limit: 10, status: "open", keyword: "engineer" }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.post('/jobs', validate(v.listFilters), asyncHandler(controller.listJobs));

/**
 * @swagger
 * /admin/jobs/{id}/status:
 *   post:
 *     tags: [Admin]
 *     summary: Moderate a job's status / admin_status
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JobStatusUpdate' }
 *           example: { admin_status: "rejected", reason: "Posting violates content policy" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:id/status', validate(v.idParam, 'params'), validate(v.jobStatusUpdate), asyncHandler(controller.updateJobStatus));

/**
 * @swagger
 * /admin/reports:
 *   post:
 *     tags: [Admin]
 *     summary: Reports overview (stats + recent activity)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Reports, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/reports', asyncHandler(controller.reports));

/**
 * @swagger
 * /admin/audit-logs:
 *   post:
 *     tags: [Admin]
 *     summary: Paginated audit logs of admin actions
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminUserListFilters' }
 *           example: { page: 1, limit: 20 }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.post('/audit-logs', validate(v.listFilters), asyncHandler(controller.auditLogs));

/**
 * @swagger
 * /admin/health-summary:
 *   post:
 *     tags: [Admin]
 *     summary: Service health summary (DB / Redis / uptime)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Health, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/health-summary', asyncHandler(controller.healthSummary));

module.exports = router;
