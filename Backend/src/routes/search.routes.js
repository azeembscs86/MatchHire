'use strict';

/**
 * Search routes
 * -------------
 * Mounted at `/api/v1/search`. GET endpoints are public (they're the
 * primary discovery surface and run behind the rate limiter); the
 * analytics POST is open but optionalAuth-aware so signed-in clicks
 * carry the user id. Reindex endpoints require `admin`/`super_admin`.
 *
 * The reindex endpoints live alongside under `/api/v1/index/*` because
 * the user's spec lists them that way; we mount the same controller
 * functions from `routes/index.routes.js`.
 */

const router = require('express').Router();
const controller = require('../controllers/search.controller');
const asyncHandler = require('../utils/asyncHandler');
const { optionalAuth } = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /search/jobs:
 *   get:
 *     tags: [Search]
 *     summary: Full-text + filtered job search (ES with MySQL fallback)
 *     description: |
 *       Queries the ElasticSearch `jobs` index when available, falling
 *       back to MySQL when not. Supports fuzzy/typo tolerance,
 *       multi-field weighting, and the standard MatchHire filter set.
 *     security: []
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: role, in: query, schema: { type: string } }
 *       - { name: skills, in: query, schema: { type: string }, description: comma-separated }
 *       - { name: country, in: query, schema: { type: string } }
 *       - { name: city, in: query, schema: { type: string } }
 *       - { name: job_type, in: query, schema: { type: string } }
 *       - { name: work_mode, in: query, schema: { type: string, enum: [onsite, hybrid, remote] } }
 *       - { name: experience_level, in: query, schema: { type: string } }
 *       - { name: is_remote, in: query, schema: { type: boolean } }
 *       - { name: salary_min, in: query, schema: { type: number } }
 *       - { name: salary_max, in: query, schema: { type: number } }
 *       - { name: company_id, in: query, schema: { type: integer } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: sort, in: query, schema: { type: string, enum: [latest, salary_high, featured, relevance], default: relevance } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.get('/jobs', optionalAuth, asyncHandler(controller.searchJobs));

/**
 * @swagger
 * /search/candidates:
 *   get:
 *     tags: [Search]
 *     summary: Candidate search (ES with MySQL fallback)
 *     security: []
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: skill, in: query, schema: { type: string } }
 *       - { name: country, in: query, schema: { type: string } }
 *       - { name: city, in: query, schema: { type: string } }
 *       - { name: remote, in: query, schema: { type: boolean } }
 *       - { name: experience_min, in: query, schema: { type: number } }
 *       - { name: salary_min, in: query, schema: { type: number } }
 *       - { name: salary_max, in: query, schema: { type: number } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/candidates', optionalAuth, asyncHandler(controller.searchCandidates));

/**
 * @swagger
 * /search/companies:
 *   get:
 *     tags: [Search]
 *     summary: Company search (MySQL)
 *     security: []
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: industry, in: query, schema: { type: string } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/companies', asyncHandler(controller.searchCompanies));

/**
 * @swagger
 * /search/skills/autocomplete:
 *   get:
 *     tags: [Search]
 *     summary: Skill autocomplete (edge-ngram suggester)
 *     security: []
 *     parameters:
 *       - { name: q, in: query, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 25 } }
 *     responses:
 *       '200': { description: Skill suggestions, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/skills/autocomplete', asyncHandler(controller.autocompleteSkills));

/**
 * @swagger
 * /search/analytics:
 *   post:
 *     tags: [Search]
 *     summary: Record a search interaction (click, conversion, no-result)
 *     description: |
 *       Front-end pings this endpoint when a user clicks a result or
 *       submits an application from a search context. The endpoint
 *       always succeeds - analytics must not block UX.
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               index_name: { type: string }
 *               keyword: { type: string }
 *               country: { type: string }
 *               city: { type: string }
 *               filters: { type: object }
 *               result_count: { type: integer }
 *               clicked_id: { type: integer }
 *               converted_application_id: { type: integer }
 *               no_results: { type: boolean }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 */
router.post('/analytics', optionalAuth, asyncHandler(controller.recordAnalytics));

module.exports = router;
