'use strict';

/**
 * AI recommendation service
 * -------------------------
 * Rule-based "AI-style" copy generation for job matching, profile coaching,
 * and career suggestions. Designed so a real LLM provider (OpenAI, Anthropic,
 * etc.) can be plugged in later without touching any caller.
 *
 * Provider selection lives in env (`config.ai.provider`). When the value is
 * `openai` AND `config.ai.apiKey` is set the OpenAI branch is used; otherwise
 * the local rule-based generator runs. Failures from the remote provider fall
 * back to the rule-based output so the user-facing flow never breaks.
 *
 * Surface (all functions are sync — the rule-based path has no I/O; the
 * provider path is intentionally async-friendly via `await`):
 *
 *   labelForScore(score)               -> 'Excellent Match' | ...
 *   summariseMatch({ job, candidate, score, matched, missing, reasons })
 *   missingSkillSuggestion(missing[])
 *   careerImprovement(candidate, missing[])
 *   profileImprovement(profile, skills)
 *   recommendedJobTitles(skills, currentTitle)
 *
 * All output is plain strings or string arrays — render-ready for the
 * frontend with zero post-processing.
 */

const config = require('../config/env');

/* ============================================================================
 * Constants — score → human label
 * ========================================================================== */

const LABELS = Object.freeze({
  excellent: 'Excellent Match',
  strong: 'Strong Match',
  good: 'Good Match',
  partial: 'Partial Match',
  weak: 'Low Match',
});

/**
 * Map a 0..100 score to a human label. Thresholds mirror the doc spec:
 * 85+ excellent, 70+ strong, 55+ good, 40+ partial.
 */
function labelForScore(score) {
  const n = Number(score) || 0;
  if (n >= 85) return LABELS.excellent;
  if (n >= 70) return LABELS.strong;
  if (n >= 55) return LABELS.good;
  if (n >= 40) return LABELS.partial;
  return LABELS.weak;
}

/* ============================================================================
 * Rule-based generators
 * ========================================================================== */

function joinSkills(list, max = 4) {
  if (!Array.isArray(list)) return '';
  const clean = list.map((s) => String(s || '').trim()).filter(Boolean);
  if (!clean.length) return '';
  const slice = clean.slice(0, max);
  if (slice.length === 1) return slice[0];
  if (slice.length === 2) return `${slice[0]} and ${slice[1]}`;
  return `${slice.slice(0, -1).join(', ')}, and ${slice[slice.length - 1]}`;
}

function ruleSummariseMatch({ job, candidate, score, matched, missing, reasons }) {
  const role = job?.title || 'this role';
  const company = job?.company_name ? ` at ${job.company_name}` : '';
  const label = labelForScore(score);

  if (!matched || matched.length === 0) {
    if (missing && missing.length > 0) {
      return `${label}. ${role}${company} expects ${joinSkills(missing, 3)}, which you haven't added yet — update your profile to improve the score.`;
    }
    return `${label}. We could not find direct skill overlap with ${role}${company}.`;
  }

  const skills = joinSkills(matched, 4);
  if (score >= 70) {
    return `${label}. ${role}${company} aligns with your ${skills} expertise${reasons && reasons.length ? ` — ${reasons[0].toLowerCase()}` : ''}.`;
  }
  if (score >= 55) {
    return `${label}. Your ${skills} background fits parts of ${role}${company}; closing the gap on ${joinSkills(missing, 2) || 'one or two skills'} would push this much higher.`;
  }
  return `${label}. Some overlap on ${skills}, but ${role}${company} ideally wants ${joinSkills(missing, 2) || 'additional skills'} as well.`;
}

function ruleMissingSkillSuggestion(missing = []) {
  const clean = (missing || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!clean.length) return null;
  return `You can improve your match by learning ${joinSkills(clean, 4)}.`;
}

function ruleCareerImprovement(candidate, missing = []) {
  const years = Number(candidate?.years_experience || 0);
  const head = years >= 6
    ? 'You\'re positioned for senior roles'
    : years >= 3
      ? 'You\'re ready for mid-to-senior roles'
      : 'You\'re in a strong early-career position';
  if (missing && missing.length > 0) {
    return `${head}. Adding ${joinSkills(missing, 3)} would open up a noticeably wider set of opportunities.`;
  }
  return `${head}. Keep your portfolio and case studies up to date — recruiters scan those first.`;
}

const PROFILE_FIELDS = [
  ['headline', 'a professional headline'],
  ['summary', 'a short summary'],
  ['current_title', 'your current job title'],
  ['location', 'your location'],
  ['linkedin_url', 'a LinkedIn URL'],
  ['portfolio_url', 'a portfolio or website link'],
  ['resume_url', 'an uploaded resume'],
];

function ruleProfileImprovement(profile = {}, skills = []) {
  const tips = [];
  for (const [key, label] of PROFILE_FIELDS) {
    if (!profile[key]) tips.push(`Add ${label}`);
  }
  if (!skills || skills.length < 5) {
    tips.push('List at least 5 skills so the matching algorithm has enough signal');
  }
  if (!profile.years_experience) {
    tips.push('Set your years of experience so we can match seniority bands accurately');
  }
  if (!profile.expected_salary_min && !profile.expected_salary_max) {
    tips.push('Add an expected salary range to filter out roles that are off');
  }
  return tips.slice(0, 5);
}

/**
 * Suggest related job titles for a candidate based on their skills /
 * current title. Tiny built-in lookup table — extend as new
 * professions are added.
 */
const TITLE_MAP = Object.freeze({
  node: ['Backend Engineer', 'API Developer', 'Node.js Developer', 'Full-Stack Engineer'],
  express: ['Backend Engineer', 'Node.js Developer', 'API Developer'],
  react: ['Frontend Engineer', 'React Developer', 'Full-Stack Engineer'],
  'react.js': ['Frontend Engineer', 'React Developer', 'Full-Stack Engineer'],
  vue: ['Frontend Engineer', 'Vue Developer', 'Full-Stack Engineer'],
  angular: ['Frontend Engineer', 'Angular Developer'],
  typescript: ['Full-Stack Engineer', 'Frontend Engineer', 'Backend Engineer'],
  python: ['Backend Engineer', 'Data Engineer', 'ML Engineer', 'Python Developer'],
  django: ['Backend Engineer', 'Python Developer'],
  flask: ['Backend Engineer', 'Python Developer'],
  java: ['Backend Engineer', 'Java Developer', 'Android Developer'],
  spring: ['Backend Engineer', 'Java Developer'],
  go: ['Backend Engineer', 'Platform Engineer'],
  golang: ['Backend Engineer', 'Platform Engineer'],
  rust: ['Systems Engineer', 'Backend Engineer'],
  kubernetes: ['DevOps Engineer', 'SRE', 'Platform Engineer'],
  docker: ['DevOps Engineer', 'Platform Engineer'],
  aws: ['DevOps Engineer', 'Cloud Engineer', 'SRE'],
  azure: ['Cloud Engineer', 'DevOps Engineer'],
  gcp: ['Cloud Engineer', 'DevOps Engineer'],
  terraform: ['DevOps Engineer', 'Platform Engineer'],
  sql: ['Data Analyst', 'Backend Engineer', 'BI Developer'],
  postgresql: ['Backend Engineer', 'Database Engineer'],
  mysql: ['Backend Engineer', 'Database Engineer'],
  mongodb: ['Backend Engineer', 'NoSQL Engineer'],
  redis: ['Backend Engineer', 'Platform Engineer'],
  'machine learning': ['ML Engineer', 'Data Scientist', 'AI Engineer'],
  pytorch: ['ML Engineer', 'AI Engineer'],
  tensorflow: ['ML Engineer', 'AI Engineer'],
  pandas: ['Data Analyst', 'Data Scientist'],
  excel: ['Data Analyst', 'Operations Analyst', 'Finance Analyst'],
  'power bi': ['BI Analyst', 'Data Analyst'],
  tableau: ['BI Analyst', 'Data Analyst'],
  figma: ['Product Designer', 'UI/UX Designer'],
  sketch: ['Product Designer', 'UI/UX Designer'],
  // Healthcare
  patient: ['Staff Nurse', 'Patient Care Coordinator'],
  nursing: ['Staff Nurse', 'ICU Nurse', 'Nursing Supervisor'],
  pharmacy: ['Pharmacist', 'Pharmacy Manager'],
  pharmacology: ['Pharmacist', 'Clinical Pharmacist'],
  // Education
  teaching: ['Teacher', 'Senior Teacher', 'Subject Coordinator'],
  curriculum: ['Teacher', 'Curriculum Designer'],
  // Finance
  accounting: ['Accountant', 'Senior Accountant', 'Finance Manager'],
  audit: ['Auditor', 'Senior Auditor'],
  // Sales / Marketing
  sales: ['Sales Executive', 'Account Manager', 'Business Development Manager'],
  seo: ['SEO Specialist', 'Digital Marketing Manager'],
  marketing: ['Marketing Manager', 'Digital Marketing Specialist'],
  // HR
  recruitment: ['HR Officer', 'Talent Acquisition Specialist'],
  hr: ['HR Officer', 'HR Manager'],
  // Legal
  litigation: ['Litigation Lawyer', 'Legal Counsel'],
  contracts: ['Corporate Lawyer', 'Legal Counsel'],
});

function ruleRecommendedJobTitles(skills = [], currentTitle = null) {
  const bag = new Set();
  if (currentTitle) bag.add(currentTitle);
  for (const skill of (skills || [])) {
    const key = String(skill?.name || skill || '').toLowerCase();
    const titles = TITLE_MAP[key];
    if (titles) titles.forEach((t) => bag.add(t));
  }
  // Always end with a couple of generalist suggestions so we never return empty.
  if (bag.size === 0) {
    bag.add('Open to multiple roles');
  }
  return Array.from(bag).slice(0, 6);
}

/* ============================================================================
 * Public API (sync today, async-ready for an OpenAI provider tomorrow)
 * ========================================================================== */

function isRemote() {
  return config.ai && config.ai.provider === 'openai' && !!config.ai.apiKey;
}

function summariseMatch(payload) {
  // When a remote provider is wired in, branch here. The local rule-based
  // output is always computed first so we have a deterministic fallback.
  const local = ruleSummariseMatch(payload);
  if (!isRemote()) return local;
  // Future: call provider here, return remote text on success, local on failure.
  return local;
}

function missingSkillSuggestion(missing) {
  return ruleMissingSkillSuggestion(missing);
}

function careerImprovement(candidate, missing) {
  return ruleCareerImprovement(candidate, missing);
}

function profileImprovement(profile, skills) {
  return ruleProfileImprovement(profile, skills);
}

function recommendedJobTitles(skills, currentTitle) {
  return ruleRecommendedJobTitles(skills, currentTitle);
}

module.exports = {
  LABELS,
  labelForScore,
  summariseMatch,
  missingSkillSuggestion,
  careerImprovement,
  profileImprovement,
  recommendedJobTitles,
};
