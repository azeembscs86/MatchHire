'use strict';

/**
 * Employer routes
 * ---------------
 * Mounted at `/api/v1/employers`. All routes require authentication and
 * role=employer, and are POST-only.
 *
 * Ownership is enforced inside the service layer: every job mutation
 * verifies the employer belongs to the company that owns the job.
 */

const router = require('express').Router();
const controller = require('../controllers/employer.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireEmployer } = require('../middlewares/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/employer.validator');
const pubV = require('../validators/public.validator');

router.use(requireAuth, requireEmployer);

/**
 * @swagger
 * /employers/company-profile:
 *   post:
 *     tags: [Employers]
 *     summary: Get the employer's company profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Company, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/company-profile', asyncHandler(controller.getCompanyProfile));

/**
 * @swagger
 * /employers/company-profile/update:
 *   post:
 *     tags: [Employers]
 *     summary: Update the employer's company profile
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyUpdateRequest' }
 *           example:
 *             name: "Acme Technologies"
 *             tagline: "Hiring infrastructure for fast-growing teams"
 *             industry: "Software"
 *             size: "201-500"
 *             website: "https://acme.example.com"
 *             location: "San Francisco"
 *             country: "USA"
 *     responses:
 *       '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/company-profile/update', validate(v.companyUpdate), asyncHandler(controller.updateCompanyProfile));

/**
 * @swagger
 * /employers/jobs:
 *   post:
 *     tags: [Employers]
 *     summary: Create a new job posting
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JobCreateRequest' }
 *           example:
 *             title: "Senior Backend Engineer"
 *             description: "Build distributed systems serving 10k+ teams."
 *             responsibilities: "Design APIs. Mentor engineers. Ship reliably."
 *             requirements: "5+ years Node.js or Go. Strong systems fundamentals."
 *             benefits: "Equity, healthcare, remote-friendly."
 *             job_type: "full_time"
 *             experience_level: "senior"
 *             location: "Remote"
 *             country: "USA"
 *             is_remote: true
 *             salary_min: 140000
 *             salary_max: 200000
 *             salary_currency: "USD"
 *             skills_tags: ["Node.js", "TypeScript", "AWS"]
 *             vacancies: 2
 *     responses:
 *       '201': { description: Job created, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/jobs', validate(v.jobCreate), asyncHandler(controller.createJob));

/**
 * @swagger
 * /employers/jobs/list:
 *   post:
 *     tags: [Employers]
 *     summary: List the employer's jobs (paginated)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JobListFiltersBody' }
 *           example: { page: 1, limit: 10, status: "open" }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedJobs' }
 */
router.post('/jobs/list', validate(v.jobListFilters), asyncHandler(controller.listMyJobs));

/**
 * @swagger
 * /employers/jobs/{jobId}/update:
 *   post:
 *     tags: [Employers]
 *     summary: Update an existing job
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JobUpdateRequest' }
 *           example: { title: "Senior Backend Engineer (Go)", salary_max: 220000 }
 *     responses:
 *       '200': { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:jobId/update', validate(pubV.jobIdParam, 'params'), validate(v.jobUpdate), asyncHandler(controller.updateJob));

/**
 * @swagger
 * /employers/jobs/{jobId}/delete:
 *   post:
 *     tags: [Employers]
 *     summary: Soft-delete a job (status set to archived)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:jobId/delete', validate(pubV.jobIdParam, 'params'), asyncHandler(controller.deleteJob));

/**
 * @swagger
 * /employers/jobs/{jobId}/close:
 *   post:
 *     tags: [Employers]
 *     summary: Close a job (no new applications)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:jobId/close', validate(pubV.jobIdParam, 'params'), asyncHandler(controller.closeJob));

/**
 * @swagger
 * /employers/jobs/{jobId}/reactivate:
 *   post:
 *     tags: [Employers]
 *     summary: Reactivate an expired or closed job posting
 *     description: |
 *       Body requires a future `application_deadline`. Optional
 *       content fields (title, description, requirements, skills,
 *       salary, location, work mode, etc.) follow the same shape
 *       as `jobUpdate`. The service decides whether the
 *       reactivation goes live instantly or needs admin re-approval:
 *
 *         - Date-only change → `admin_status='approved'`,
 *           `status='open'`. Public feed picks it up immediately.
 *         - Any content change → `admin_status='pending'`,
 *           `status='open'`. Requires super-admin to flip back to
 *           approved before the public feed includes it.
 *
 *       Ownership is enforced server-side; a 404 returns when the
 *       calling employer doesn't own the job.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JobReactivate' }
 *     responses:
 *       '200': { description: Reactivated, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '400': { $ref: '#/components/responses/BadRequest' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/jobs/:jobId/reactivate',
  validate(pubV.jobIdParam, 'params'),
  validate(v.jobReactivate),
  asyncHandler(controller.reactivateJob)
);

/**
 * @swagger
 * /employers/jobs/{jobId}/applicants:
 *   post:
 *     tags: [Employers]
 *     summary: List applicants for a job (employer must own it)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplicantListFiltersBody' }
 *           example: { page: 1, limit: 10, status: "applied" }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:jobId/applicants', validate(pubV.jobIdParam, 'params'), validate(v.applicantListFilters), asyncHandler(controller.listApplicants));

/**
 * @swagger
 * /employers/jobs/{jobId}/auto-shortlist:
 *   post:
 *     tags: [Employers]
 *     summary: AI bulk-shortlist applicants whose match score >= 60%
 *     description: |
 *       Walks every actionable application on the job
 *       (`applied` / `reviewing` / `under_review`), scores each
 *       candidate against the role with the same match service the
 *       apply-validation path uses, and flips eligible rows to
 *       `status='shortlisted'`. Rows already in a downstream state
 *       (shortlisted / interview / offered / hired / rejected /
 *       withdrawn) are skipped so re-running the action never undoes
 *       a manual decision.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: jobId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/jobs/:jobId/auto-shortlist', validate(pubV.jobIdParam, 'params'), asyncHandler(controller.autoShortlistApplicants));

/**
 * @swagger
 * /employers/applications/{applicationId}/shortlist:
 *   post:
 *     tags: [Employers]
 *     summary: Move an application to "shortlisted"
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: applicationId, in: path, required: true, schema: { type: integer } }]
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/applications/:applicationId/shortlist', validate(pubV.applicationIdParam, 'params'), asyncHandler(controller.shortlistApplication));

/**
 * @swagger
 * /employers/applications/{applicationId}/reject:
 *   post:
 *     tags: [Employers]
 *     summary: Reject an application (optionally with a reason)
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ name: applicationId, in: path, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RejectionReasonBody' }
 *           example: { reason: "Looking for candidates with more cloud experience." }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post('/applications/:applicationId/reject', validate(pubV.applicationIdParam, 'params'), validate(v.rejectionReason), asyncHandler(controller.rejectApplication));

/**
 * @swagger
 * /employers/interviews:
 *   post:
 *     tags: [Employers]
 *     summary: Schedule an interview against an application
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/InterviewCreateRequest' }
 *           example:
 *             application_id: 4
 *             scheduled_at: "2026-06-01T15:00:00.000Z"
 *             duration_minutes: 45
 *             mode: "video"
 *             meeting_url: "https://meet.example.com/abc"
 *             notes: "Intro + technical screen"
 *     responses:
 *       '201': { description: Interview scheduled, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/interviews', validate(v.interviewCreate), asyncHandler(controller.scheduleInterview));

/**
 * @swagger
 * /employers/dashboard/stats:
 *   post:
 *     tags: [Employers]
 *     summary: Dashboard stats for the employer's company
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Dashboard, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 */
router.post('/dashboard/stats', asyncHandler(controller.dashboardStats));

/**
 * @swagger
 * /employers/recommended-candidates:
 *   post:
 *     tags: [Employers]
 *     summary: AI-ranked candidates matching the viewer's active jobs (score > 50)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: Recommendations, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 */
router.post('/recommended-candidates', asyncHandler(controller.recommendedCandidates));

/**
 * @swagger
 * /employers/candidates/{candidateId}/matching-jobs:
 *   post:
 *     tags: [Employers]
 *     summary: Active jobs at the viewer's company matching this candidate (score > 60)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: candidateId
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       '200': { description: Matches returned, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/candidates/:candidateId/matching-jobs',
  validate(pubV.candidateIdParam, 'params'),
  asyncHandler(controller.matchingJobsForCandidate)
);

/**
 * @swagger
 * /employers/candidates/{candidateId}/resume/download:
 *   post:
 *     tags: [Employers]
 *     summary: Short-lived signed URL to download a candidate's resume
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: candidateId
 *         in: path
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       '200': { description: Signed URL returned, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '404': { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/candidates/:candidateId/resume/download',
  validate(pubV.candidateIdParam, 'params'),
  asyncHandler(controller.downloadCandidateResume)
);

module.exports = router;
