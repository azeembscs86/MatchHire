'use strict';

/**
 * Mail routes
 * -----------
 * Mounted at `/api/v1/mail`. Everything here is intentionally low-
 * privilege and rate-limit-friendly because it's used for SMTP smoke
 * testing during deployment and by the auth service for transactional
 * mail (OTP / welcome) once wired in.
 *
 * Routes:
 *   POST /send-test       smoke send (plain | welcome | otp)
 *   POST /send-otp        send a real OTP (caller-provided code)
 *   POST /send-welcome    send the welcome email
 *   GET  /verify          verify SMTP connection without sending
 */

const router = require('express').Router();
const controller = require('../controllers/mail.controller');
const validate = require('../middlewares/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../validators/mail.validator');

/**
 * @swagger
 * /mail/send-test:
 *   post:
 *     tags: [Mail]
 *     summary: Send an SMTP smoke-test email
 *     description: |
 *       Sends a delivery test to the supplied address. Use `template`
 *       to preview a real transactional template instead of the
 *       generic smoke message:
 *         - `plain`   (default) one-line smoke email
 *         - `welcome` welcome-email HTML template
 *         - `otp`     OTP HTML template (code auto-generated when omitted)
 *
 *       Success response matches the product spec exactly:
 *       `{ Response: { responseCode: 1, status: "Success", message: "Email Sent Successfully" } }`.
 *       Failure surfaces as:
 *       `{ Response: { responseCode: 0, status: "Failed", message: "Unable to Send Email" } }`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:             { type: string, format: email, example: 'recipient@example.com' }
 *               template:          { type: string, enum: [plain, welcome, otp], default: plain }
 *               name:              { type: string, example: 'Alice' }
 *               code:              { type: string, example: '284913', description: 'Only used when template=otp' }
 *               purpose:           { type: string, example: 'verify your email' }
 *               expiresInMinutes:  { type: integer, example: 10 }
 *           examples:
 *             plain:
 *               summary: Generic smoke test
 *               value: { email: 'recipient@example.com' }
 *             welcome:
 *               summary: Preview the welcome email
 *               value: { email: 'recipient@example.com', template: 'welcome', name: 'Alice' }
 *             otp:
 *               summary: Preview the OTP email
 *               value: { email: 'recipient@example.com', template: 'otp', code: '284913', purpose: 'sign in', expiresInMinutes: 10 }
 *     responses:
 *       '200':
 *         description: Email accepted by the SMTP server
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Email Sent Successfully' }
 *               Data:
 *                 messageId: '<f81d4fae-7dec-11d0-a765-00a0c91e6bf6@matchhire.local>'
 *                 attempts: 1
 *                 accepted: ['recipient@example.com']
 *                 rejected: []
 *       '422': { $ref: '#/components/responses/ValidationError' }
 *       '502':
 *         description: SMTP failure (all retries exhausted)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorEnvelope' }
 *             example:
 *               Response: { responseCode: 0, status: 'Failed', message: 'Unable to Send Email' }
 *               Data: null
 */
router.post('/send-test', validate(v.sendTest), asyncHandler(controller.sendTest));

/**
 * @swagger
 * /mail/send-otp:
 *   post:
 *     tags: [Mail]
 *     summary: Send an OTP email (caller-provided code)
 *     description: |
 *       Sends the OTP HTML template. The `code` MUST be supplied by
 *       the caller — storage, hashing, and expiry remain owned by the
 *       auth service so this endpoint is safe to expose for QA.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:             { type: string, format: email }
 *               code:              { type: string, example: '284913' }
 *               name:              { type: string, example: 'Alice' }
 *               purpose:           { type: string, example: 'verify your email' }
 *               expiresInMinutes:  { type: integer, default: 10 }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 *       '502':
 *         description: SMTP failure
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorEnvelope' }
 */
router.post('/send-otp', validate(v.sendOtp), asyncHandler(controller.sendOtp));

/**
 * @swagger
 * /mail/send-welcome:
 *   post:
 *     tags: [Mail]
 *     summary: Send the welcome email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:        { type: string, format: email }
 *               name:         { type: string, example: 'Alice' }
 *               dashboardUrl: { type: string, format: uri, example: 'https://matchhire.com/dashboard/candidate' }
 *     responses:
 *       '200': { $ref: '#/components/responses/EmptySuccess' }
 *       '422': { $ref: '#/components/responses/ValidationError' }
 *       '502':
 *         description: SMTP failure
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorEnvelope' }
 */
router.post('/send-welcome', validate(v.sendWelcome), asyncHandler(controller.sendWelcome));

/**
 * @swagger
 * /mail/verify:
 *   get:
 *     tags: [Mail]
 *     summary: Verify the SMTP connection without sending an email
 *     description: |
 *       Calls `transporter.verify()` and returns the result. Useful as
 *       a health probe after rotating SMTP credentials or moving
 *       providers.
 *     security: []
 *     responses:
 *       '200':
 *         description: SMTP connection healthy
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'SMTP connection verified' }
 *               Data: { smtp: 'ok' }
 *       '503':
 *         description: SMTP connection failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorEnvelope' }
 */
router.get('/verify', asyncHandler(controller.verify));

module.exports = router;
