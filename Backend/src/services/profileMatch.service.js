'use strict';

/**
 * Profile-match service
 * ---------------------
 * Drives `POST /api/v1/candidates/profile-match`. Returns:
 *
 *   - profileCompletion       0..100 (re-uses candidate_profiles.profile_strength)
 *   - missingFields[]         human-friendly labels of fields not yet populated
 *   - recommendedSkills[]     skills the candidate's preferred categories
 *                             expect that they don't have yet
 *   - recommendedJobTitles[]  AI-derived job titles based on current skills
 *   - aiSuggestions{}         careerImprovement + profileImprovement strings
 *
 * Pure read — no writes. Safe to call from any candidate-authenticated path.
 */

const candidateRepo = require('../repositories/candidate.repository');
const jobRepo = require('../repositories/job.repository');
const db = require('../config/database');
const aiService = require('./ai.service');

const FIELD_LABELS = [
  ['headline', 'professional headline'],
  ['summary', 'short summary about yourself'],
  ['current_title', 'current job title'],
  ['years_experience', 'years of experience'],
  ['location', 'location'],
  ['country', 'country'],
  ['linkedin_url', 'LinkedIn URL'],
  ['portfolio_url', 'portfolio or website link'],
  ['resume_url', 'uploaded resume'],
  ['expected_salary_min', 'expected salary range'],
];

function missingProfileFields(profile = {}) {
  const out = [];
  for (const [key, label] of FIELD_LABELS) {
    if (!profile[key]) out.push({ field: key, label });
  }
  return out;
}

/**
 * Skills the candidate's preferred categories / current title hint at —
 * but the candidate hasn't added yet. Sampled from active jobs (which is
 * where real-world demand lives) so suggestions track the market.
 */
async function recommendedSkillsFor(userId, candidateSkills = []) {
  const have = new Set(candidateSkills.map((s) => String(s.name || s).toLowerCase()));
  // Look at the most recent open jobs that match the candidate's role
  // keyword (current_title or first preferred title); fall back to all
  // recent open jobs if none match.
  const profile = await candidateRepo.findProfileByUserId(userId);
  const prefs = await candidateRepo.getPreferences(userId);
  const titleHint = (profile?.current_title
    || (prefs?.desired_titles ? prefs.desired_titles.split(',')[0]?.trim() : ''))
    || '';

  let rows;
  if (titleHint) {
    rows = await db.query(
      `SELECT skills_tags FROM jobs
       WHERE status = 'open' AND admin_status = 'approved' AND deleted_at IS NULL
         AND title LIKE ?
       ORDER BY published_at DESC LIMIT 80`,
      [`%${titleHint}%`]
    );
  }
  if (!rows || rows.length < 20) {
    rows = await db.query(
      `SELECT skills_tags FROM jobs
       WHERE status = 'open' AND admin_status = 'approved' AND deleted_at IS NULL
       ORDER BY published_at DESC LIMIT 120`
    );
  }

  const tally = new Map();
  for (const row of rows) {
    const tags = String(row.skills_tags || '')
      .split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tags) {
      const k = t.toLowerCase();
      if (have.has(k)) continue;
      tally.set(t, (tally.get(t) || 0) + 1);
    }
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, demand: count }));
}

async function buildProfileMatch(userId) {
  const profile = await candidateRepo.findProfileByUserId(userId);
  const skills = await candidateRepo.listSkills(userId);
  const candidate = await jobRepo.loadCandidateContext(userId);
  const completion = Number(profile?.profile_strength || 0);

  const missingFields = missingProfileFields(profile || {});
  const recommendedSkills = await recommendedSkillsFor(userId, skills || []);
  const recommendedJobTitles = aiService.recommendedJobTitles(skills || [], profile?.current_title || null);

  // Use the top recommended-skill names as the "missing" input for the
  // career-improvement copy — those are the ones the market actually wants.
  const missingForCopy = recommendedSkills.slice(0, 3).map((s) => s.name);
  const aiSuggestions = {
    profileImprovement: aiService.profileImprovement(profile || {}, skills || []),
    careerImprovement: aiService.careerImprovement(candidate || profile || {}, missingForCopy),
    missingSkillSuggestion: aiService.missingSkillSuggestion(missingForCopy),
  };

  return {
    profileCompletion: completion,
    missingFields,
    skills: (skills || []).map((s) => ({ id: s.id, name: s.name, proficiency: s.proficiency })),
    recommendedSkills,
    recommendedJobTitles,
    aiSuggestions,
    profileStrengthBands: {
      weak: completion < 40,
      partial: completion >= 40 && completion < 70,
      strong: completion >= 70,
    },
  };
}

module.exports = {
  buildProfileMatch,
};
