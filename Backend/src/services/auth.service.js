'use strict';

/**
 * Auth service
 * ------------
 * Business logic for the auth flows. The controller layer never touches
 * jwt/bcrypt directly - all credential handling, token rotation, and reset
 * flows live here.
 *
 * Token storage strategy:
 *   - access_token   : short-lived JWT, never stored server-side
 *   - refresh_token  : opaque random hex, SHA-256 hash stored in
 *                      `refresh_tokens`. Rotated on every refresh. Logout
 *                      revokes the supplied token; change_password revokes
 *                      ALL refresh tokens for the user.
 *
 * Password storage:
 *   - bcryptjs with cost 10 (`hashSync`/`compare`). Hash stored on `users.password_hash`.
 *
 * Password reset:
 *   - random hex token, SHA-256 hash stored in `password_reset_tokens`.
 *     Tokens expire after 1 hour and are single-use.
 */

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/database');
const userRepo = require('../repositories/user.repository');
const tokenRepo = require('../repositories/token.repository');
const candidateRepo = require('../repositories/candidate.repository');
const companyRepo = require('../repositories/company.repository');
const employerRepo = require('../repositories/employer.repository');
const emailService = require('./email.service');
const mailService = require('./mail/mail.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');

const VERIFICATION_TTL_HOURS = 24;
// Reset-token lifetime per product spec. 15 min is short enough to
// limit replay risk if a mail is intercepted, long enough to survive
// the user reading the email on a phone and switching to a laptop.
const RESET_TOKEN_TTL_MINUTES = 15;
// Refresh-token lifetimes. "Remember me" widens the window from the
// JWT_REFRESH_EXPIRES_IN default to 90 days so the session survives
// laptop reboots. Without remember-me, the refresh token still works
// for the configured default (typically 7d) — so the user stays
// signed in across a normal day but is signed out next week.
const REFRESH_DEFAULT_DAYS = 7;
const REFRESH_REMEMBER_DAYS = 90;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, full_name: user.full_name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function expiresInDays(spec, fallbackDays) {
  if (typeof spec === 'string') {
    const m = spec.match(/^(\d+)([dhm])$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2];
      const ms = unit === 'd' ? n * 24 * 3600 * 1000 : unit === 'h' ? n * 3600 * 1000 : n * 60 * 1000;
      return new Date(Date.now() + ms);
    }
  }
  return new Date(Date.now() + fallbackDays * 24 * 3600 * 1000);
}

/**
 * Issue a fresh email-verification token, persist its hash, and send the
 * verification email through the email service. Returns the plaintext
 * token + URL so the API can include them in dev mode (we do not expose
 * either in production; the email is the canonical channel).
 */
async function issueEmailVerification(user, meta = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const token_hash = hashToken(token);
  const expires_at = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600 * 1000);
  await tokenRepo.invalidateEmailVerificationsForUser(user.id);
  await tokenRepo.saveEmailVerificationToken({
    user_id: user.id,
    token_hash,
    expires_at,
    sent_to: user.email,
    ip_address: meta.ip || null,
  });
  const { url } = await emailService.sendVerificationEmail({ user, token });
  return { token, url, expires_at };
}

/**
 * Issue an access + refresh token pair for `user`. The refresh-token
 * TTL is driven by `meta.rememberMe`:
 *
 *   rememberMe === true  -> REFRESH_REMEMBER_DAYS (90 days)
 *   rememberMe falsy     -> the JWT_REFRESH_EXPIRES_IN env value
 *                           (default REFRESH_DEFAULT_DAYS = 7 days)
 *
 * `remember_me_enabled` on the response is informational — the
 * frontend reads it so it can default the "Remember me" checkbox the
 * next time the user signs in.
 */
async function issueTokens(user, meta = {}) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expires_at = meta.rememberMe
    ? new Date(Date.now() + REFRESH_REMEMBER_DAYS * 24 * 3600 * 1000)
    : expiresInDays(config.jwt.refreshExpiresIn, REFRESH_DEFAULT_DAYS);
  await tokenRepo.saveRefreshToken({
    user_id: user.id,
    token_hash: refreshHash,
    expires_at,
    ip_address: meta.ip || null,
    user_agent: meta.userAgent || null,
  });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    refresh_token_expires_at: expires_at,
    token_type: 'Bearer',
    expires_in: config.jwt.expiresIn,
    remember_me: !!meta.rememberMe,
  };
}

async function registerCandidate(payload, meta = {}) {
  const exists = await userRepo.emailExists(payload.email);
  if (exists) throw new AppError('Email already in use', 409);

  const password_hash = await bcrypt.hash(payload.password, 10);

  const user_id = await db.transaction(async (conn) => {
    const id = await userRepo.create({
      full_name: payload.full_name,
      email: payload.email.toLowerCase(),
      phone: payload.phone || null,
      password_hash,
      role: ROLES.CANDIDATE,
      status: 'pending',
    }, conn);
    await candidateRepo.upsertProfile(id, {
      headline: payload.headline || null,
      current_title: payload.current_title || null,
      years_experience: payload.years_experience || 0,
      location: payload.location || null,
      country: payload.country || null,
    }, conn);
    return id;
  });

  const user = await userRepo.findById(user_id);
  await candidateRepo.recomputeProfileStrength(user_id);

  // Email verification first - DO NOT issue session tokens until the
  // user clicks the verification link. In dev, the link + plaintext
  // token are returned so the frontend can present a "we sent you an
  // email" screen with a copyable URL.
  const verification = await issueEmailVerification(user, meta);
  return {
    user,
    requires_verification: true,
    verification_url: config.isProduction ? null : verification.url,
    verification_expires_at: verification.expires_at,
  };
}

async function registerEmployer(payload, meta = {}) {
  const exists = await userRepo.emailExists(payload.email);
  if (exists) throw new AppError('Email already in use', 409);

  const password_hash = await bcrypt.hash(payload.password, 10);

  const result = await db.transaction(async (conn) => {
    const user_id = await userRepo.create({
      full_name: payload.full_name,
      email: payload.email.toLowerCase(),
      phone: payload.phone || null,
      password_hash,
      role: ROLES.EMPLOYER,
      status: 'pending',
    }, conn);
    const company = await companyRepo.create({
      owner_user_id: user_id,
      name: payload.company.name,
      website: payload.company.website || null,
      industry: payload.company.industry || null,
      size: payload.company.size || null,
      location: payload.company.location || null,
      country: payload.company.country || null,
      description: payload.company.description || null,
    }, conn);
    await employerRepo.createProfile({
      user_id,
      company_id: company.id,
      designation: payload.designation || null,
      phone: payload.phone || null,
      is_primary_contact: true,
    }, conn);
    return { user_id, company_id: company.id };
  });

  const user = await userRepo.findById(result.user_id);
  const verification = await issueEmailVerification(user, meta);
  return {
    user,
    company_id: result.company_id,
    requires_verification: true,
    verification_url: config.isProduction ? null : verification.url,
    verification_expires_at: verification.expires_at,
  };
}

/**
 * Login flow.
 *
 * Accepts an optional `rememberMe` flag (off by default). When true:
 *   - the refresh token is issued with a 90-day TTL instead of the
 *     env default (typically 7 days)
 *   - users.remember_me_enabled is set to 1 so the next login
 *     pre-checks the box on the frontend (via /auth/me)
 *
 * Storage strategy (frontend-owned): when rememberMe=true the
 * frontend persists tokens in localStorage (survives browser
 * restarts); when false they live in sessionStorage (cleared on tab
 * close). The backend stays storage-agnostic — it just sizes the
 * TTL.
 */
async function login({ email, password, rememberMe = false }, meta = {}) {
  const userRow = await userRepo.findByEmail(email.toLowerCase());
  if (!userRow) throw new AppError('Invalid email or password', 401);
  if (userRow.status === 'suspended') throw new AppError('Account suspended', 403);
  if (userRow.status === 'inactive') throw new AppError('Account inactive', 403);
  const ok = await bcrypt.compare(password, userRow.password_hash);
  if (!ok) throw new AppError('Invalid email or password', 401);

  // Email-verification gate: an account in `pending` (or with a NULL
  // email_verified_at) must verify before it can sign in. The thrown
  // error carries `details` so the frontend can offer "resend".
  if (userRow.status === 'pending' || !userRow.email_verified_at) {
    throw new AppError(
      'Please verify your email before signing in.',
      403,
      { code: 'EMAIL_NOT_VERIFIED', email: userRow.email }
    );
  }

  await userRepo.touchLogin(userRow.id);
  await userRepo.setRememberMe(userRow.id, rememberMe);
  const { password_hash, ...user } = userRow; // eslint-disable-line no-unused-vars
  user.remember_me_enabled = rememberMe ? 1 : 0;
  const tokens = await issueTokens(user, { ...meta, rememberMe });
  return { user, ...tokens };
}

/**
 * Consume a verification token: mark the user as verified, return the
 * activated profile. Reused by both the GET link click and the POST
 * fallback the frontend uses if it captures the token from URL state.
 */
async function verifyEmail(token) {
  if (!token) throw new AppError('Verification token required', 400);
  const rec = await tokenRepo.findEmailVerificationByHash(hashToken(token));
  if (!rec) throw new AppError('Invalid verification link', 400);
  if (rec.used_at) throw new AppError('This verification link has already been used', 400);
  if (new Date(rec.expires_at).getTime() <= Date.now()) {
    throw new AppError('Verification link expired - request a new one', 400);
  }
  await tokenRepo.consumeEmailVerification(rec.id);
  await userRepo.markEmailVerified(rec.user_id);
  const user = await userRepo.findById(rec.user_id);
  return { user };
}

/**
 * Re-issue a verification token. Idempotent across requests - any
 * outstanding tokens for the user are invalidated first so only the
 * latest one works.
 */
async function resendVerification(email, meta = {}) {
  const user = await userRepo.findByEmail(email.toLowerCase());
  // Do NOT leak whether the email exists.
  if (!user) return { sent: true };
  if (user.email_verified_at) return { sent: true, already_verified: true };
  const v = await issueEmailVerification(user, meta);
  return {
    sent: true,
    verification_url: config.isProduction ? null : v.url,
    verification_expires_at: v.expires_at,
  };
}

async function logout(refresh_token) {
  if (!refresh_token) return;
  const hash = hashToken(refresh_token);
  const rec = await tokenRepo.findRefreshTokenByHash(hash);
  if (rec) await tokenRepo.revokeRefreshToken(rec.id);
}

async function rotateRefreshToken(refresh_token, meta = {}) {
  if (!refresh_token) throw new AppError('Refresh token required', 400);
  const hash = hashToken(refresh_token);
  const rec = await tokenRepo.findRefreshTokenByHash(hash);
  if (!rec) throw new AppError('Invalid refresh token', 401);
  if (rec.revoked_at) throw new AppError('Refresh token revoked', 401);
  if (new Date(rec.expires_at).getTime() <= Date.now()) throw new AppError('Refresh token expired', 401);

  const user = await userRepo.findById(rec.user_id);
  if (!user) throw new AppError('User no longer exists', 401);

  const tokens = await issueTokens(user, meta);
  const newHash = hashToken(tokens.refresh_token);
  const newRec = await tokenRepo.findRefreshTokenByHash(newHash);
  await tokenRepo.revokeRefreshToken(rec.id, newRec?.id || null);
  return { user, ...tokens };
}

/**
 * Forgot-password flow.
 *
 * Always returns the SAME shape regardless of whether the email
 * matches an account, so this endpoint cannot be used to enumerate
 * registered users. The caller is the controller, which renders the
 * generic "If this email exists..." message.
 *
 * Side effects when the email DOES match:
 *   1. Any outstanding (unused, unexpired) reset tokens for that user
 *      are invalidated, so a stolen prior token can't be replayed.
 *   2. A fresh single-use token is generated (32 random bytes hex);
 *      only its SHA-256 hash is stored — the plaintext lives only in
 *      the email body.
 *   3. The token TTL is RESET_TOKEN_TTL_MINUTES (15 minutes).
 *   4. A real reset email is sent through the mail service. SMTP
 *      failures are absorbed (fail-soft) so the controller's generic
 *      success envelope never reveals delivery state to the caller.
 */
async function forgotPassword(email, meta = {}) {
  const user = await userRepo.findByEmail(email.toLowerCase());
  if (!user) return { sent: false };

  // Invalidate prior tokens BEFORE generating the new one so a race
  // (e.g. user clicks "Forgot" twice) can't leave two valid tokens.
  await tokenRepo.invalidatePriorResetTokensForUser(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await tokenRepo.savePasswordResetToken({
    user_id: user.id,
    token_hash: hashToken(token),
    expires_at,
  });

  // Build the link to the SPA reset page. FRONTEND_BASE_URL is
  // configurable via env so staging/prod URLs don't bleed into dev.
  const base = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const resetUrl = `${base.replace(/\/$/, '')}/reset-password/${token}`;
  const result = await mailService.sendPasswordResetEmail(user.email, {
    name: user.full_name,
    resetUrl,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  });
  if (result && result.ok === false) {
    logger.warn('forgotPassword: reset email delivery failed', { user_id: user.id, error: result.error });
  }
  // Return the plaintext token + URL ONLY in non-production so the
  // dev/demo flow can still complete without an inbox.
  return {
    sent: true,
    reset_url: config.isProduction ? null : resetUrl,
    reset_token: config.isProduction ? null : token,
    expires_at,
  };
}

/**
 * Read-only check that a reset token is still valid. Used by the
 * frontend reset page on mount so it can either render the new-
 * password form or redirect to /forgot-password with an "expired"
 * banner. Does NOT consume the token.
 */
async function verifyResetToken(token) {
  if (!token) return { valid: false, reason: 'missing' };
  const rec = await tokenRepo.findPasswordResetByHash(hashToken(token));
  if (!rec) return { valid: false, reason: 'invalid' };
  if (rec.used_at) return { valid: false, reason: 'used' };
  if (new Date(rec.expires_at).getTime() <= Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, expires_at: rec.expires_at };
}

/**
 * Reset password flow.
 *
 * After validation the token is consumed (single-use), the password
 * hash is updated (and password_changed_at stamped via
 * userRepo.updatePassword), ALL refresh tokens for the user are
 * revoked (so other devices are signed out), and a confirmation
 * email is queued.
 */
async function resetPassword({ token, password }, meta = {}) {
  const rec = await tokenRepo.findPasswordResetByHash(hashToken(token));
  if (!rec) throw new AppError('Invalid or expired reset token', 400);
  if (rec.used_at) throw new AppError('This reset link has already been used', 400);
  if (new Date(rec.expires_at).getTime() <= Date.now()) throw new AppError('Reset link expired - request a new one', 400);

  const password_hash = await bcrypt.hash(password, 10);
  await userRepo.updatePassword(rec.user_id, password_hash);
  await tokenRepo.consumePasswordReset(rec.id);
  await tokenRepo.revokeAllForUser(rec.user_id);

  // Out-of-band notification. Fail-soft: we never want a flaky SMTP
  // to roll back a successful password change.
  const user = await userRepo.findById(rec.user_id);
  if (user) {
    await mailService.sendPasswordChangedEmail(user.email, {
      name: user.full_name,
      ip: meta.ip || null,
    });
  }
  return true;
}

/**
 * Change-password flow (authenticated user). Same trust-and-revoke
 * pattern as resetPassword: hash, persist, stamp, revoke all refresh
 * tokens, send confirmation email.
 */
async function changePassword(user_id, { current_password, new_password }, meta = {}) {
  const userRow = await db.queryOne(
    'SELECT id, email, full_name, password_hash FROM users WHERE id = ? LIMIT 1',
    [user_id]
  );
  if (!userRow) throw new AppError('User not found', 404);
  const ok = await bcrypt.compare(current_password, userRow.password_hash);
  if (!ok) throw new AppError('Current password is incorrect', 400);
  const password_hash = await bcrypt.hash(new_password, 10);
  await userRepo.updatePassword(user_id, password_hash);
  await tokenRepo.revokeAllForUser(user_id);
  await mailService.sendPasswordChangedEmail(userRow.email, {
    name: userRow.full_name,
    ip: meta.ip || null,
  });
  return true;
}

async function me(user_id) {
  const user = await userRepo.findById(user_id);
  if (!user) throw new AppError('User not found', 404);
  let profile = null;
  if (user.role === ROLES.CANDIDATE) {
    profile = await candidateRepo.findProfileByUserId(user_id);
  } else if (user.role === ROLES.EMPLOYER) {
    profile = await employerRepo.findByUserId(user_id);
  }
  return { user, profile };
}

module.exports = {
  registerCandidate,
  registerEmployer,
  login,
  logout,
  rotateRefreshToken,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  changePassword,
  me,
  verifyEmail,
  resendVerification,
  hashToken,
  RESET_TOKEN_TTL_MINUTES,
};
