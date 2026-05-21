'use strict';

/**
 * Resume controller
 * -----------------
 * HTTP boundary for candidate resume management. Upload uses
 * multer.memoryStorage so the file lands in `req.file.buffer` first
 * and the resume service decides whether to persist it.
 *
 * Endpoints (all authenticated, candidate-only, mounted under
 * `/api/v1/candidates/resume/...`):
 *
 *   POST /upload        multipart "resume" field
 *   POST /:id/parse     trigger heuristic extraction
 *   GET  /:id           parsed-data preview
 *   POST /:id/confirm   merge confirmed fields into the profile
 *   GET  /:id/download  short-lived signed URL pointing at /files/...
 *   GET  /list          all resumes the user has uploaded
 */

const service = require('../services/resume.service');
const response = require('../utils/response.helper');

exports.upload = async (req, res) => {
  const data = await service.uploadForUser(req.user.id, req.file);
  return response.created(res, data, 'Resume uploaded - call /parse to extract fields');
};

exports.list = async (req, res) => {
  const data = await service.listForUser(req.user.id);
  return response.success(res, { records: data }, 'Resumes returned');
};

exports.parse = async (req, res) => {
  const data = await service.parse(Number(req.params.id));
  return response.success(res, data, 'Resume parsed - review and confirm to update your profile');
};

exports.preview = async (req, res) => {
  const data = await service.findParsed(Number(req.params.id));
  return response.success(res, data || {}, 'Parsed data');
};

exports.confirm = async (req, res) => {
  const data = await service.confirm(req.user.id, Number(req.params.id), req.body || {});
  return response.success(res, data, 'Profile updated from resume');
};

exports.signedDownload = async (req, res) => {
  const url = await service.signedDownloadUrl(req.user.id, Number(req.params.id));
  return response.success(res, { url, expires_in_seconds: 600 }, 'Signed URL issued');
};

/* --- Resume management (§34) --- */

/**
 * POST /candidates/resume/:id/detail
 * Resume metadata + parsed-data preview in one round-trip.
 */
exports.detail = async (req, res) => {
  const data = await service.getDetail(req.user.id, Number(req.params.id));
  return response.success(res, data, 'Resume detail returned');
};

/**
 * POST /candidates/resume/:id/set-primary
 * Atomically promotes this resume to primary; demotes all others.
 */
exports.setPrimary = async (req, res) => {
  const data = await service.setPrimary(req.user.id, Number(req.params.id));
  return response.success(res, data, 'Primary resume updated');
};

/**
 * POST /candidates/resume/:id/delete
 * Soft-deletes the resume row and renames the file on disk.
 * Auto-promotes the next-most-recent resume to primary if needed.
 */
exports.softDelete = async (req, res) => {
  const data = await service.softDelete(req.user.id, Number(req.params.id));
  return response.success(res, data, 'Resume removed');
};

/**
 * POST /candidates/resume/:id/parsed-data
 * Save manual edits to the parsed preview WITHOUT applying them
 * to the candidate profile. Use /confirm to merge into the profile.
 */
exports.updateParsedData = async (req, res) => {
  const data = await service.updateParsedData(
    req.user.id,
    Number(req.params.id),
    req.body || {}
  );
  return response.success(res, data, 'Parsed data updated');
};

/**
 * POST /candidates/resume/:id/reject
 * Record that the candidate rejected the parsed preview. The
 * resume file stays uploaded; only the auto-apply flow is blocked.
 */
exports.rejectParsedData = async (req, res) => {
  const data = await service.rejectParsedData(
    req.user.id,
    Number(req.params.id),
    req.body?.reason
  );
  return response.success(res, data, 'Parsed data rejected');
};
