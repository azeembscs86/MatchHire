'use strict';

/**
 * Redis client manager
 * --------------------
 * Owns the ioredis client used by `src/cache/cache.helper.js`.
 *
 * Design rule: Redis is OPTIONAL. If it cannot connect (or drops), every
 * cache helper short-circuits to a no-op and the API serves directly from
 * MySQL. The `isReady()` flag is the single source of truth for that.
 *
 * `lazyConnect: true` lets the process boot even when Redis is offline -
 * we surface the warning in the log and continue.
 */

const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

let client = null;
let connected = false;
let disabled = false;

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
    logger.info('Redis connected');
  });
  c.on('ready', () => {
    connected = true;
  });
  c.on('end', () => {
    connected = false;
  });
  c.on('error', (err) => {
    connected = false;
    logger.warn('Redis error - operating in fallback mode', { error: err.message });
  });

  return c;
}

async function init() {
  if (disabled) return null;
  if (client) return client;
  client = buildClient();
  try {
    await client.connect();
  } catch (err) {
    connected = false;
    logger.warn('Redis unavailable - cache operations will be skipped', { error: err.message });
  }
  return client;
}

function isReady() {
  return !!client && connected && !disabled;
}

function getClient() {
  return client;
}

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
