'use strict';

/**
 * Auth routes
 * -----------
 * Mounted at `/api/v1/auth`. All endpoints are POST per project rule.
 *
 * Public flows (`register`, `login`, `refresh-token`, `forgot-password`,
 * `reset-password`) are wrapped in `authLimiter` to throttle brute-force
 * attempts. Authenticated flows (`change-password`, `me`) sit behind
 * `requireAuth`.
 *
 * Each route carries a Swagger JSDoc block (@swagger) that is collected by
 * `src/docs/swagger.js` at startup time and rendered on `/api-docs`.
 */

const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/auth.validator');

/**
 * @swagger
 * /auth/register/candidate:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new candidate
 *     description: Creates a user with role `candidate`, builds a candidate profile, and returns an access/refresh token pair.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterCandidateRequest'
 *           example:
 *             full_name: "Maria Singh"
 *             email: "maria@example.com"
 *             phone: "+1 555 1234"
 *             password: "Password@123"
 *             headline: "Backend Engineer"
 *             current_title: "Software Engineer"
 *             location: "Berlin"
 *             country: "Germany"
 *             years_experience: 4
 *     responses:
 *       '201':
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthLoginResponse' }
 *             example: { $ref: '#/components/examples/AuthLoginExample/value' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/register/candidate', authLimiter, validate(v.registerCandidate), asyncHandler(controller.registerCandidate));

/**
 * @swagger
 * /auth/register/employer:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new employer + company
 *     description: Creates a user with role `employer`, creates the parent company record, links an employer profile, and returns tokens.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterEmployerRequest' }
 *           example:
 *             full_name: "Alex Park"
 *             email: "alex@acme-careers.com"
 *             password: "Password@123"
 *             designation: "Head of Talent"
 *             company:
 *               name: "Acme Careers"
 *               industry: "Software"
 *               size: "51-200"
 *               website: "https://acme-careers.example.com"
 *               location: "San Francisco"
 *               country: "USA"
 *               description: "We build hiring software for fast-growing teams."
 *     responses:
 *       '201': { $ref: '#/components/responses/AuthLoginSuccess' }
 *       '409': { $ref: '#/components/responses/ConflictError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/register/employer', authLimiter, validate(v.registerEmployer), asyncHandler(controller.registerEmployer));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email + password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *           example: { email: "david@candidate.com", password: "Password@123" }
 *     responses:
 *       '200': { $ref: '#/components/responses/AuthLoginSuccess' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '403': { $ref: '#/components/responses/ForbiddenError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/login', authLimiter, validate(v.login), asyncHandler(controller.login));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke a refresh token (logout)
 *     security: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenRequest' }
 *           example: { refresh_token: "1f2c...e74" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 */
router.post('/logout', asyncHandler(controller.logout));

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh + access tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenRequest' }
 *           example: { refresh_token: "1f2c...e74" }
 *     responses:
 *       '200': { $ref: '#/components/responses/AuthLoginSuccess' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/refresh-token', authLimiter, validate(v.refreshToken), asyncHandler(controller.refreshToken));

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Begin a password reset flow
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordRequest' }
 *           example: { email: "david@candidate.com" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/forgot-password', authLimiter, validate(v.forgotPassword), asyncHandler(controller.forgotPassword));

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset a password using a one-time token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResetPasswordRequest' }
 *           example: { token: "abc123...", password: "NewPassword@123" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '400': { $ref: '#/components/responses/GenericError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/reset-password', authLimiter, validate(v.resetPassword), asyncHandler(controller.resetPassword));

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the authenticated user's password
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ChangePasswordRequest' }
 *           example: { current_password: "Password@123", new_password: "Password@456" }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '400': { $ref: '#/components/responses/GenericError' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/change-password', requireAuth, validate(v.changePassword), asyncHandler(controller.changePassword));

/**
 * @swagger
 * /auth/me:
 *   post:
 *     tags: [Auth]
 *     summary: Return the authenticated user and profile
 *     description: POST (not GET) per project rule for authenticated APIs. Body may be empty.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: Authenticated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *       '401': { $ref: '#/components/responses/UnauthorizedError' }
 */
router.post('/me', requireAuth, asyncHandler(controller.me));

/**
 * @swagger
 * /auth/verify-email/{token}:
 *   get:
 *     tags: [Auth]
 *     summary: Verify a new account via the link in the verification email
 *     description: Public, idempotent within the lifetime of the token. Marks the user as verified, flips status from `pending` to `active`. The frontend can also call the POST variant if it owns the token.
 *     security: []
 *     parameters: [{ name: token, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       '200': { description: Verified, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } }
 *       '400': { $ref: '#/components/responses/GenericError' }
 */
router.get('/verify-email/:token', validate(v.verifyEmailParam, 'params'), asyncHandler(controller.verifyEmailByLink));

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify a new account by posting the token (SPA fallback)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties: { token: { type: string } }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '400': { $ref: '#/components/responses/GenericError' }
 */
router.post('/verify-email', validate(v.verifyEmail), asyncHandler(controller.verifyEmail));

/**
 * @swagger
 * /auth/resend-verification-email:
 *   post:
 *     tags: [Auth]
 *     summary: Re-issue a verification email
 *     description: Always returns Success - we never leak whether the email exists.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 */
router.post('/resend-verification-email', authLimiter, validate(v.resendVerification), asyncHandler(controller.resendVerification));

module.exports = router;
