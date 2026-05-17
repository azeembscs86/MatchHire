'use strict';

/**
 * Candidate routes
 * ----------------
 * Mounted at `/api/v1/candidates`. Every route requires authentication and
 * role=candidate. All routes use POST per project rule; list filters are
 * accepted in the request body.
 */

const router = require('express').Router();
const controller = require('../controllers/candidate.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireCandidate } = require('../middlewares/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/candidate.validator');
const pubV = require('../validators/public.validator');

router.use(requireAuth, requireCandidate);

/**
 * @swagger
 * /candidates/profile:
 *   post:
 *     tags: [Candidates]
 *     summary: Get the authenticated candidate's profile, skills, preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Profile, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 */
router.post('/profile', asyncHandler(controller.getProfile));

/**
 * @swagger
 * /candidates/profile/update:
 *   post:
 *     tags: [Candidates]
 *     summary: Update the candidate profile (and linked user fields)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CandidateProfileUpdate' }
 *           example:
 *             full_name: "David Kim"
 *             headline: "Senior Full-Stack Engineer"
 *             summary: "7+ years building web platforms."
 *             current_title: "Senior Software Engineer"
 *             years_experience: 7
 *             location: "San Francisco"
 *             country: "USA"
 *             open_to_remote: true
 *             expected_salary_min: 130000
 *             expected_salary_max: 180000
 *             salary_currency: "USD"
 *             availability: "two_weeks"
 *     responses:
 *       '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/profile/update', validate(v.profileUpdate), asyncHandler(controller.updateProfile));

/**
 * @swagger
 * /candidates/skills:
 *   post:
 *     tags: [Candidates]
 *     summary: Replace the candidate's full set of skills
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CandidateSkillsUpdate' }
 *           example:
 *             skills:
 *               - { skill_id: 1, proficiency: "advanced", years_experience: 6 }
 *               - { skill_id: 4, proficiency: "expert", years_experience: 7 }
 *     responses:
 *       '200': { description: Skills updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/skills', validate(v.skillsUpdate), asyncHandler(controller.updateSkills));

/**
 * @swagger
 * /candidates/preferences:
 *   post:
 *     tags: [Candidates]
 *     summary: Save the candidate's job preferences
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CandidatePreferencesUpdate' }
 *           example:
 *             desired_titles: ["Software Engineer", "Full Stack Developer"]
 *             preferred_locations: ["Remote", "Berlin"]
 *             preferred_job_types: ["full_time", "contract"]
 *             remote_only: true
 *             salary_min: 90000
 *             salary_max: 160000
 *             salary_currency: "USD"
 *             notify_email: true
 *     responses:
 *       '200': { description: Preferences saved, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/preferences', validate(v.preferencesUpdate), asyncHandler(controller.updatePreferences));

/**
 * @swagger
 * /candidates/recommended-jobs:
 *   post:
 *     tags: [Candidates]
 *     summary: Personalized recommended jobs for the authenticated candidate
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { limit: { type: integer, minimum: 1, maximum: 50, default: 10 } }
 *           example: { limit: 10 }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.post('/recommended-jobs', validate(v.recommendedFilters), asyncHandler(controller.recommendedJobs));

/**
 * @swagger
 * /candidates/favorites/{jobId}/add:
 *   post:
 *     tags: [Candidates]
 *     summary: Add a job to favorites
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '201': { description: Job favorited, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/favorites/:jobId/add', validate(pubV.jobIdParam, 'params'), asyncHandler(controller.addFavorite));

/**
 * @swagger
 * /candidates/favorites/{jobId}/remove:
 *   post:
 *     tags: [Candidates]
 *     summary: Remove a job from favorites
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/favorites/:jobId/remove', validate(pubV.jobIdParam, 'params'), asyncHandler(controller.removeFavorite));

/**
 * @swagger
 * /candidates/favorites/list:
 *   post:
 *     tags: [Candidates]
 *     summary: List favorite jobs (paginated)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ListFiltersBody' }
 *           example: { page: 1, limit: 10 }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.post('/favorites/list', validate(v.listFilters), asyncHandler(controller.listFavorites));

// `/applications/list` must be declared BEFORE `/applications/:jobId`,
// otherwise Express captures the literal string "list" as the :jobId param.

/**
 * @swagger
 * /candidates/applications/list:
 *   post:
 *     tags: [Candidates]
 *     summary: List the candidate's own applications (paginated)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ListFiltersBody' }
 *           example: { page: 1, limit: 10, status: "shortlisted" }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.post('/applications/list', validate(v.listFilters), asyncHandler(controller.listApplications));

/**
 * @swagger
 * /candidates/applications/{jobId}:
 *   post:
 *     tags: [Candidates]
 *     summary: Apply to a job
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplyToJobRequest' }
 *           example:
 *             cover_letter: "I am excited about this role and bring 6 years of relevant experience."
 *             expected_salary: 145000
 *     responses:
 *       '201': { description: Application submitted, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/applications/:jobId', validate(pubV.jobIdParam, 'params'), validate(v.applyToJob), asyncHandler(controller.applyToJob));

/**
 * @swagger
 * /candidates/dashboard/stats:
 *   post:
 *     tags: [Candidates]
 *     summary: Dashboard stats for the authenticated candidate
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Dashboard, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/dashboard/stats', asyncHandler(controller.dashboardStats));

module.exports = router;
