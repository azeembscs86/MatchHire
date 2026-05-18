'use strict';

/**
 * Resume queue
 * ------------
 * Heavy-ish work (PDF extraction with pdf-parse, DOCX with mammoth)
 * offloaded from the HTTP path so the upload endpoint returns fast
 * while parsing continues in the background. The frontend polls
 * `/candidates/resume/:id/preview` until the row's parse_status flips
 * to `parsed`.
 *
 * Inline fallback runs parsing synchronously - the existing
 * `POST /candidates/resume/:id/parse` route already exposes this path
 * for explicit triggers.
 *
 * Job payloads:
 *   - parse-resume:   { resumeId }
 *   - reindex-resume: { resumeId }   (after confirm; pushes parsed
 *                                    data into ElasticSearch)
 */

const queues = require('./index');
const resumeService = require('../services/resume.service');
const logger = require('../utils/logger');

const QUEUE = 'resume';

const handlers = {
  'parse-resume': async ({ resumeId }) => resumeService.parse(resumeId),
  'reindex-resume': async ({ resumeId }) => {
    // Wire to the resume indexer once it exists; safe no-op for now.
    try {
      const { indexResume } = require('../indexers/resume.indexer');
      await indexResume(resumeId);
    } catch (_err) { /* indexer not wired yet, ignore */ }
  },
};

async function inlineFallback(payload) {
  const handler = handlers[payload.__jobName];
  if (!handler) {
    logger.warn('resume inline: unknown job', { name: payload.__jobName });
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
    if (!handler) throw new Error(`Unknown resume job ${data.__jobName}`);
    return handler(data);
  }, { concurrency: 2 }); // parsing is CPU-ish; keep concurrency low
}

module.exports = { add, startWorker, QUEUE };
