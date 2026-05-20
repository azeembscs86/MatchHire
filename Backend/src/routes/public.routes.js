'use strict';

/**
 * Public routes
 * -------------
 * Mounted at `/api/v1/public`. These are the only routes that do not require
 * authentication and remain GET (project rule allows GET on public list/detail).
 *
 * Results are cached in Redis with sensible TTLs. The service layer
 * transparently falls back to MySQL when Redis is unavailable.
 */

const router = require('express').Router();
const controller = require('../controllers/public.controller');
const validate = require('../middlewares/validate.middleware');
const { optionalAuth } = require('../middlewares/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/public.validator');

/**
 * @swagger
 * /public/jobs/search:
 *   get:
 *     tags: [Public]
 *     summary: Search jobs (alias of /public/jobs)
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: category, in: query, schema: { oneOf: [{ type: integer }, { type: string }] } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: job_type, in: query, schema: { type: string, enum: [full_time, part_time, contract, internship, temporary, freelance] } }
 *       - { name: experience_level, in: query, schema: { type: string, enum: [entry, junior, mid, senior, lead, executive] } }
 *       - { name: salary_min, in: query, schema: { type: number } }
 *       - { name: salary_max, in: query, schema: { type: number } }
 *       - { name: remote, in: query, schema: { type: boolean } }
 *       - { name: company_id, in: query, schema: { type: integer } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 100 } }
 *       - { name: sort, in: query, schema: { type: string, enum: [latest, salary_high, salary_low, featured] } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.get('/jobs/search', validate(v.jobsQuery, 'query'), asyncHandler(controller.searchJobs));

/**
 * @swagger
 * /public/jobs/location-based:
 *   get:
 *     tags: [Public]
 *     summary: Location-prioritised job feed (city > country > global remote)
 *     description: |
 *       Ranks open jobs by relevance to the supplied location. With a
 *       candidate bearer token, every record carries `match_score`,
 *       `reasons[]`, and `missing[]` so the UI can render badges
 *       without a second round-trip.
 *     security: []
 *     parameters:
 *       - { name: country, in: query, schema: { type: string } }
 *       - { name: city, in: query, schema: { type: string } }
 *       - { name: role, in: query, schema: { type: string } }
 *       - { name: skills, in: query, schema: { type: string }, description: comma-separated }
 *       - { name: experience_level, in: query, schema: { type: string, enum: [entry, junior, mid, senior, lead, executive] } }
 *       - { name: job_scope, in: query, schema: { type: string, enum: [local, country, global_remote, hybrid] } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
// `/jobs/location-based` must precede `/jobs/:id` so Express does not
// match `location-based` as the `:id` parameter.
router.get('/jobs/location-based', optionalAuth, asyncHandler(controller.locationBased));

/**
 * @swagger
 * /public/jobs:
 *   get:
 *     tags: [Public]
 *     summary: List jobs with filters (cached for 10 minutes)
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: job_type, in: query, schema: { type: string } }
 *       - { name: remote, in: query, schema: { type: boolean } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.get('/jobs', validate(v.jobsQuery, 'query'), asyncHandler(controller.listJobs));

/**
 * @swagger
 * /public/jobs/{id}:
 *   get:
 *     tags: [Public]
 *     summary: Job detail (cached for 15 minutes)
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Job detail, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/jobs/:id', validate(v.idParam, 'params'), asyncHandler(controller.getJob));

/**
 * @swagger
 * /public/companies:
 *   get:
 *     tags: [Public]
 *     summary: List companies (cached for 30 minutes)
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: industry, in: query, schema: { type: string } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: is_featured, in: query, schema: { type: boolean } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/companies', validate(v.companiesQuery, 'query'), asyncHandler(controller.listCompanies));

/**
 * @swagger
 * /public/companies/{id}:
 *   get:
 *     tags: [Public]
 *     summary: Company detail with recent open jobs
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Company detail, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/companies/:id', validate(v.idParam, 'params'), asyncHandler(controller.getCompany));

/**
 * @swagger
 * /public/candidates:
 *   get:
 *     tags: [Public]
 *     summary: List public candidate profiles
 *     parameters:
 *       - { name: keyword, in: query, schema: { type: string } }
 *       - { name: location, in: query, schema: { type: string } }
 *       - { name: skill, in: query, schema: { type: string } }
 *       - { name: remote, in: query, schema: { type: boolean } }
 *       - { name: experience_min, in: query, schema: { type: number } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.get('/candidates', validate(v.candidatesQuery, 'query'), asyncHandler(controller.listCandidates));

/**
 * @swagger
 * /public/candidates/{id}:
 *   get:
 *     tags: [Public]
 *     summary: Public candidate profile + skills
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Candidate detail, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/candidates/:id', validate(v.idParam, 'params'), asyncHandler(controller.getCandidate));

/**
 * @swagger
 * /public/candidates/{id}/skills:
 *   get:
 *     tags: [Skills]
 *     summary: Public skills of a single candidate
 *     description: |
 *       Returns the candidate's skill list (with proficiency + years
 *       of experience) when their profile is marked public. Used by
 *       company recruiters browsing candidate profiles.
 *     security: []
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200':
 *         description: Skills
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Candidate skills returned' }
 *               Data:
 *                 candidate_id: 42
 *                 skills:
 *                   - { id: 12, name: 'React.js', proficiency: 'advanced', years_experience: 5 }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/candidates/:id/skills',
  validate(v.idParam, 'params'),
  asyncHandler(require('../controllers/skill.controller').candidateSkills)
);

/**
 * @swagger
 * /public/categories:
 *   get:
 *     tags: [Public]
 *     summary: Active job categories (cached for 1 hour)
 *     responses:
 *       '200': { description: Categories, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/categories', asyncHandler(controller.categories));

/**
 * @swagger
 * /public/skills:
 *   get:
 *     tags: [Public]
 *     summary: Active skills (cached for 1 hour)
 *     responses:
 *       '200': { description: Skills, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/skills', asyncHandler(controller.skills));

/**
 * @swagger
 * /public/top-candidates:
 *   get:
 *     tags: [Public]
 *     summary: Top candidates for the home page
 *     parameters: [{ name: limit, in: query, schema: { type: integer, default: 8, maximum: 24 } }]
 *     responses:
 *       '200': { description: Top candidates, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/top-candidates', asyncHandler(controller.topCandidates));

/**
 * @swagger
 * /public/featured-companies:
 *   get:
 *     tags: [Public]
 *     summary: Featured companies for the home page
 *     responses:
 *       '200': { description: Featured companies, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/featured-companies', asyncHandler(controller.featuredCompanies));

/**
 * @swagger
 * /public/featured-jobs:
 *   get:
 *     tags: [Public]
 *     summary: Featured jobs for the home page
 *     responses:
 *       '200': { description: Featured jobs, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/featured-jobs', asyncHandler(controller.featuredJobs));

/**
 * @swagger
 * /public/navigation:
 *   get:
 *     tags: [Public]
 *     summary: Role-aware navigation menu (uses Authorization header if present)
 *     description: |
 *       Returns the primary nav links, sign-in / sign-out action buttons,
 *       and the active dashboard target. When called anonymously the
 *       payload contains only the public menu; when called with a valid
 *       bearer token, role-specific entries (Profile / Preferences /
 *       Favorites / Dashboards / Admin Console) are added.
 *     security: []
 *     responses:
 *       '200':
 *         description: Navigation payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Navigation returned' }
 *               Data:
 *                 primary:
 *                   - { key: home, label: Home, to: '/', end: true }
 *                   - { key: jobs, label: Jobs, to: '/jobs' }
 *                   - { key: companies, label: Companies, to: '/companies' }
 *                   - { key: candidates, label: Candidates, to: '/candidates' }
 *                   - { key: employer-onboarding, label: For Employers, to: '/employer-onboarding' }
 *                 actions:
 *                   - { key: signin, label: Sign in, kind: auth-signin }
 *                   - { key: signup, label: Join free, kind: auth-signup }
 *                 dashboard: null
 *                 user: null
 */
router.get('/navigation', optionalAuth, asyncHandler(controller.navigation));

/**
 * @swagger
 * /public/countries:
 *   get:
 *     tags: [Public]
 *     summary: Country reference list (for the location picker)
 *     security: []
 *     responses:
 *       '200': { description: Countries, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/countries', asyncHandler(controller.countries));

/**
 * @swagger
 * /public/cities:
 *   get:
 *     tags: [Public]
 *     summary: City reference list for a given country
 *     security: []
 *     parameters: [{ name: country_id, in: query, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Cities, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/cities', asyncHandler(controller.cities));

/**
 * @swagger
 * /public/geolocate:
 *   get:
 *     tags: [Public]
 *     summary: Resolve the caller's location from their IP
 *     description: |
 *       Server-side proxy in front of ipapi.co. The browser never
 *       contacts a third-party geolocation service directly; the
 *       caller's IP is read from `X-Forwarded-For` / `req.ip` and
 *       results are cached for an hour. Use this as a fallback when
 *       browser geolocation is denied or unavailable.
 *     security: []
 *     responses:
 *       '200': { description: Geolocation, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.get('/geolocate', asyncHandler(controller.geolocate));

module.exports = router;
