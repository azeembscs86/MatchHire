'use strict';

/**
 * Reindex routes - mounted at `/api/v1/index`.
 *
 * Admin-only: blasts MySQL rows into ElasticSearch in batches. Idempotent
 * (re-creates missing indices, upserts on conflict). The endpoints
 * return `{ ok: true, indexed: <count> }` on success or
 * `{ ok: false, reason: 'elasticsearch_unavailable' }` when ES is down.
 */

const router = require('express').Router();
const controller = require('../controllers/search.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireAdmin } = require('../middlewares/role.middleware');

router.use(requireAuth, requireAdmin);

/**
 * @swagger
 * /index/jobs/reindex:
 *   post:
 *     tags: [Admin]
 *     summary: Bulk-reindex all open jobs into ElasticSearch
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Reindexed, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/jobs/reindex', asyncHandler(controller.reindexJobs));

/**
 * @swagger
 * /index/candidates/reindex:
 *   post:
 *     tags: [Admin]
 *     summary: Bulk-reindex public candidates
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Reindexed, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/candidates/reindex', asyncHandler(controller.reindexCandidates));

/**
 * @swagger
 * /index/resumes/reindex:
 *   post:
 *     tags: [Admin]
 *     summary: Bulk-reindex parsed resumes
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Reindexed, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/resumes/reindex', asyncHandler(controller.reindexResumes));

module.exports = router;
