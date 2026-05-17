'use strict';

/**
 * Redis client manager
 * --------------------
 * Owns the ioredis client used by `src/cache/cache.helper.js`.
 *
 * Design rule: Redis is OPTIONAL. If it cannot connect (or drops at
 * runtime), every cache helper short-circuits to a no-op and the API
 * serves directly from MySQL. The `isReady()` flag is the single source
 * of truth for that.
 *
 * Connection strategy:
 *   - `lazyConnect: true` so the process boots even when Redis is offline.
 *   - `maxRetriesPerRequest: 1` keeps any in-flight cache call from
 *     hanging.
 *   - `retryStrategy` gives up after 5 attempts; we never retry-loop
 *     forever in fallback mode.
 *
 * Log noise: error events are intentionally throttled - we emit a single
 * "fallback mode" log line per connection lifecycle rather than one per
 * retry tick.
 */

const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

let client = null;
let connected = false;
let disabled = false;
let fallbackLogged = false;

/** Build a fresh ioredis client with the project's connection options. */
function buildClient() {
  const c = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    keyPrefix: config.redis.keyPrefix,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 500, 3000);
    },
    reconnectOnError() { return false; },
  });

  c.on('connect', () => {
    connected = true;
    fallbackLogged = false;
    logger.info('Redis connected');
  });
  c.on('ready', () => { connected = true; });
  c.on('end', () => { connected = false; });
  c.on('error', (err) => {
    connected = false;
    // Emit one "fallback mode" message per connection lifecycle to avoid
    // log spam when Redis is intentionally offline in development.
    if (!fallbackLogged) {
      fallbackLogged = true;
      logger.warn('Redis unavailable - operating in fallback mode', { error: err.message });
    }
  });

  return c;
}

/** Initialise the client. Always resolves; never rejects on connection error. */
async function init() {
  if (disabled) return null;
  if (client) return client;
  client = buildClient();
  try {
    await client.connect();
  } catch (err) {
    connected = false;
    if (!fallbackLogged) {
      fallbackLogged = true;
      logger.warn('Redis unavailable - cache operations will be skipped', { error: err.message });
    }
  }
  return client;
}

function isReady() { return !!client && connected && !disabled; }
function getClient() { return client; }

/** Explicit opt-out (used by tests or when Redis must be skipped entirely). */
function disable() {
  disabled = true;
  if (client) {
    try { client.disconnect(); } catch (_) { /* noop */ }
  }
}

async function close() {
  if (client) {
    try { await client.quit(); } catch (_) { /* noop */ }
    client = null;
    connected = false;
  }
}

module.exports = {
  init,
  getClient,
  isReady,
  disable,
  close,
};
