'use strict';

/**
 * Candidate controller
 * --------------------
 * HTTP boundary for the `/api/v1/candidates` namespace. Controllers only
 * translate between the request and the service layer; all business rules
 * live in `services/candidate.service.js`.
 *
 * Project rule: every authenticated candidate endpoint is exposed as POST,
 * so pagination/filters arrive in `req.body` rather than `req.query`.
 */

const service = require('../services/candidate.service');
const profileMatchService = require('../services/profileMatch.service');
const skillService = require('../services/skill.service');
const profileImageService = require('../services/profileImage.service');
const reviewProfileService = require('../services/reviewProfile.service');
const experienceService = require('../services/candidateExperience.service');
const onboardingService = require('../services/onboarding.service');
const candidateRepo = require('../repositories/candidate.repository');
const response = require('../utils/response.helper');
const { buildPagination } = require('../utils/pagination');

/** GET-style read of the current candidate's profile (POST per project rule). */
exports.getProfile = async (req, res) => {
  const data = await service.getProfile(req.user.id);
  return response.success(res, data, 'Profile fetched successfully');
};

/** Patch the candidate profile + linked user fields. */
exports.updateProfile = async (req, res) => {
  const data = await service.updateProfile(req.user.id, req.body);
  return response.success(res, data, 'Profile updated successfully');
};

/**
 * POST /candidates/skills
 *
 * Two shapes supported:
 *   - `{ skills: [...], mode: 'set' }` (default) — replaces the
 *     entire skill set. Enforces the 3..30 bound.
 *   - `{ skills: [...], mode: 'add' }` — appends without disturbing
 *     existing skills. Useful for the "Add custom skill" path on
 *     the picker.
 *
 * Each entry can be either `{ skill_id, proficiency?, years_experience? }`
 * (autocomplete pick) or `{ name, proficiency?, years_experience? }`
 * (free-text custom skill — ensured-or-created in the catalogue).
 */
exports.updateSkills = async (req, res) => {
  const mode = (req.body?.mode || 'set').toLowerCase();
  const skills = req.body?.skills || [];
  const updated = mode === 'add'
    ? await skillService.addSkillsForCandidate(req.user.id, skills)
    : await skillService.setSkillsForCandidate(req.user.id, skills);
  return response.success(
    res,
    { skills: updated, mode },
    mode === 'add' ? 'Skills added' : 'Skills updated successfully'
  );
};

/**
 * DELETE /candidates/skills/:skill_id
 * Single-skill removal. The convention in this project for
 * authenticated APIs is POST-only, so this DELETE is registered
 * alongside a POST alias (see candidate.routes.js).
 */
exports.removeSkill = async (req, res) => {
  const skillId = Number(req.params.skill_id || req.params.skillId);
  const skills = await skillService.removeSkillForCandidate(req.user.id, skillId);
  return response.success(res, { skills }, 'Skill removed');
};

/** GET-equivalent: returns the authed candidate's current skill set. */
exports.listMySkills = async (req, res) => {
  const skills = await skillService.listForCandidate(req.user.id);
  return response.success(res, { skills }, 'Skills returned');
};

/**
 * POST /candidates/profile-image (multipart, field `image`)
 * Uploads or replaces the candidate's profile image. Returns the
 * relative storage path AND a fresh signed URL the frontend can
 * render immediately.
 */
exports.uploadProfileImage = async (req, res) => {
  const data = await profileImageService.uploadForUser(req.user.id, req.file);
  return response.success(res, data, 'Profile image uploaded');
};

/**
 * DELETE /candidates/profile-image
 * Removes the candidate's profile image. The underlying file is
 * soft-deleted on disk (renamed with a `.deleted-<ts>` suffix) so an
 * accidental click is recoverable by an admin.
 */
exports.deleteProfileImage = async (req, res) => {
  const data = await profileImageService.removeForUser(req.user.id);
  return response.success(res, data, 'Profile image removed');
};

/**
 * GET /candidates/profile-completion
 * Returns the per-section breakdown of the profile completion
 * score: { score: 0..100, sections: [...], totals: { earned, max } }.
 * The frontend renders the progress bar from `score` and per-section
 * hints from each `sections[].hint`.
 *
 * Note: this is a GET on an authenticated endpoint — a small,
 * explicit exception to the project's "POST-only when authed" rule,
 * matching the product spec verbatim.
 */
exports.profileCompletion = async (req, res) => {
  const data = await candidateRepo.computeCompletionBreakdown(req.user.id);
  return response.success(res, data, 'Profile completion returned');
};

/**
 * GET /candidates/review-profile
 * Composite read for the Review Profile page — user, profile,
 * image URL, skills, preferences, resume, parsed-resume preview,
 * completion breakdown, and a flat `missing` list for the empty-
 * state banner.
 */
exports.reviewProfile = async (req, res) => {
  const data = await reviewProfileService.build(req.user.id);
  return response.success(res, data, 'Review profile returned');
};

/** Upsert candidate job preferences (titles, locations, salary range, etc). */
exports.updatePreferences = async (req, res) => {
  const data = await service.updatePreferences(req.user.id, req.body);
  return response.success(res, data, 'Preferences saved');
};

/** Personalized job recommendations based on profile, skills, and preferences. */
exports.recommendedJobs = async (req, res) => {
  const limit = req.body?.limit || 10;
  const data = await service.recommendedJobs(req.user.id, limit);
  return response.list(res, data, null, 'Recommended jobs');
};

/** Add a job to the candidate's favorites list (idempotent). */
exports.addFavorite = async (req, res) => {
  const data = await service.addFavorite(req.user.id, Number(req.params.jobId));
  return response.created(res, data, 'Job favorited');
};

/** Remove a job from the candidate's favorites list. */
exports.removeFavorite = async (req, res) => {
  await service.removeFavorite(req.user.id, Number(req.params.jobId));
  return response.success(res, {}, 'Favorite removed');
};

/** Paginated list of the candidate's favorite jobs. */
exports.listFavorites = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listFavorites(req.user.id, { page, limit });
  return response.list(res, rows, buildPagination(page, limit, total), 'Favorites returned');
};

/** Submit a job application. Duplicate applications are rejected by the service. */
exports.applyToJob = async (req, res) => {
  const data = await service.applyToJob(req.user.id, Number(req.params.jobId), req.body);
  return response.created(res, data, 'Application submitted');
};

/** Paginated list of the candidate's own applications (optionally filtered by status). */
exports.listApplications = async (req, res) => {
  const page = req.body?.page || 1;
  const limit = req.body?.limit || 10;
  const { rows, total } = await service.listApplications(req.user.id, {
    page, limit, status: req.body?.status,
  });
  return response.list(res, rows, buildPagination(page, limit, total), 'Applications returned');
};

/** Aggregated dashboard stats (applications, interviews, favorites, strength). */
exports.dashboardStats = async (req, res) => {
  const data = await service.dashboardStats(req.user.id);
  return response.success(res, data, 'Dashboard stats returned');
};

/** POST /candidates/jobs/match - skill-based ranked recommendations. */
exports.matchJobs = async (req, res) => {
  const data = await service.matchJobs(req.user.id, req.body || {});
  return response.list(res, data.records, null, 'Ranked job matches');
};

/**
 * POST /candidates/profile-match
 *
 * Read-only diagnostic: profile completion percentage, missing fields,
 * recommended skills/titles, and AI-style profile + career suggestions.
 */
exports.profileMatch = async (req, res) => {
  const data = await profileMatchService.buildProfileMatch(req.user.id);
  return response.success(res, data, 'Profile match returned');
};

/** POST /candidates/applications/:jobId/validate-and-apply */
exports.validateAndApply = async (req, res) => {
  const data = await service.applyWithValidation(req.user.id, Number(req.params.jobId), req.body || {});
  if (!data.accepted) {
    return response.error(res, data.message, 422, data);
  }
  return response.created(res, data, 'Application submitted with match score');
};

/* ----------------------------------------------------------------
 * Work experience CRUD
 * ----------------------------------------------------------------
 * Backs the multi-row "Work experience" card on the Profile page.
 * Reuses the project's POST-only convention for authenticated
 * mutations; DELETE is registered for the remove path because the
 * Swagger spec already documented similar DELETEs for skills /
 * profile-image and the SPA's axios client speaks both.
 * ---------------------------------------------------------------- */

/** GET-equivalent: list the candidate's saved work experiences. */
exports.listExperiences = async (req, res) => {
  const experiences = await experienceService.list(req.user.id);
  return response.success(res, { experiences }, 'Experiences returned');
};

/** POST /candidates/experiences — append one new experience row. */
exports.createExperience = async (req, res) => {
  const experience = await experienceService.create(req.user.id, req.body || {});
  return response.created(res, { experience }, 'Experience added');
};

/** POST /candidates/experiences/:id — patch a single experience row. */
exports.updateExperience = async (req, res) => {
  const id = Number(req.params.id);
  const experience = await experienceService.update(req.user.id, id, req.body || {});
  return response.success(res, { experience }, 'Experience updated');
};

/** DELETE /candidates/experiences/:id — remove a single experience row. */
exports.removeExperience = async (req, res) => {
  const id = Number(req.params.id);
  await experienceService.remove(req.user.id, id);
  return response.success(res, {}, 'Experience removed');
};

/**
 * POST /candidates/profile/publish-state
 *
 * Toggles `candidate_profiles.is_public`. The UI sends `{ publish: true }`
 * for "Save & Publish" and `{ publish: false }` for "Save Draft".
 * Kept separate from /profile/update so the buttons don't have to
 * re-send the whole form to flip a single bit.
 */
exports.setPublishState = async (req, res) => {
  const publish = !!req.body?.publish;
  const data = await service.setPublishState(req.user.id, publish);
  return response.success(
    res,
    data,
    publish ? 'Profile published' : 'Profile saved as draft'
  );
};


/**
 * POST /candidates/onboarding/state
 *
 * Read the candidate's wizard state: current step index, total
 * steps, completion timestamp, profile_strength %, and the
 * per-section completion breakdown so the wizard's progress bar
 * + step-by-step "complete" indicators can render in one round-trip.
 */
exports.onboardingState = async (req, res) => {
  const data = await onboardingService.getState(req.user.id);
  return response.success(res, data, 'Onboarding state returned');
};

/**
 * POST /candidates/onboarding/advance
 *
 * Move the wizard to a new step (or mark complete on step 6).
 * Payload: { step: 0..6, complete?: boolean }.
 *
 * The wizard's per-step data is still saved through the dedicated
 * endpoints (/profile/update, /skills, /experiences/*, /preferences,
 * /resume/*); this endpoint only tracks WHICH step the user is on
 * so they can resume after closing the tab.
 */
exports.onboardingAdvance = async (req, res) => {
  const data = await onboardingService.advance(req.user.id, req.body || {});
  return response.success(
    res,
    data,
    req.body?.complete ? 'Onboarding completed' : 'Onboarding step saved'
  );
};

/**
 * POST /candidates/onboarding/reset
 *
 * Reset the wizard back to step 0 and clear the completion
 * timestamp. Used by the profile page's "Restart onboarding"
 * action and by tests.
 */
exports.onboardingReset = async (req, res) => {
  const data = await onboardingService.reset(req.user.id);
  return response.success(res, data, 'Onboarding reset');
};
