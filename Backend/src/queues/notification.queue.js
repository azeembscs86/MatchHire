'use strict';

/**
 * Notification queue
 * ------------------
 * Persists in-app notifications (`notifications` table) and optionally
 * fans out an email through the email queue. Producer for:
 *
 *   - application-status:   { user_id, application_id, status, job_title, company_name }
 *   - interview-scheduled:  { user_id, application_id, scheduled_at, mode }
 *   - new-match:            { user_id, job_id, job_title, match_score }
 *   - job-alert-digest:     { user_id, jobs: [...] }
 *
 * Inline fallback writes the row directly. Background mode is just a
 * latency optimisation; the source of truth is always the notifications
 * table.
 */

const queues = require('./index');
const db = require('../config/database');
const emailQueue = require('./email.queue');
const logger = require('../utils/logger');

const QUEUE = 'notification';

async function persistNotification({ user_id, type, title, message, data = null }) {
  await db.getPool().execute(
    `INSERT INTO notifications (user_id, type, title, message, data, is_read)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [user_id, type, title, message || null, data ? JSON.stringify(data) : null]
  );
}

const handlers = {
  'application-status': async ({ user_id, status, job_title, company_name }) => {
    await persistNotification({
      user_id,
      type: 'application_status',
      title: status === 'rejected'
        ? `Update from ${company_name}`
        : `Application moved to ${status} at ${company_name}`,
      message: `Your application for "${job_title}" is now ${status}.`,
      data: { status },
    });
  },
  'interview-scheduled': async ({ user_id, scheduled_at, mode, job_title }) => {
    await persistNotification({
      user_id,
      type: 'interview',
      title: `Interview scheduled (${mode})`,
      message: `Your ${mode} interview for "${job_title}" is set for ${new Date(scheduled_at).toLocaleString()}.`,
      data: { scheduled_at, mode },
    });
  },
  'new-match': async ({ user_id, job_title, match_score }) => {
    await persistNotification({
      user_id,
      type: 'new_match',
      title: `New ${match_score}% match: ${job_title}`,
      message: `A role just landed that fits your profile.`,
      data: { match_score },
    });
  },
  'job-alert-digest': async ({ user_id, jobs = [] }) => {
    if (!jobs.length) return;
    await persistNotification({
      user_id,
      type: 'job_alert',
      title: `${jobs.length} new ${jobs.length === 1 ? 'role' : 'roles'} to consider`,
      message: jobs.slice(0, 3).map((j) => j.title).join(' · '),
      data: { count: jobs.length },
    });
  },
};

async function inlineFallback(payload) {
  const handler = handlers[payload.__jobName];
  if (!handler) {
    logger.warn('notification inline: unknown job', { name: payload.__jobName });
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
    if (!handler) throw new Error(`Unknown notification job ${data.__jobName}`);
    return handler(data);
  }, { concurrency: 10 });
}

module.exports = { add, startWorker, QUEUE };
