'use strict';

/**
 * Home / Smart Jobs routes
 * ------------------------
 * Mounted at `/api/v1` so the public-facing URLs match the product spec:
 *
 *   GET /api/v1/home               - homepage aggregate
 *   GET /api/v1/jobs               - smart jobs feed (auth-aware)
 *   GET /api/v1/jobs/recommended   - personalised recommended jobs
 *   GET /api/v1/jobs/:id           - job detail (auth-decorated match)
 *
 * Every route uses `optionalAuth` so the SAME endpoint serves both
 * anonymous visitors (latest active jobs) and authenticated candidates
 * (personalised, threshold-filtered, ranked by match%).
 *
 * These coexist with the original public routes (`/public/jobs`,
 * `/public/jobs/:id`) — nothing in that older surface was changed.
 */

const router = require('express').Router();
const controller = require('../controllers/home.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/home.validator');
const pubV = require('../validators/public.validator');

/**
 * @swagger
 * /home:
 *   get:
 *     tags: [Home]
 *     summary: Homepage payload (auth-aware)
 *     description: |
 *       Returns the full homepage aggregate: hero stats, featured
 *       categories, top companies, latest jobs, and — for authenticated
 *       candidates — recommendedJobs, latestMatchedJobs, and an
 *       aiSuggestions block (career, profile, recommended job titles).
 *
 *       Guests receive a cached payload (15 min TTL). Authenticated
 *       payloads are computed per-request because they're per-user.
 *     security: []
 *     responses:
 *       '200':
 *         description: Homepage payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Home payload returned' }
 *               Data:
 *                 viewer: { authenticated: true, role: 'candidate', name: 'David Kim', profileCompletion: 85 }
 *                 hero: { openJobs: 240, companies: 220, candidates: 220 }
 *                 categories:
 *                   - { id: 1, name: 'Software Development', slug: 'software-development', open_jobs: 38 }
 *                 topCompanies:
 *                   - { id: 1, name: 'Systems Limited', industry: 'Software House', open_jobs: 7 }
 *                 latestJobs: []
 *                 recommendedJobs:
 *                   - { id: 12, title: 'Backend Engineer', matchPercentage: 88, aiRecommendationLabel: 'Excellent Match', matchedSkills: ['Node.js','MySQL'], missingSkills: ['Docker'] }
 *                 latestMatchedJobs: []
 *                 aiSuggestions:
 *                   careerImprovement: 'You are positioned for senior roles. Adding Docker, AWS would open up...'
 *                   profileImprovement: ['Add a LinkedIn URL', 'List at least 5 skills']
 *                   recommendedJobTitles: ['Backend Engineer', 'API Developer', 'Node.js Developer']
 *                 cta:
 *                   forEmployers: { eyebrow: 'For employers', title: 'Find senior talent...', actionHref: '/employer-onboarding' }
 */
router.get('/home', optionalAuth, asyncHandler(controller.home));

/**
 * @swagger
 * /jobs/recommended:
 *   get:
 *     tags: [Home]
 *     summary: Personalised recommended jobs (candidate-only, > 40% match)
 *     description: |
 *       Returns up to `limit` open jobs ranked by descending match%, filtered
 *       to the personalised threshold (40%). Guests fall through to the
 *       featured-jobs list with `personalised: false`.
 *     security: []
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 12, maximum: 50 } }
 *     responses:
 *       '200':
 *         description: Recommended jobs
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Recommended jobs returned' }
 *               Data:
 *                 personalised: true
 *                 records:
 *                   - id: 12
 *                     title: 'Senior Backend Engineer'
 *                     company_name: 'Systems Limited'
 *                     matchPercentage: 88
 *                     matchedSkills: ['Node.js', 'MySQL', 'Redis']
 *                     missingSkills: ['Docker']
 *                     matchReasons: ['Matches 3 of 4 required skills', 'You meet the senior experience band']
 *                     aiRecommendationLabel: 'Excellent Match'
 *                     aiSummary: 'Excellent Match. Senior Backend Engineer at Systems Limited aligns with your Node.js, MySQL, and Redis expertise.'
 *                 message: null
 */
router.get('/jobs/recommended', optionalAuth, validate(v.recommendedQuery, 'query'), asyncHandler(controller.recommendedJobs));

/**
 * @swagger
 * /jobs:
 *   get:
 *     tags: [Home]
 *     summary: Smart jobs feed (auth-aware, personalised when logged in)
 *     description: |
 *       Guests get the standard cached job listing. Authenticated
 *       candidates get the SAME endpoint but with each row scored,
 *       filtered to > 40% match (override with `include_below_threshold`),
 *       and ordered by match% desc.
 *     security: []
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: experience_level, in: query, schema: { type: string, enum: [entry, junior, mid, senior, lead, executive] } }
 *       - { name: job_type, in: query, schema: { type: string, enum: [full_time, part_time, contract, internship, temporary, freelance] } }
 *       - { name: skills, in: query, schema: { type: string }, description: comma-separated }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { name: include_below_threshold, in: query, schema: { type: boolean } }
 *       - { name: threshold, in: query, schema: { type: number, minimum: 0, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.get('/jobs', optionalAuth, validate(v.jobsQuery, 'query'), asyncHandler(controller.listJobs));

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     tags: [Home]
 *     summary: Job detail (with match information when authenticated)
 *     security: []
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200':
 *         description: Job detail
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 */
router.get('/jobs/:id', optionalAuth, validate(pubV.idParam, 'params'), asyncHandler(controller.getJob));

module.exports = router;
