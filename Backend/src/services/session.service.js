'use strict';

/**
 * Session service - multi-device session management on top of Redis.
 *
 * The MatchHire auth flow issues an opaque refresh token (hashed in
 * MySQL under `refresh_tokens`) plus a short-lived JWT access token.
 * This service ALSO stores a row of session metadata in Redis under:
 *
 *   mh:session:<userId>:<sessionId>     hash field "data" -> JSON
 *   mh:session-idx:<userId>             hash userId -> { sessionId: createdAt }
 *
 * `sessionId` is the SHA-256 hash of the refresh token (so we can
 * look it up without storing the plaintext). The Redis copy is a
 * convenience for fast multi-device listing + logout-everywhere; if
 * Redis is offline, the MySQL refresh_tokens table remains the source
 * of truth and the auth flow keeps working.
 *
 *   sessionService.create(...)            on login / register
 *   sessionService.get(...)               read session metadata
 *   sessionService.revoke(...)            single-device logout
 *   sessionService.revokeAllForUser(...)  logout everywhere
 *   sessionService.listForUser(...)       admin / "your devices" UI
 */

const crypto = require('node:crypto');
const cache = require('./cache.service');
const { Keys, TTL } = require('../helpers/cacheKey.helper');
const logger = require('../utils/logger');

function sessionIdFromToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

async function create({ userId, refreshToken, ip = null, userAgent = null, expiresAt }) {
  if (!cache.isReady()) return null;
  const sessionId = sessionIdFromToken(refreshToken);
  const ttl = expiresAt
    ? Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : TTL.SESSION;
  const meta = {
    userId,
    sessionId,
    ip,
    userAgent,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
  try {
    await cache.hset(Keys.session(userId, sessionId), 'data', meta, ttl);
    await cache.hset(Keys.sessionIndex(userId), sessionId, meta.createdAt, ttl);
    return meta;
  } catch (err) {
    logger.warn('session.create failed', { error: err.message });
    return null;
  }
}

async function get({ userId, refreshToken }) {
  if (!cache.isReady()) return null;
  const sessionId = sessionIdFromToken(refreshToken);
  return cache.hget(Keys.session(userId, sessionId), 'data');
}

async function revoke({ userId, refreshToken }) {
  if (!cache.isReady()) return 0;
  const sessionId = sessionIdFromToken(refreshToken);
  await cache.del(Keys.session(userId, sessionId));
  await cache.hdel(Keys.sessionIndex(userId), sessionId);
  return 1;
}

async function revokeAllForUser(userId) {
  if (!cache.isReady()) return 0;
  const ids = await cache.hkeys(Keys.sessionIndex(userId));
  if (!ids.length) return 0;
  const keys = ids.map((id) => Keys.session(userId, id));
  await cache.del(...keys);
  await cache.del(Keys.sessionIndex(userId));
  return ids.length;
}

async function listForUser(userId) {
  if (!cache.isReady()) return [];
  const ids = await cache.hkeys(Keys.sessionIndex(userId));
  const sessions = await Promise.all(
    ids.map((id) => cache.hget(Keys.session(userId, id), 'data'))
  );
  return sessions.filter(Boolean);
}

module.exports = {
  create,
  get,
  revoke,
  revokeAllForUser,
  listForUser,
};
