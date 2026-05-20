'use strict';

/**
 * Review-profile service
 * ----------------------
 * Composite read used by the SPA `/profile/review` page and the
 * `GET /candidates/review-profile` endpoint. Wraps everything the
 * Review screen needs into a single round-trip:
 *
 *   - user           id, name, email, phone, role, last_login_at
 *   - profile        candidate_profiles row (headline, summary, …)
 *   - profile_image  fresh signed URL (or null)
 *   - skills         the candidate's saved skill rows
 *   - preferences    desired_titles / preferred_locations / job_scope
 *   - resume         most recent resume metadata + parsed data preview
 *   - completion     per-section score + hints (from candidate.repo)
 *   - missing        flat list of "X is missing" copy for empty states
 *
 * Pure aggregator — every underlying read goes through the repository
 * layer, so no SQL lives here.
 */

const userRepo = require('../repositories/user.repository');
const candidateRepo = require('../repositories/candidate.repository');
const experienceRepo = require('../repositories/candidateExperience.repository');
const db = require('../config/database');
const profileImageService = require('./profileImage.service');

async function build(user_id) {
  const [user, profile, skills, preferences, completion, experiences] = await Promise.all([
    userRepo.findById(user_id),
    candidateRepo.findProfileByUserId(user_id),
    candidateRepo.listSkills(user_id),
    candidateRepo.getPreferences(user_id),
    candidateRepo.computeCompletionBreakdown(user_id),
    experienceRepo.listForUser(user_id),
  ]);

  // Latest resume (lightweight metadata — full parsed data only if the
  // candidate has clicked "confirm").
  const resume = await db.queryOne(
    `SELECT id, original_name, mime_type, size_bytes, parse_status, is_primary, uploaded_at
     FROM resumes
     WHERE candidate_user_id = ? AND deleted_at IS NULL
     ORDER BY uploaded_at DESC LIMIT 1`,
    [user_id]
  );

  // Parsed-resume preview (education + experience) for the Review page.
  // `languages` lives on `candidate_profiles`, not on resume_parsed_data,
  // so it's not selected here — the page reads it from `profile.languages`.
  const parsed = await db.queryOne(
    `SELECT education, experience, certifications
     FROM resume_parsed_data
     WHERE candidate_user_id = ? ORDER BY id DESC LIMIT 1`,
    [user_id]
  );

  // Always derive the URL from the storage path on read, so the source of
  // truth stays the `candidate_profiles.profile_image` column. The DB
  // mirror on `users.avatar_url` is just a denormalised convenience.
  const image_url = profileImageService.publicUrlFor(profile?.profile_image);

  // Flatten the per-section hints into a single list for the
  // "Missing sections" banner at the top of the Review page.
  const missing = (completion.sections || [])
    .filter((s) => !s.complete && s.hint)
    .map((s) => ({ key: s.key, label: s.label, hint: s.hint, percent: s.percent }));

  return {
    user: user ? {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar_url: user.avatar_url,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
    } : null,
    profile: profile ? {
      ...profile,
      profile_image_url: image_url,
    } : null,
    image_url,
    skills,
    preferences,
    // Normalised work history. The SPA renders this when present and
    // falls back to `parsed.experience` (the resume-extracted JSON)
    // only when the candidate hasn't added any entries yet.
    experiences,
    resume,
    parsed: parsed ? {
      education: safeJson(parsed.education),
      experience: safeJson(parsed.experience),
      certifications: safeJson(parsed.certifications),
    } : null,
    completion,
    missing,
  };
}

function safeJson(raw) {
  if (!raw) return null;
  if (Array.isArray(raw) || typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = { build };
