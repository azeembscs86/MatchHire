'use strict';

/**
 * Email queue
 * -----------
 * Producer for transactional emails. Falls back to inline send when
 * Redis/BullMQ is offline, so the user-facing flow (signup, reset,
 * application status) is never blocked by infra.
 *
 * Job payloads:
 *   - send-verification:    { user, token, url }
 *   - send-password-reset:  { user, token, url }
 *   - send-application:     { user, job, decision, message }
 *   - send-generic:         { to, subject, text, html? }
 */

const queues = require('./index');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

const QUEUE = 'email';

const handlers = {
  'send-verification': async ({ user, token }) => emailService.sendVerificationEmail({ user, token }),
  'send-application': async ({ user, job, decision, message }) =>
    emailService.sendApplicationDecision({ user, job, decision, message }),
  'send-generic': async (payload) => emailService.send(payload),
};

async function inlineFallback(payload) {
  const handler = handlers[payload.__jobName];
  if (!handler) {
    logger.warn('email inline: unknown job', { name: payload.__jobName });
    return;
  }
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
    if (!handler) throw new Error(`Unknown email job ${data.__jobName}`);
    return handler(data);
  }, { concurrency: 5 });
}

module.exports = { add, startWorker, QUEUE };
