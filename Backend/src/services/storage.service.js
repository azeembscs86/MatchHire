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

/**
 * Build a signed download URL valid for `ttlSeconds`.
 *
 * Returns an ABSOLUTE URL anchored on `config.apiPublicUrl` so the
 * browser can resolve it from any origin (Vite at :5173 calling an
 * API at :3500, or a CDN-served SPA hitting a separate api host).
 *
 *   storage path : resumes/abc.pdf
 *   returned URL : http://localhost:3500/api/v1/files/resumes/abc.pdf?exp=...&sig=...
 *
 * The HMAC signature covers `storagePath:exp`, NOT the host, so
 * prepending an absolute origin doesn't invalidate the signature
 * verification in `verifySignedUrl()`.
 */
/**
 * @param {string} storagePath
 * @param {number} [ttlSeconds=600]
 * @param {object} [opts]
 * @param {string} [opts.attachmentName]   When set, the signed URL
 *   carries a `dl=<name>` query param the file route honours by
 *   serving the response with `Content-Disposition: attachment;
 *   filename="<name>"`. The name is part of the HMAC payload so a
 *   tampered `dl=` invalidates the signature.
 */
function signUrl(storagePath, ttlSeconds = 600, opts = {}) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const attachmentName = opts?.attachmentName || null;
  // Old payload format (no dl) stays the canonical form so previously
  // issued URLs still verify after this change. When an attachment
  // name is supplied we extend the payload with `:dl=<name>`.
  const payload = attachmentName
    ? `${storagePath}:${exp}:dl=${attachmentName}`
    : `${storagePath}:${exp}`;
  const sig = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('hex');
  const posix = storagePath.split(path.sep).join('/');
  const base = `${config.apiPublicUrl}${config.apiPrefix}/files/${posix}?exp=${exp}&sig=${sig}`;
  return attachmentName ? `${base}&dl=${encodeURIComponent(attachmentName)}` : base;
}

/** Reject expired, missing, or tampered signatures. */
function verifySignedUrl(storagePath, exp, sig, dl = null) {
  if (!exp || !sig) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const payload = dl ? `${storagePath}:${exp}:dl=${dl}` : `${storagePath}:${exp}`;
  const expected = crypto.createHmac('sha256', SIGNING_KEY).update(payload).digest('hex');
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
