'use strict';

/**
 * Skill controller
 * ----------------
 * HTTP boundary for the public skill catalogue and the public-by-id
 * candidate skill view. Authenticated mutations (POST add, DELETE
 * remove) live in `candidate.controller` so they stay co-located
 * with the other candidate-only flows.
 *
 *   GET  /skills?search=&limit=         catalogue search
 *   GET  /skills/categories[?meta=1]    grouped or flat categories
 *   GET  /candidates/:id/skills         single candidate's public skills
 */

const skillService = require('../services/skill.service');
const candidateRepo = require('../repositories/candidate.repository');
const response = require('../utils/response.helper');
const AppError = require('../utils/AppError');

/** GET /skills?search=&limit= */
exports.search = async (req, res) => {
  const data = await skillService.searchCatalogue({
    q: req.query.search,
    limit: req.query.limit,
  });
  return response.success(res, { records: data }, 'Skills returned');
};

/**
 * GET /skills/categories
 * Default returns the grouped catalogue (categories with their
 * skills nested). Pass `?meta=1` to get the lightweight category
 * name + count list used by sidebar pickers.
 */
exports.categories = async (req, res) => {
  if (String(req.query.meta || '').toLowerCase() === '1' || req.query.meta === 'true') {
    const list = await skillService.listCategories();
    return response.success(res, { records: list }, 'Skill categories returned');
  }
  const grouped = await skillService.groupedCatalogue();
  return response.success(res, { records: grouped }, 'Skill categories returned');
};

/**
 * GET /candidates/:id/skills
 * Public read — returns whatever skills the candidate has marked
 * public. Returns 404 if the user does not exist or their profile
 * is not public.
 */
exports.candidateSkills = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw new AppError('Invalid candidate id', 422);
  // The public candidate-detail repo already gates on
  // `is_public = 1`; we use that gate here so a private profile's
  // skills aren't exposed.
  const candidate = await candidateRepo.getPublicCandidate(id);
  if (!candidate) throw new AppError('Candidate not found', 404);
  return response.success(res, {
    candidate_id: id,
    skills: candidate.skills || [],
  }, 'Candidate skills returned');
};
