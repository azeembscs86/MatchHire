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
const resumeController = require('../controllers/resume.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireCandidate } = require('../middlewares/role.middleware');
const { resumeUpload } = require('../middlewares/upload.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/candidate.validator');
const pubV = require('../validators/public.validator');

router.use(requireAuth, requireCandidate);

/**
 * Resume endpoints. Multipart upload sits in front of the JSON-only
 * routes; preview / confirm / signed download follow the standard
 * JSON envelope.
 *
 * @swagger
 * /candidates/resume/upload:
 *   post:
 *     tags: [Candidates]
 *     summary: Upload a resume (PDF/DOCX/TXT, max 5MB)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               resume: { type: string, format: binary }
 *     responses:
 *       '201': { description: Uploaded; call /parse next, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '415': { $ref: '#/components/responses/GenericError' }
 *       '413': { $ref: '#/components/responses/GenericError' }
 *
 * /candidates/resume/{id}/parse:
 *   post:
 *     tags: [Candidates]
 *     summary: Extract structured fields from an uploaded resume
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Parsed data preview, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { description: Parse failed, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } }
 *
 * /candidates/resume/{id}/preview:
 *   post:
 *     tags: [Candidates]
 *     summary: Return the most recent parsed payload for review
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Parsed payload, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *
 * /candidates/resume/{id}/confirm:
 *   post:
 *     tags: [Candidates]
 *     summary: Merge confirmed resume fields into the candidate profile
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               headline: { type: string }
 *               current_title: { type: string }
 *               summary: { type: string }
 *               location: { type: string }
 *               linkedin_url: { type: string }
 *               github_url: { type: string }
 *               portfolio_url: { type: string }
 *               skills: { type: array, items: { type: string } }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *
 * /candidates/resume/{id}/download:
 *   post:
 *     tags: [Candidates]
 *     summary: Short-lived HMAC-signed download URL for the stored resume
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Signed URL, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *
 * /candidates/resume/list:
 *   post:
 *     tags: [Candidates]
 *     summary: List the candidate's resumes
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Resumes, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/resume/upload', resumeUpload.single('resume'), asyncHandler(resumeController.upload));
router.post('/resume/list', asyncHandler(resumeController.list));
router.post('/resume/:id/parse', asyncHandler(resumeController.parse));
router.post('/resume/:id/preview', asyncHandler(resumeController.preview));
router.post('/resume/:id/confirm', asyncHandler(resumeController.confirm));
router.post('/resume/:id/download', asyncHandler(resumeController.signedDownload));

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

/**
 * @swagger
 * /candidates/jobs/match:
 *   post:
 *     tags: [Candidates]
 *     summary: Skill-based ranked job recommendations
 *     description: |
 *       Returns open jobs ranked by descending `match_score` based on
 *       the candidate's role / skills / experience / location / salary
 *       expectations. By default, only roles above the borderline
 *       threshold are returned; pass `include_below_threshold: true`
 *       to see everything for debugging.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               country: { type: string }
 *               city: { type: string }
 *               role: { type: string }
 *               skills: { oneOf: [{ type: string }, { type: array, items: { type: string } }] }
 *               experience_level: { type: string }
 *               job_scope: { type: string, enum: [local, country, global_remote, hybrid] }
 *               limit: { type: integer, default: 20, maximum: 50 }
 *               include_below_threshold: { type: boolean, default: false }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.post('/jobs/match', validate(v.matchFilters), asyncHandler(controller.matchJobs));

/**
 * @swagger
 * /candidates/applications/{jobId}/validate-and-apply:
 *   post:
 *     tags: [Candidates]
 *     summary: Match-validated job application
 *     description: |
 *       Scores the candidate against the job first. If the match is
 *       below the rejection threshold the application is NOT created
 *       and the response carries a polite, specific rejection message
 *       (the attempt is still recorded for admin auditing). Otherwise
 *       the application is created with `match_score` stored alongside
 *       it so the employer dashboard can sort by quality.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cover_letter: { type: string }
 *               expected_salary: { type: number }
 *               resume_url: { type: string, format: uri }
 *     responses:
 *       '201': { description: Application accepted, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422':
 *         description: Match rejected
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorEnvelope' }
 *             example:
 *               Response: { responseCode: 0, status: 'Error', message: 'Your profile is missing key skills for this role: react, typescript.' }
 *               Data: { decision: 'rejected', match_score: 38, reasons: [], missing: ['react','typescript'], message: 'Your profile is missing key skills for this role: react, typescript.' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/applications/:jobId/validate-and-apply',
  validate(pubV.jobIdParam, 'params'),
  validate(v.validateAndApply),
  asyncHandler(controller.validateAndApply)
);

module.exports = router;
