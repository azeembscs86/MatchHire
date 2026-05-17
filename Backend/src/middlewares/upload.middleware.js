'use strict';

/**
 * File-upload middleware
 * ----------------------
 * Multer config used by the resume routes. Keeps files in memory
 * (max 5MB) so the resume service can save them through the storage
 * abstraction rather than letting multer write to disk directly. This
 * lets us swap to S3 later without changing the controller.
 *
 * MIME type gating runs again inside `resume.service` to keep the
 * defence-in-depth story (don't trust the multipart header alone).
 */

const multer = require('multer');

const MAX_BYTES = 5 * 1024 * 1024;

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]).has(file.mimetype);
    if (!ok) return cb(new Error('Unsupported file type'), false);
    cb(null, true);
  },
});

module.exports = {
  resumeUpload,
  MAX_BYTES,
};
