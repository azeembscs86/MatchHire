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
