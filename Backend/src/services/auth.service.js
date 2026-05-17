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
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

const VERIFICATION_TTL_HOURS = 24;

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

async function issueTokens(user, meta = {}) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  const expires_at = expiresInDays(config.jwt.refreshExpiresIn, 30);
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
    token_type: 'Bearer',
    expires_in: config.jwt.expiresIn,
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

async function login({ email, password }, meta = {}) {
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
  const { password_hash, ...user } = userRow; // eslint-disable-line no-unused-vars
  const tokens = await issueTokens(user, meta);
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

async function forgotPassword(email) {
  const user = await userRepo.findByEmail(email.toLowerCase());
  if (!user) return { token: null };
  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + 60 * 60 * 1000);
  await tokenRepo.savePasswordResetToken({
    user_id: user.id, token_hash: hashToken(token), expires_at,
  });
  return { token };
}

async function resetPassword({ token, password }) {
  const rec = await tokenRepo.findPasswordResetByHash(hashToken(token));
  if (!rec) throw new AppError('Invalid or expired reset token', 400);
  if (rec.used_at) throw new AppError('Token already used', 400);
  if (new Date(rec.expires_at).getTime() <= Date.now()) throw new AppError('Token expired', 400);
  const password_hash = await bcrypt.hash(password, 10);
  await userRepo.updatePassword(rec.user_id, password_hash);
  await tokenRepo.consumePasswordReset(rec.id);
  await tokenRepo.revokeAllForUser(rec.user_id);
  return true;
}

async function changePassword(user_id, { current_password, new_password }) {
  const userRow = await db.queryOne('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1', [user_id]);
  if (!userRow) throw new AppError('User not found', 404);
  const ok = await bcrypt.compare(current_password, userRow.password_hash);
  if (!ok) throw new AppError('Current password is incorrect', 400);
  const password_hash = await bcrypt.hash(new_password, 10);
  await userRepo.updatePassword(user_id, password_hash);
  await tokenRepo.revokeAllForUser(user_id);
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
  resetPassword,
  changePassword,
  me,
  verifyEmail,
  resendVerification,
  hashToken,
};
