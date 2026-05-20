'use strict';

/**
 * Profile image service
 * ---------------------
 * Persists candidate profile images via the shared storage abstraction.
 * Files land under `Backend/storage/profile-images/<random>.<ext>`.
 * Callers receive a short-lived signed URL — the actual storage path
 * is never exposed.
 *
 * Wire-up:
 *   - upload   POST /candidates/profile-image (multipart, field `image`)
 *   - delete   DELETE /candidates/profile-image
 *
 * Database:
 *   - `candidate_profiles.profile_image`  stores the storage path
 *   - `users.avatar_url`                 mirrors the signed URL (long
 *     TTL) so existing surfaces that already read avatar_url light
 *     up without code changes. We refresh this on every upload.
 *
 * Migration to S3 / R2 later: swap storage.service internals; this
 * file does not change.
 */

const fileType = null; // intentionally null — we don't pull in file-type
const path = require('node:path');
const db = require('../config/database');
const storage = require('./storage.service');
const candidateRepo = require('../repositories/candidate.repository');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const BUCKET = 'profile-images';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7d — long enough for cache freshness, short enough to rotate

/**
 * Magic-number sniff — light defence so a renamed `.exe` masquerading
 * as `image/jpeg` is rejected before it hits disk. We check the first
 * few bytes against known image signatures.
 *
 *   JPEG : FF D8 FF
 *   PNG  : 89 50 4E 47 0D 0A 1A 0A
 *   WEBP : 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)
 */
function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/**
 * Save a fresh image for the candidate. Replaces any prior one
 * (the old file is soft-deleted via storage.remove, never hard-
 * deleted, so accidental overwrites are recoverable).
 *
 * @param {number} user_id
 * @param {Express.Multer.File} file  - multer in-memory file
 * @returns {{ profile_image: string, image_url: string }}
 */
async function uploadForUser(user_id, file) {
  if (!file || !file.buffer) throw new AppError('No file uploaded — attach an image as `image`', 400);
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError('Unsupported image type — use JPG, PNG, or WEBP', 415);
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('Image exceeds the 2MB limit', 413);
  }
  // Extension whitelist (multer keeps the client-supplied name)
  const ext = String(path.extname(file.originalname || '')).toLowerCase();
  if (ext && !ALLOWED_EXT.has(ext)) {
    throw new AppError('Unsupported image extension — use .jpg, .png, or .webp', 415);
  }
  // Magic-number check — rejects executables disguised as images
  const sniffed = sniffImage(file.buffer);
  if (!sniffed) {
    throw new AppError('File does not look like a valid image', 415);
  }

  // Soft-remove any prior image (best-effort; never blocks the new upload)
  const existing = await candidateRepo.findProfileByUserId(user_id);
  const prior = existing?.profile_image || null;

  const saved = await storage.save({
    bucket: BUCKET,
    originalName: file.originalname,
    mimeType: sniffed,
    buffer: file.buffer,
  });

  await candidateRepo.upsertProfile(user_id, { profile_image: saved.storage_path });
  const url = storage.signUrl(saved.storage_path, URL_TTL_SECONDS);
  await db.getPool().execute('UPDATE users SET avatar_url = ? WHERE id = ?', [url, user_id]);
  await candidateRepo.recomputeProfileStrength(user_id);

  if (prior) {
    try { await storage.remove(prior); }
    catch (err) { logger.warn('profileImage.upload: failed to clean prior file', { user_id, error: err.message }); }
  }
  return { profile_image: saved.storage_path, image_url: url };
}

/**
 * Remove the candidate's profile image. Returns the now-empty
 * profile shape so the frontend can refresh in-place.
 */
async function removeForUser(user_id) {
  const profile = await candidateRepo.findProfileByUserId(user_id);
  if (!profile || !profile.profile_image) {
    throw new AppError('No profile image to remove', 404);
  }
  const prior = profile.profile_image;
  await candidateRepo.upsertProfile(user_id, { profile_image: null });
  await db.getPool().execute('UPDATE users SET avatar_url = NULL WHERE id = ?', [user_id]);
  await candidateRepo.recomputeProfileStrength(user_id);
  try { await storage.remove(prior); }
  catch (err) { logger.warn('profileImage.remove: storage cleanup failed', { user_id, error: err.message }); }
  return { profile_image: null, image_url: null };
}

/**
 * Return a fresh signed URL for the candidate's image (or null when
 * none exists). Called by every read path so the URL doesn't rot.
 */
function signedUrlFor(profile_image_path) {
  if (!profile_image_path) return null;
  return storage.signUrl(profile_image_path, URL_TTL_SECONDS);
}

module.exports = {
  uploadForUser,
  removeForUser,
  signedUrlFor,
  BUCKET,
  MAX_BYTES,
  ALLOWED_MIME,
  URL_TTL_SECONDS,
};
