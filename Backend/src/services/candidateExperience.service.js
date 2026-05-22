'use strict';

/**
 * candidateExperience service
 * ---------------------------
 * Business rules for candidate work-history CRUD:
 *
 *   - Hard cap of 30 experiences per candidate (matches the skills cap).
 *   - `is_current=true` clears any other "current" flags on the same
 *     candidate so we never end up with two concurrent current roles.
 *   - Date sanity: if both start_date and end_date are present and
 *     end_date precedes start_date, return 422.
 *   - Each write recomputes `profile_strength` so the completion bar
 *     stays accurate without a separate API call.
 */

const repo = require('../repositories/candidateExperience.repository');
const candidateRepo = require('../repositories/candidate.repository');
const db = require('../config/database');
const AppError = require('../utils/AppError');

const MAX_EXPERIENCES = 30;

async function list(user_id) {
  return repo.listForUser(user_id);
}

async function create(user_id, payload) {
  validateDates(payload);
  const total = await repo.countForUser(user_id);
  if (total >= MAX_EXPERIENCES) {
    throw new AppError(`You can save at most ${MAX_EXPERIENCES} work experiences.`, 422);
  }
  if (payload.is_current) await clearCurrentFlag(user_id);
  const id = await repo.create(user_id, payload);
  await candidateRepo.recomputeProfileStrength(user_id);
  return repo.findOwned(user_id, id);
}

async function update(user_id, id, payload) {
  const existing = await repo.findOwned(user_id, id);
  if (!existing) throw new AppError('Experience not found', 404);

  // Validate against the MERGED record so partial updates can't break
  // date ordering (e.g. patching start_date past the existing end_date).
  validateDates({ ...existing, ...payload });

  if (payload.is_current) await clearCurrentFlag(user_id, id);
  const affected = await repo.update(user_id, id, payload);
  if (!affected) throw new AppError('Experience not found', 404);
  await candidateRepo.recomputeProfileStrength(user_id);
  return repo.findOwned(user_id, id);
}

async function remove(user_id, id) {
  const ok = await repo.remove(user_id, id);
  if (!ok) throw new AppError('Experience not found', 404);
  await candidateRepo.recomputeProfileStrength(user_id);
  return true;
}

/**
 * Validate that end_date is on/after start_date.
 *
 * BUG FIX (May 2026): the previous implementation compared the
 * values via `String(...)`, which for Date objects produces text
 * like `"Sat Dec 01 2007 00:00:00 GMT+0000"`. Lexicographic
 * comparison of those strings only matched chronological order
 * when both dates happened to share a day-of-week / month prefix.
 * Real-world cases like `start=2005-01-01, end=2007-12-01` would
 * fire `end < start` incorrectly because `"Sat Dec" < "Sat Jan"`
 * (`D` < `J` in ASCII).
 *
 * Fix: coerce both to `Date` and compare via `getTime()`. Works
 * regardless of whether Joi handed us a `Date` object (default)
 * or a string (manual call paths from tests).
 */
function validateDates(p) {
  if (p.start_date && p.end_date && !p.is_current) {
    const startMs = new Date(p.start_date).getTime();
    const endMs = new Date(p.end_date).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
      throw new AppError('End date cannot be before start date.', 422);
    }
  }
}

/** Clear `is_current` on every other row so only one stays current. */
async function clearCurrentFlag(user_id, except_id = null) {
  const params = [user_id];
  let sql = `UPDATE candidate_experiences SET is_current = 0 WHERE candidate_user_id = ?`;
  if (except_id != null) { sql += ' AND id <> ?'; params.push(except_id); }
  await db.getPool().execute(sql, params);
}

module.exports = { list, create, update, remove };
