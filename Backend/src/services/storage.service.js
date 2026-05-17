'use strict';

/**
 * Storage service
 * ---------------
 * Local-disk file storage with HMAC-signed download URLs. Files live
 * under `Backend/storage/<bucket>/<filename>`; callers only see a
 * short-lived signed URL like:
 *
 *   /api/v1/files/<bucket>/<filename>?exp=...&sig=...
 *
 * That URL is verified by `verifySignedUrl()` in this same module, so
 * the actual storage path is never exposed and signatures can't be
 * forged without `JWT_SECRET`.
 *
 * Migrating to S3 / R2 later is a one-file swap - call sites only use
 * `save()`, `read()`, `signUrl()`, `remove()`.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config/env');
const logger = require('../utils/logger');

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
const SIGNING_KEY = config.jwt.secret; // reuse the long random secret

/** Make sure the bucket directory exists. */
async function ensureBucket(bucket) {
  const dir = path.join(STORAGE_ROOT, bucket);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Persist a buffer under `bucket/<random>.<ext>`. Returns the metadata
 * the caller should store alongside the row (filename + relative path).
 */
async function save({ bucket, originalName, mimeType, buffer }) {
  if (!buffer || !buffer.length) throw new Error('save() received empty buffer');
  const dir = await ensureBucket(bucket);
  const ext = path.extname(originalName || '').slice(0, 8).toLowerCase() || '';
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const absPath = path.join(dir, filename);
  await fsp.writeFile(absPath, buffer, { mode: 0o600 });
  return {
    filename,
    storage_path: path.join(bucket, filename),
    size_bytes: buffer.length,
    mime_type: mimeType,
    original_name: originalName,
  };
}

/** Read a stored file back into a Buffer (used by the parse step). */
async function read(storagePath) {
  const abs = path.join(STORAGE_ROOT, storagePath);
  if (!abs.startsWith(STORAGE_ROOT)) throw new Error('path traversal blocked');
  return fsp.readFile(abs);
}

/** Soft-delete: rename to `.deleted` so we never lose files accidentally. */
async function remove(storagePath) {
  const abs = path.join(STORAGE_ROOT, storagePath);
  if (!abs.startsWith(STORAGE_ROOT)) return;
  try { await fsp.rename(abs, `${abs}.deleted-${Date.now()}`); }
  catch (err) { logger.warn('storage.remove failed', { error: err.message }); }
}

/** Build a `/files/<bucket>/<filename>?exp=...&sig=...` URL valid for `ttlSeconds`. */
function signUrl(storagePath, ttlSeconds = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', SIGNING_KEY)
    .update(`${storagePath}:${exp}`)
    .digest('hex');
  // storagePath uses POSIX separators in the URL; mount path is added by the route.
  const posix = storagePath.split(path.sep).join('/');
  return `${config.apiPrefix}/files/${posix}?exp=${exp}&sig=${sig}`;
}

/** Reject expired, missing, or tampered signatures. */
function verifySignedUrl(storagePath, exp, sig) {
  if (!exp || !sig) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const expected = crypto
    .createHmac('sha256', SIGNING_KEY)
    .update(`${storagePath}:${exp}`)
    .digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

/** Absolute path under the storage root - used by the download route. */
function absolutePath(storagePath) {
  const abs = path.join(STORAGE_ROOT, storagePath);
  if (!abs.startsWith(STORAGE_ROOT)) throw new Error('path traversal blocked');
  return abs;
}

function exists(storagePath) {
  return fs.existsSync(absolutePath(storagePath));
}

module.exports = {
  save,
  read,
  remove,
  signUrl,
  verifySignedUrl,
  absolutePath,
  exists,
  STORAGE_ROOT,
};
