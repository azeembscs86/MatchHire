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
const { resumeUpload, imageUploadSingle } = require('../middlewares/upload.middleware');
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
 * Resume management surface (added in §34). Five candidate-facing
 * actions on top of the upload/parse/confirm pipeline. Every route
 * runs an ownership check inside the service layer — a candidate
 * can only act on their own resumes.
 *
 * @swagger
 * /candidates/resume/{id}/detail:
 *   post:
 *     tags: [Candidates]
 *     summary: Read a single resume (metadata + parsed-data preview)
 *     description: Returns `{ resume, parsed }` in one round-trip. 403 if the resume belongs to another candidate; 404 if it doesn't exist or has been soft-deleted.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Resume + parsed, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 *
 * /candidates/resume/{id}/set-primary:
 *   post:
 *     tags: [Candidates]
 *     summary: Mark this resume as the candidate's primary CV
 *     description: |
 *       Runs as a single transaction — all of the user's other
 *       resumes are demoted before this one is promoted, so the
 *       UI never observes zero or two primary rows.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { description: Updated resume row, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *
 * /candidates/resume/{id}/delete:
 *   post:
 *     tags: [Candidates]
 *     summary: Soft-delete a resume
 *     description: |
 *       Flips `resumes.deleted_at = NOW()` and renames the file on
 *       disk with a `.deleted-<ts>` suffix (recoverable). If the
 *       deleted resume was the primary one, the most-recently-
 *       uploaded remaining resume is auto-promoted to primary.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *
 * /candidates/resume/{id}/parsed-data:
 *   post:
 *     tags: [Candidates]
 *     summary: Save manual edits to the parsed preview
 *     description: |
 *       Updates the candidate's resume_parsed_data row in-place
 *       WITHOUT applying anything to the candidate profile. Use
 *       this to let the user correct extraction errors and save
 *       the corrected preview for later. Apply to profile via
 *       /resume/{id}/confirm.
 *
 *       Whitelisted fields only: full_name, email, phone, location,
 *       country, city, job_title, summary, linkedin_url, github_url,
 *       portfolio_url (text); skills, experience, education,
 *       certifications (arrays/objects).
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:     { type: string }
 *               email:         { type: string, format: email }
 *               phone:         { type: string }
 *               location:      { type: string }
 *               job_title:     { type: string }
 *               summary:       { type: string }
 *               linkedin_url:  { type: string, format: uri }
 *               github_url:    { type: string, format: uri }
 *               portfolio_url: { type: string, format: uri }
 *               skills:        { type: array, items: { type: string } }
 *               experience:    { type: array, items: { type: string } }
 *               education:     { type: array, items: { type: string } }
 *     responses:
 *       '200': { description: Updated parsed-data row, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *
 * /candidates/resume/{id}/reject:
 *   post:
 *     tags: [Candidates]
 *     summary: Reject the parsed preview (keep the file)
 *     description: |
 *       Stamps `resumes.rejection_reason` and flips parse_status
 *       to 'failed' so the review panel stops popping. The resume
 *       file is left on disk — the candidate can still download
 *       it and use it manually.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { reason: { type: string, maxLength: 480 } }
 *           example: { reason: 'Layout confused the parser — will upload a cleaner version.' }
 *     responses:
 *       '200': { description: Resume marked rejected, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/resume/:id/detail',       asyncHandler(resumeController.detail));
router.post('/resume/:id/set-primary',  asyncHandler(resumeController.setPrimary));
router.post('/resume/:id/delete',       asyncHandler(resumeController.softDelete));
router.post('/resume/:id/parsed-data',  asyncHandler(resumeController.updateParsedData));
router.post('/resume/:id/reject',       asyncHandler(resumeController.rejectParsedData));

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
 *     tags: [Skills]
 *     summary: Set or append candidate skills (multi-select + custom)
 *     description: |
 *       Two modes:
 *
 *         - `mode: "set"` (default) — REPLACES the candidate's full
 *           skill set. Enforces 3..30 skills.
 *         - `mode: "add"` — APPENDS without disturbing existing
 *           skills. Enforces total <= 30. Used by the picker's
 *           "Add custom skill" action.
 *
 *       Each entry is either:
 *
 *         - `{ skill_id, proficiency?, years_experience? }` (picked
 *            from the catalogue), OR
 *         - `{ name, proficiency?, years_experience? }` (free-text;
 *            the catalogue is searched case-insensitively and a new
 *            row is created if no match is found).
 *
 *       Duplicate prevention is enforced both client-side (the
 *       picker de-dupes) and database-side
 *       (`UNIQUE(candidate_user_id, skill_id)`).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [skills]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [set, add]
 *                 default: set
 *               skills:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 30
 *                 items:
 *                   type: object
 *                   properties:
 *                     skill_id:         { type: integer }
 *                     name:             { type: string, maxLength: 80 }
 *                     proficiency:      { type: string, enum: [beginner, intermediate, advanced, expert] }
 *                     years_experience: { type: number, minimum: 0, maximum: 60 }
 *           examples:
 *             setFromCatalogue:
 *               summary: Replace the whole set with catalogue picks
 *               value:
 *                 mode: set
 *                 skills:
 *                   - { skill_id: 12, proficiency: 'advanced', years_experience: 5 }
 *                   - { skill_id: 14, proficiency: 'expert',   years_experience: 6 }
 *                   - { skill_id: 31, proficiency: 'intermediate', years_experience: 2 }
 *             addCustom:
 *               summary: Add a single free-text custom skill
 *               value:
 *                 mode: add
 *                 skills:
 *                   - { name: 'Strapi CMS', proficiency: 'intermediate', years_experience: 1 }
 *     responses:
 *       '200':
 *         description: Skills saved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *       '422':
 *         description: Bounds violation (<3 on set, >30 total) or invalid entry
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ValidationEnvelope' }
 */
router.post('/skills', validate(v.skillsUpdate), asyncHandler(controller.updateSkills));

/**
 * @swagger
 * /candidates/skills/list:
 *   post:
 *     tags: [Skills]
 *     summary: Return the authenticated candidate's skill set
 *     description: |
 *       Convenience endpoint so the SkillsPicker doesn't have to
 *       hit `/candidates/profile` (which returns the full read
 *       model) when it only needs the skill array.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Skills
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Skills returned' }
 *               Data:
 *                 skills:
 *                   - { id: 12, name: 'React.js', proficiency: 'advanced', years_experience: 5 }
 */
router.post('/skills/list', asyncHandler(controller.listMySkills));

/**
 * @swagger
 * /candidates/skills/{skill_id}:
 *   delete:
 *     tags: [Skills]
 *     summary: Remove a single skill from the authenticated candidate's set
 *     description: |
 *       Most authenticated mutations in this codebase are POST per
 *       project rule; this DELETE matches the public product spec
 *       and is paired with a POST alias at
 *       `/candidates/skills/{skill_id}/remove` for projects that
 *       prefer to stay POST-only.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: skill_id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.delete('/skills/:skill_id', asyncHandler(controller.removeSkill));

/**
 * @swagger
 * /candidates/skills/{skill_id}/remove:
 *   post:
 *     tags: [Skills]
 *     summary: POST alias of DELETE /candidates/skills/{skill_id}
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: skill_id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/skills/:skill_id/remove', asyncHandler(controller.removeSkill));

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

/**
 * @swagger
 * /candidates/profile-match:
 *   post:
 *     tags: [Candidates]
 *     summary: Profile completion + recommended skills/titles + AI suggestions
 *     description: |
 *       Diagnostic endpoint used by the candidate dashboard / Home page.
 *       Returns the profile completion percentage, the list of missing
 *       profile fields, recommended skills (sampled from current market
 *       demand on similar roles), recommended job titles, and AI-style
 *       profile + career improvement copy.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '200':
 *         description: Profile match payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Profile match returned' }
 *               Data:
 *                 profileCompletion: 65
 *                 missingFields:
 *                   - { field: 'linkedin_url', label: 'LinkedIn URL' }
 *                   - { field: 'resume_url', label: 'uploaded resume' }
 *                 skills:
 *                   - { id: 1, name: 'Node.js', proficiency: 'advanced' }
 *                 recommendedSkills:
 *                   - { name: 'Docker', demand: 18 }
 *                   - { name: 'AWS', demand: 14 }
 *                 recommendedJobTitles: ['Backend Engineer', 'API Developer', 'Node.js Developer']
 *                 aiSuggestions:
 *                   profileImprovement: ['Add a LinkedIn URL', 'List at least 5 skills']
 *                   careerImprovement: 'You are positioned for senior roles. Adding Docker, AWS, Kubernetes would open up...'
 *                   missingSkillSuggestion: 'You can improve your match by learning Docker, AWS, and Kubernetes.'
 *                 profileStrengthBands: { weak: false, partial: true, strong: false }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 */
router.post('/profile-match', asyncHandler(controller.profileMatch));

/**
 * @swagger
 * /candidates/profile-image:
 *   post:
 *     tags: [Candidates]
 *     summary: Upload or replace the candidate's profile image
 *     description: |
 *       Multipart upload, field name `image`. JPG / PNG / WEBP only,
 *       up to 2MB. Magic-number sniff + extension whitelist defend
 *       against renamed executables. Any prior image is soft-deleted
 *       on disk so it's recoverable. Returns the storage path AND a
 *       fresh 7-day signed URL the SPA can render immediately.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       '200':
 *         description: Uploaded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Profile image uploaded' }
 *               Data:
 *                 profile_image: 'profile-images/9c3a...8e.jpg'
 *                 image_url: 'http://localhost:3500/uploads/profile-images/9c3a...8e.jpg'
 *       '413':
 *         description: Image exceeds the 2MB limit
 *       '415':
 *         description: Unsupported image type
 */
router.post(
  '/profile-image',
  imageUploadSingle('image'),
  asyncHandler(controller.uploadProfileImage)
);

/**
 * @swagger
 * /candidates/profile-image:
 *   delete:
 *     tags: [Candidates]
 *     summary: Remove the candidate's profile image
 *     description: |
 *       Clears `candidate_profiles.profile_image` + `users.avatar_url`
 *       and soft-deletes the file. Returns the now-empty image
 *       fields so the SPA can switch to the default avatar without
 *       a second fetch.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404':
 *         description: No image to remove
 */
router.delete('/profile-image', asyncHandler(controller.deleteProfileImage));

/**
 * @swagger
 * /candidates/profile-completion:
 *   get:
 *     tags: [Candidates]
 *     summary: Per-section profile completion breakdown
 *     description: |
 *       Returns the overall 0-100 completion score and an array of
 *       sections, each with its own weight, earned points, percent,
 *       complete flag, and a human-readable hint when not yet
 *       complete. Sections (per spec):
 *
 *         - profile_image (10%)
 *         - basic_info (15%)
 *         - contact_info (10%)
 *         - skills_expertise (15%)
 *         - work_experience (15%)
 *         - education (10%)
 *         - resume_upload (10%)
 *         - job_preferences (10%)
 *         - social_links (5%)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Completion breakdown
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Profile completion returned' }
 *               Data:
 *                 score: 62
 *                 totals: { earned: 62, max: 100 }
 *                 sections:
 *                   - { key: profile_image, label: 'Profile image', weight: 10, earned: 0, percent: 0, complete: false, hint: 'Upload your profile image to improve profile visibility.' }
 *                   - { key: basic_info, label: 'Basic info', weight: 15, earned: 15, percent: 100, complete: true, hint: null }
 */
router.get('/profile-completion', asyncHandler(controller.profileCompletion));

/**
 * @swagger
 * /candidates/review-profile:
 *   get:
 *     tags: [Candidates]
 *     summary: Composite read for the Review Profile page
 *     description: |
 *       One round-trip aggregation: user, profile, signed image URL,
 *       skills, preferences, resume metadata, parsed-resume preview,
 *       per-section completion breakdown, and a flat `missing[]`
 *       list for the page's empty-state banner.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Review profile payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Review profile returned' }
 *               Data:
 *                 user: { id: 1492, full_name: 'Azeem Akram', email: 'azeem.akram78@gmail.com', role: 'candidate' }
 *                 profile: { headline: 'Senior Full-Stack Engineer', current_title: 'Senior Full-Stack Engineer' }
 *                 image_url: 'http://localhost:3500/uploads/profile-images/abc.jpg'
 *                 skills: [{ id: 12, name: 'React.js' }]
 *                 preferences: { desired_titles: 'Full-Stack Engineer' }
 *                 resume: { id: 7, original_name: 'cv.pdf' }
 *                 completion: { score: 62, sections: [] }
 *                 missing: [{ key: 'profile_image', label: 'Profile image', hint: 'Upload your profile image to improve profile visibility.' }]
 */
router.get('/review-profile', asyncHandler(controller.reviewProfile));

/* ----------------------------------------------------------------
 * Work experience CRUD
 * ----------------------------------------------------------------
 * Backs the multi-row Work Experience card on the Profile page.
 * Mounted under /candidates/experiences/* so they sit alongside
 * other candidate-owned resources (skills, favorites, applications).
 *
 * The literal /list path is registered BEFORE /:id so Express
 * doesn't treat "list" as the :id route param.
 * ---------------------------------------------------------------- */

/**
 * @swagger
 * /candidates/experiences/list:
 *   post:
 *     tags: [Candidates]
 *     summary: List the candidate's saved work experiences
 *     description: |
 *       Returns the candidate's work history sorted with `is_current`
 *       roles first, then by most recent end date. Empty array when
 *       the candidate hasn't added any experiences yet.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Experiences returned
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Experiences returned' }
 *               Data:
 *                 experiences:
 *                   - id: 12
 *                     company: 'Verkada'
 *                     title: 'Senior Frontend Engineer'
 *                     start_date: '2022-03-01'
 *                     end_date: null
 *                     is_current: 1
 *                     description: 'Led the migration of our legacy dashboard to Next.js 14.'
 */
router.post('/experiences/list', asyncHandler(controller.listExperiences));

/**
 * @swagger
 * /candidates/experiences:
 *   post:
 *     tags: [Candidates]
 *     summary: Add a new work experience entry
 *     description: |
 *       Hard cap: 30 entries per candidate. If `is_current=true`, any
 *       other "current" flags on the same candidate are cleared so a
 *       candidate never has two concurrent current roles. Date sanity
 *       is enforced server-side.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CandidateExperienceCreate' }
 *           example:
 *             company: 'Verkada'
 *             title: 'Senior Frontend Engineer'
 *             start_date: '2022-03-01'
 *             is_current: true
 *             description: 'Led the migration of our legacy dashboard to Next.js 14, reducing TTI by 64%.'
 *     responses:
 *       '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/experiences', validate(v.experienceCreate), asyncHandler(controller.createExperience));

/**
 * @swagger
 * /candidates/experiences/{id}:
 *   post:
 *     tags: [Candidates]
 *     summary: Update an existing work experience entry
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CandidateExperienceUpdate' }
 *     responses:
 *       '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Candidates]
 *     summary: Remove a single work experience entry
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/experiences/:id',
  validate(v.experienceIdParam, 'params'),
  validate(v.experienceUpdate),
  asyncHandler(controller.updateExperience)
);
router.delete(
  '/experiences/:id',
  validate(v.experienceIdParam, 'params'),
  asyncHandler(controller.removeExperience)
);

/**
 * @swagger
 * /candidates/experiences/{id}/remove:
 *   post:
 *     tags: [Candidates]
 *     summary: POST alias of DELETE /candidates/experiences/{id}
 *     description: |
 *       Project rule is "POST-only when authed". The DELETE above
 *       matches the public product spec; this POST alias is offered
 *       so frontends that prefer POST stay consistent.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/experiences/:id/remove',
  validate(v.experienceIdParam, 'params'),
  asyncHandler(controller.removeExperience)
);

/**
 * @swagger
 * /candidates/profile/publish-state:
 *   post:
 *     tags: [Candidates]
 *     summary: Save Draft vs. Save & Publish toggle
 *     description: |
 *       The Profile page has two save paths:
 *
 *         - Save Draft        → `{ publish: false }` — `is_public` set to 0.
 *                                Recruiters can't see the profile, matching
 *                                engine skips it.
 *         - Save & Publish    → `{ publish: true }` — `is_public` set to 1.
 *
 *       The endpoint exists so the two buttons don't have to re-send
 *       the whole form payload just to flip a single bit. The full
 *       form still goes through `/profile/update` first.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [publish]
 *             properties:
 *               publish: { type: boolean }
 *           example: { publish: true }
 *     responses:
 *       '200': { description: Toggled, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/profile/publish-state', asyncHandler(controller.setPublishState));

/**
 * @swagger
 * /candidates/onboarding/state:
 *   post:
 *     tags: [Candidates]
 *     summary: Read the Onboarding Wizard state (current step + completion breakdown)
 *     description: |
 *       Returns the candidate's wizard progress in one round-trip:
 *       current step index (0..6), total steps (7), completion
 *       timestamp (or null if still in progress), profile_strength
 *       percentage, AND the per-section completion breakdown — so
 *       the wizard's progress bar + step indicators render without
 *       a second request to /profile-completion.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Onboarding state
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Onboarding state returned' }
 *               Data:
 *                 current_step: 2
 *                 total_steps: 7
 *                 is_completed: false
 *                 completed_at: null
 *                 profile_strength: 45
 *                 completion:
 *                   score: 45
 *                   totals: { earned: 45, max: 100 }
 *                   sections: []
 */
router.post('/onboarding/state', asyncHandler(controller.onboardingState));

/**
 * @swagger
 * /candidates/onboarding/advance:
 *   post:
 *     tags: [Candidates]
 *     summary: Advance the Onboarding Wizard (next/back/complete)
 *     description: |
 *       Sets the candidate's current step index. Pass `complete: true`
 *       on the final step (6 = "Review & Complete Profile") to stamp
 *       `onboarding_completed_at` — that timestamp is set ONCE and
 *       preserved across re-completes (so analytics for
 *       time-to-first-complete stay clean).
 *
 *       Per-step DATA is saved through the dedicated endpoints
 *       (/profile/update, /skills, /experiences/*, /preferences,
 *       /resume/*). This endpoint only persists the wizard's own
 *       progress so the user can resume after closing the tab.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [step]
 *             properties:
 *               step:     { type: integer, minimum: 0, maximum: 6 }
 *               complete: { type: boolean, default: false }
 *           example: { step: 3, complete: false }
 *     responses:
 *       '200': { description: Updated state, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/onboarding/advance', validate(v.onboardingAdvance), asyncHandler(controller.onboardingAdvance));

/**
 * @swagger
 * /candidates/onboarding/reset:
 *   post:
 *     tags: [Candidates]
 *     summary: Reset the Onboarding Wizard to step 0
 *     description: |
 *       Clears `onboarding_step` (→ 0) and `onboarding_completed_at`
 *       (→ NULL). Profile data is NOT touched. Used by "Restart
 *       onboarding" actions and by tests.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 */
router.post('/onboarding/reset', asyncHandler(controller.onboardingReset));

module.exports = router;
