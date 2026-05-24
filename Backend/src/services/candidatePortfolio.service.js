'use strict';

/**
 * candidatePortfolio service
 * --------------------------
 * Business layer for the universal "Work Portfolio & Achievements"
 * surface. Wraps the repository with:
 *
 *   - Per-item completeness scoring (0..100) recomputed on every
 *     write — drives the editor's strength meter without an extra
 *     round-trip.
 *   - Ownership enforcement: every mutation requires the caller's
 *     `user_id` and refuses to operate on someone else's row.
 *   - Visibility-aware reads for foreign viewers (employer or
 *     guest looking at a candidate profile).
 */

const repo = require('../repositories/candidatePortfolio.repository');
const AppError = require('../utils/AppError');

const ITEM_TYPES = [
  'project', 'achievement', 'certificate', 'work_sample', 'case_study',
  'training', 'research', 'field_experience', 'volunteer',
  'portfolio_link', 'publication', 'award',
];

const VISIBILITIES = ['public', 'companies_only', 'private'];

/**
 * Per-item completeness (0..100). Each populated field is worth a
 * fixed slice of the score, capped at 100. Drives the strength
 * meter the editor renders next to each card.
 *
 *   title                 15
 *   item_type             5   (always set; baseline)
 *   description           20
 *   role_responsibility   10
 *   impact                15
 *   skills_used >=1       10  (capped — a single skill scores it)
 *   tools_used  >=1       10
 *   external OR proof     10
 *   start_date            5
 *   visibility != null    +(always set; ignored from scoring)
 */
function scoreItem(item = {}) {
  let s = 0;
  if (item.title) s += 15;
  if (item.item_type) s += 5;
  if (item.description && String(item.description).trim().length >= 30) s += 20;
  if (item.role_responsibility) s += 10;
  if (item.impact) s += 15;
  if (Array.isArray(item.skills_used) ? item.skills_used.length > 0
      : (item.skills_used && String(item.skills_used).trim())) s += 10;
  if (Array.isArray(item.tools_used) ? item.tools_used.length > 0
      : (item.tools_used && String(item.tools_used).trim())) s += 10;
  if (item.external_link || item.proof_file_url) s += 10;
  if (item.start_date) s += 5;
  return Math.min(100, s);
}

function ensureValidEnum(value, set, label) {
  if (value == null) return;
  if (!set.includes(String(value))) {
    throw new AppError(`${label} must be one of: ${set.join(', ')}`, 400);
  }
}

function normaliseList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * List the candidate's own portfolio (editor view — all rows
 * regardless of visibility).
 */
async function listMine(user_id) {
  const records = await repo.listForUser(user_id);
  const total = records.length;
  const avgScore = total
    ? Math.round(records.reduce((s, r) => s + Number(r.completeness_score || 0), 0) / total)
    : 0;
  return {
    records,
    total,
    portfolio_strength: avgScore,
  };
}

/**
 * Visibility-filtered list for a foreign viewer (a company
 * looking at a candidate profile). `viewer` carries the
 * authenticated viewer's role; `selfView` is true when the
 * candidate is looking at their own profile.
 */
async function listForViewer(candidate_user_id, { viewer = null, selfView = false } = {}) {
  return repo.listForViewer(candidate_user_id, {
    viewerRole: viewer?.role || null,
    selfView,
  });
}

async function create(user_id, payload = {}) {
  if (!payload.title || String(payload.title).trim().length < 2) {
    throw new AppError('Title is required.', 400);
  }
  ensureValidEnum(payload.item_type, ITEM_TYPES, 'item_type');
  ensureValidEnum(payload.visibility, VISIBILITIES, 'visibility');

  const normalised = {
    ...payload,
    title: String(payload.title).trim().slice(0, 200),
    skills_used: normaliseList(payload.skills_used),
    tools_used: normaliseList(payload.tools_used),
  };
  normalised.completeness_score = scoreItem(normalised);
  const id = await repo.create(user_id, normalised);
  return repo.findOwned(user_id, id);
}

async function update(user_id, id, payload = {}) {
  const existing = await repo.findOwned(user_id, id);
  if (!existing) throw new AppError('Portfolio item not found.', 404);
  ensureValidEnum(payload.item_type, ITEM_TYPES, 'item_type');
  ensureValidEnum(payload.visibility, VISIBILITIES, 'visibility');

  const merged = { ...existing, ...payload };
  if ('skills_used' in payload) merged.skills_used = normaliseList(payload.skills_used);
  if ('tools_used' in payload) merged.tools_used = normaliseList(payload.tools_used);
  merged.completeness_score = scoreItem(merged);

  const patch = { ...payload };
  if ('skills_used' in payload) patch.skills_used = merged.skills_used;
  if ('tools_used' in payload) patch.tools_used = merged.tools_used;
  patch.completeness_score = merged.completeness_score;

  await repo.update(user_id, Number(id), patch);
  return repo.findOwned(user_id, Number(id));
}

async function remove(user_id, id) {
  const ok = await repo.softDelete(user_id, Number(id));
  if (!ok) throw new AppError('Portfolio item not found.', 404);
  return { deleted: true };
}

/** Snapshot for the profile-completion calculator. */
async function countForUser(user_id) {
  return repo.countForUser(user_id);
}

module.exports = {
  ITEM_TYPES,
  VISIBILITIES,
  scoreItem,
  listMine,
  listForViewer,
  create,
  update,
  remove,
  countForUser,
};
