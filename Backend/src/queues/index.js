'use strict';

/**
 * Queue infrastructure (BullMQ)
 * -----------------------------
 * One Redis-backed Queue per workload (email, resume parsing,
 * notifications, match recalculation). Every queue is created lazily
 * so the server still starts on a Redis-less machine; if Redis is
 * unavailable when `add()` is called the job runs INLINE
 * synchronously, preserving the user-facing flow at the cost of
 * background-ness. The behaviour is logged so an operator can see
 * what's happening.
 *
 * Pattern used across all queues:
 *
 *   const { add } = require('./email.queue');
 *   await add('send-verification', { user, token });
 *
 * Producers do not import BullMQ directly - they go through the
 * thin wrapper here.
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const redis = require('../config/redis');
const config = require('../config/env');
const logger = require('../utils/logger');

const sharedConnection = {
  // BullMQ wants its own connection so commands like BRPOPLPUSH can
  // block without affecting the app's regular Redis traffic.
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: null, // BullMQ recommendation
  enableReadyCheck: false,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 4000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};

const queues = new Map();
const workers = new Map();

/**
 * Returns the queue handle (or null if Redis is offline). Callers
 * should not assume the queue is up - use `add(...)` below which
 * handles the fallback.
 */
function getQueue(name) {
  if (!redis.isReady()) return null;
  if (queues.has(name)) return queues.get(name);
  try {
    const q = new Queue(name, {
      connection: sharedConnection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, q);
    return q;
  } catch (err) {
    logger.warn(`Queue init failed for ${name} - falling back to inline execution`, { error: err.message });
    return null;
  }
}

/**
 * Generic producer. `inlineFallback` is the function to call
 * synchronously if Redis/BullMQ is unavailable. Returns the job id
 * (BullMQ) or `null` (inline path).
 */
async function add({ queueName, jobName, payload, inlineFallback, opts = {} }) {
  const q = getQueue(queueName);
  if (!q) {
    if (typeof inlineFallback === 'function') {
      try {
        await inlineFallback(payload);
      } catch (err) {
        logger.error(`Inline ${queueName}.${jobName} failed`, { error: err.message, stack: err.stack });
      }
    }
    return null;
  }
  const job = await q.add(jobName, payload, { ...DEFAULT_JOB_OPTIONS, ...opts });
  return job.id;
}

/**
 * Mount a worker for a queue. Called once at startup per queue.
 * Returns the Worker handle so callers can `.close()` on shutdown.
 */
function registerWorker(name, handler, options = {}) {
  if (!redis.isReady()) {
    logger.info(`Worker for "${name}" not started - Redis unavailable; jobs will run inline.`);
    return null;
  }
  if (workers.has(name)) return workers.get(name);
  try {
    const w = new Worker(
      name,
      async (job) => handler(job.data, job),
      { connection: sharedConnection, concurrency: options.concurrency || 5 }
    );
    w.on('failed', (job, err) => {
      logger.warn(`Queue "${name}" job failed`, {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        error: err.message,
      });
    });
    w.on('completed', (job) => {
      logger.debug?.(`Queue "${name}" job done`, { jobId: job.id, name: job.name });
    });
    workers.set(name, w);
    // Optional: events stream for queue dashboards
    try { new QueueEvents(name, { connection: sharedConnection }); }
    catch (_) { /* non-fatal */ }
    logger.info(`Worker registered for "${name}" (concurrency ${options.concurrency || 5})`);
    return w;
  } catch (err) {
    logger.warn(`Worker init failed for ${name}`, { error: err.message });
    return null;
  }
}

async function closeAll() {
  for (const w of workers.values()) { try { await w.close(); } catch (_) { /* noop */ } }
  for (const q of queues.values()) { try { await q.close(); } catch (_) { /* noop */ } }
  workers.clear();
  queues.clear();
}

module.exports = {
  add,
  registerWorker,
  closeAll,
  getQueue,
};
