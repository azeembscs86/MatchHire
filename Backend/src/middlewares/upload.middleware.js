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

const MAX_BYTES = 5 * 1024 * 1024;          // resumes: 5MB
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;    // profile images: 2MB (per product spec)

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

/**
 * Profile-image upload middleware.
 *
 * Defence-in-depth checks:
 *   1. multer's `limits.fileSize` rejects anything over 2MB before we
 *      ever see the buffer (HTTP 413 surfaces cleanly).
 *   2. `fileFilter` rejects everything outside the JPG/PNG/WEBP
 *      whitelist by MIME — note that MIME comes from the multipart
 *      header so it's only the first gate.
 *   3. The service layer re-checks the MIME + magic-number / extension
 *      so a doctored multipart can't sneak an executable through.
 */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]).has(file.mimetype);
    if (!ok) return cb(new Error('Unsupported image type — use JPG, PNG, or WEBP'), false);
    cb(null, true);
  },
});

/**
 * Wrap any multer `.single(...)` middleware so its native errors
 * (`MulterError` for size limit + custom Error for MIME rejection)
 * translate to the correct HTTP status codes via the project's
 * standard response helper, instead of falling through to the
 * generic 500 handler.
 *
 *   LIMIT_FILE_SIZE → 413
 *   any other multer / filter error → 415
 */
function withErrorTranslation(uploadMiddleware) {
  return (req, res, next) => uploadMiddleware(req, res, (err) => {
    if (!err) return next();
    // Lazy-require to avoid a circular import at module load.
    const response = require('../utils/response.helper');
    if (err.code === 'LIMIT_FILE_SIZE') {
      return response.error(res, 'Image exceeds the 2MB limit', 413, { code: err.code });
    }
    return response.error(
      res,
      err.message || 'Unsupported image type — use JPG, PNG, or WEBP',
      415,
      { code: err.code || 'UNSUPPORTED_MEDIA_TYPE' }
    );
  });
}

/**
 * Ready-to-mount profile-image upload chain:
 *
 *   router.post('/profile-image', imageUploadSingle('image'), controller.upload);
 *
 * Translates multer errors before the controller is ever reached, so
 * the controller's `req.file` is either a valid image buffer or the
 * request has already been rejected with 413 / 415.
 */
function imageUploadSingle(fieldName = 'image') {
  return withErrorTranslation(imageUpload.single(fieldName));
}

module.exports = {
  resumeUpload,
  imageUpload,
  imageUploadSingle,
  withErrorTranslation,
  MAX_BYTES,
  IMAGE_MAX_BYTES,
};
