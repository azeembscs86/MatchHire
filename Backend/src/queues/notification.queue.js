'use strict';

/**
 * Notification queue
 * ------------------
 * Persists in-app notifications (`notifications` table) and optionally
 * fans out an email through the email queue. Producer for:
 *
 *   - application-status:    { user_id, application_id, status, job_title, company_name }
 *   - interview-scheduled:   { user_id, application_id, scheduled_at, mode }
 *   - new-match:             { user_id, job_id, job_title, match_score }
 *   - job-alert-digest:      { user_id, jobs: [...] }
 *   - job-approval-required: { job_id, company_name, job_title }
 *                             fans out one notification row per active
 *                             super_admin user so the moderation queue
 *                             surfaces on /dashboard/admin.
 *   - job-approval-decision: { user_id, job_id, job_title, admin_status, reason }
 *                             notifies the company contact when a
 *                             super_admin approves or rejects their post.
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
  /**
   * Super-admin notification for the moderation queue. Fans out one
   * row per active super_admin so every admin gets pinged when a
   * company submits a new posting. Uses a small SELECT against the
   * users table because the persistence path is one-to-one with
   * recipient — no fan-out helper exists today.
   */
  'job-approval-required': async ({ job_id, job_title, company_name }) => {
    const admins = await db.query(
      `SELECT id FROM users
        WHERE role IN ('admin', 'super_admin')
          AND status = 'active'
          AND deleted_at IS NULL`
    );
    for (const a of admins) {
      await persistNotification({
        user_id: a.id,
        type: 'job_approval_required',
        title: 'New job awaiting approval',
        message: `${company_name || 'A company'} submitted "${job_title}" for review.`,
        data: { job_id, company_name },
      });
    }
  },
  /**
   * Company-facing notification once super_admin approves or
   * rejects a posting. The reason field is only populated on the
   * rejection path; the candidate already reads the reason on
   * their own My Applications surface for application rejections,
   * but jobs need their own flow because rejection reasons aren't
   * stored on the job row itself today.
   */
  'job-approval-decision': async ({ user_id, job_title, admin_status, reason }) => {
    const isApproved = admin_status === 'approved';
    await persistNotification({
      user_id,
      type: 'job_approval_decision',
      title: isApproved
        ? `Job approved: ${job_title}`
        : `Job rejected: ${job_title}`,
      message: isApproved
        ? 'Your posting is now live on MatchHire.'
        : (reason
          ? `Reason: ${reason}`
          : 'A super-admin asked you to revise this posting.'),
      data: { admin_status, reason: reason || null },
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
