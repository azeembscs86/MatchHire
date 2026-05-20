'use strict';

/**
 * Skill service
 * -------------
 * Single source of truth for the skill catalogue + a candidate's
 * skill set. Used by:
 *
 *   - GET  /skills                  catalogue search (auth-optional)
 *   - GET  /skills/categories       grouped catalogue
 *   - POST /candidates/skills       set/append candidate skills (auth)
 *   - GET  /candidates/:id/skills   public profile view (no auth)
 *   - DELETE /candidates/skills/:skill_id   single removal (auth)
 *
 * Why a dedicated service instead of stuffing this into
 * candidate.service:
 *   - The skill catalogue itself (search, group, find-by-name) is a
 *     reference-data concern that the public surface, search, and
 *     resume-parser all share.
 *   - Free-text "custom skill" handling needs to ensure-or-create
 *     a skill row before linking it to the candidate. Putting that
 *     resolution logic in one place keeps callers thin.
 *
 * Validation thresholds (per product spec):
 *   - MIN_SKILLS_REQUIRED enforced ONLY when explicitly setting the
 *     full set (`setSkillsForCandidate`). Append/remove can take the
 *     count below 3 — we don't trap users into an unrescuable state.
 *   - MAX_SKILLS_ALLOWED enforced on every write path.
 *   - MAX_SKILL_NAME_LEN enforced on every custom-skill creation.
 *
 * Notes:
 *   - Duplicate prevention is enforced by the DB
 *     (`UNIQUE(candidate_user_id, skill_id)` on candidate_skills).
 *   - Profile-strength recomputation runs after every write so the
 *     dashboard widgets stay accurate.
 */

const metaRepo = require('../repositories/meta.repository');
const candidateRepo = require('../repositories/candidate.repository');
const cache = require('../cache/cache.helper');
const AppError = require('../utils/AppError');

const MIN_SKILLS_REQUIRED = 3;
const MAX_SKILLS_ALLOWED = 30;
const MAX_SKILL_NAME_LEN = 80;

/* ============================================================================
 * Catalogue (public reads)
 * ========================================================================== */

/**
 * `GET /skills?search=...&limit=...`
 * Cached for short queries (no/empty `q`) — fuzzy searches skip the
 * cache so the user always sees fresh hits while typing.
 */
async function searchCatalogue({ q, limit }) {
  const trimmed = String(q || '').trim();
  if (!trimmed) {
    return cache.rememberCache(
      `skills:list:limit:${Number(limit) || 50}`,
      cache.TTL.SKILLS,
      () => metaRepo.searchSkills('', limit || 50)
    );
  }
  return metaRepo.searchSkills(trimmed, limit || 20);
}

/** `GET /skills/categories` — full grouped catalogue, cached. */
async function groupedCatalogue() {
  return cache.rememberCache(
    'skills:grouped',
    cache.TTL.SKILLS,
    () => metaRepo.listSkillsGroupedByCategory()
  );
}

/** `GET /skills/categories?meta=1` — flat category names + counts. */
async function listCategories() {
  return metaRepo.listSkillCategories();
}

/* ============================================================================
 * Custom-skill resolution
 * ========================================================================== */

/**
 * Resolve a single client-supplied entry into a `{ skill_id, ... }`
 * row that can be passed into the repository. Accepts either
 * `{ skill_id }` (preferred, from the autocomplete picker) or
 * `{ name }` (custom skill the user typed). Free-text entries are
 * matched case-insensitively to existing rows first; only true
 * unknowns are created.
 */
async function resolveSkillEntry(entry) {
  if (entry == null) return null;
  // Form: { skill_id, proficiency?, years_experience? }
  if (entry.skill_id) {
    return {
      skill_id: Number(entry.skill_id),
      proficiency: entry.proficiency || 'intermediate',
      years_experience: Number(entry.years_experience) || 0,
    };
  }
  // Form: { name, proficiency?, years_experience? }
  if (entry.name) {
    const name = String(entry.name).trim();
    if (!name) return null;
    if (name.length > MAX_SKILL_NAME_LEN) {
      throw new AppError(`Skill name must be at most ${MAX_SKILL_NAME_LEN} characters`, 422);
    }
    const existing = await metaRepo.findSkillByName(name);
    const row = existing || await metaRepo.createOrFindSkill({ name });
    return {
      skill_id: row.id,
      proficiency: entry.proficiency || 'intermediate',
      years_experience: Number(entry.years_experience) || 0,
    };
  }
  // Shorthand: a bare string is treated as `{ name }`.
  if (typeof entry === 'string') {
    return resolveSkillEntry({ name: entry });
  }
  return null;
}

/**
 * Resolve + de-duplicate a payload array. Duplicate `skill_id`s
 * (which the UNIQUE constraint would catch anyway) are collapsed
 * client-side so the count check below is meaningful.
 */
async function resolveBatch(entries = []) {
  const resolved = [];
  const seen = new Set();
  for (const e of entries) {
    const r = await resolveSkillEntry(e);
    if (!r) continue;
    if (seen.has(r.skill_id)) continue;
    seen.add(r.skill_id);
    resolved.push(r);
  }
  return resolved;
}

/* ============================================================================
 * Candidate writes
 * ========================================================================== */

/**
 * Replace the candidate's full skill set (legacy POST shape, but
 * now supports free-text entries alongside skill_id). Enforces
 * min/max bounds.
 */
async function setSkillsForCandidate(user_id, entries = []) {
  if (!Array.isArray(entries)) throw new AppError('skills must be an array', 422);
  if (entries.length < MIN_SKILLS_REQUIRED) {
    throw new AppError(`At least ${MIN_SKILLS_REQUIRED} skills are required`, 422);
  }
  if (entries.length > MAX_SKILLS_ALLOWED) {
    throw new AppError(`A maximum of ${MAX_SKILLS_ALLOWED} skills can be saved`, 422);
  }
  const resolved = await resolveBatch(entries);
  if (resolved.length < MIN_SKILLS_REQUIRED) {
    throw new AppError(`At least ${MIN_SKILLS_REQUIRED} unique skills are required`, 422);
  }
  await candidateRepo.replaceSkills(user_id, resolved);
  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id));
  await cache.deleteByPattern(cache.Patterns.candidatesList);
  return candidateRepo.listSkills(user_id);
}

/**
 * Append skills without disturbing existing ones. Used by the
 * "Add custom" path on the SkillsPicker so a single-typed skill can
 * land without rebuilding the whole array.
 */
async function addSkillsForCandidate(user_id, entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new AppError('At least one skill is required', 422);
  }
  const existing = await candidateRepo.countSkills(user_id);
  if (existing + entries.length > MAX_SKILLS_ALLOWED) {
    throw new AppError(
      `You already have ${existing} skills - adding ${entries.length} would exceed the ${MAX_SKILLS_ALLOWED}-skill limit`,
      422
    );
  }
  const resolved = await resolveBatch(entries);
  await candidateRepo.addSkills(user_id, resolved);
  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id));
  return candidateRepo.listSkills(user_id);
}

/** Single-skill removal. Returns the updated list. */
async function removeSkillForCandidate(user_id, skill_id) {
  if (!Number.isFinite(Number(skill_id))) {
    throw new AppError('skill_id must be a number', 422);
  }
  const removed = await candidateRepo.removeSkill(user_id, Number(skill_id));
  if (!removed) throw new AppError('Skill not found on this profile', 404);
  await candidateRepo.recomputeProfileStrength(user_id);
  await cache.deleteCache(cache.Keys.candidateDetail(user_id));
  return candidateRepo.listSkills(user_id);
}

/* ============================================================================
 * Candidate reads
 * ========================================================================== */

/** List one candidate's skills with proficiency + years_experience. */
function listForCandidate(user_id) {
  return candidateRepo.listSkills(user_id);
}

module.exports = {
  MIN_SKILLS_REQUIRED,
  MAX_SKILLS_ALLOWED,
  MAX_SKILL_NAME_LEN,
  searchCatalogue,
  groupedCatalogue,
  listCategories,
  resolveSkillEntry,
  resolveBatch,
  setSkillsForCandidate,
  addSkillsForCandidate,
  removeSkillForCandidate,
  listForCandidate,
};
