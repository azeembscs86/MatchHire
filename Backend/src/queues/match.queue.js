'use strict';

/**
 * Match queue
 * -----------
 * Bulk recomputation of `(candidate, job)` match scores when something
 * upstream changes:
 *
 *   - recompute-for-candidate:  { candidateId }
 *                               clear match cache for that candidate +
 *                               warm the top N jobs
 *   - recompute-for-job:        { jobId }
 *                               clear match cache for that job
 *
 * Designed to run after profile/skills/preference saves and after job
 * create/update. When Redis is offline the inline fallback simply
 * blasts the relevant cache patterns (which is a no-op anyway in
 * fallback mode) - real recomputation happens on the next read.
 */

const queues = require('./index');
const cache = require('../services/cache.service');
const logger = require('../utils/logger');

const QUEUE = 'match';

const handlers = {
  'recompute-for-candidate': async ({ candidateId }) => {
    if (!candidateId) return;
    await cache.invalidate.candidateProfileChanged(candidateId);
  },
  'recompute-for-job': async ({ jobId }) => {
    if (!jobId) return;
    await cache.invalidate.job(jobId);
  },
};

async function inlineFallback(payload) {
  const handler = handlers[payload.__jobName];
  if (!handler) return;
  return handler(payload);
}

async function add(jobName, payload, opts = {}) {
  return queues.add({
    queueName: QUEUE,
    jobName,
    payload: { ...payload, __jobName: jobName },
    inlineFallback,
    opts,
  });
}

function startWorker() {
  return queues.registerWorker(QUEUE, async (data) => {
    const handler = handlers[data.__jobName];
    if (!handler) throw new Error(`Unknown match job ${data.__jobName}`);
    return handler(data);
  }, { concurrency: 3 });
}

module.exports = { add, startWorker, QUEUE };
