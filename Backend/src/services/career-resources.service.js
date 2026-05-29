'use strict';

/**
 * Career resources service
 * ------------------------
 * Returns curated career-development content for the candidate-facing
 * homepage:
 *
 *   - resume tips
 *   - interview preparation
 *   - skill growth suggestions
 *
 * Today the content is a hand-curated static list. The shape and the
 * service boundary are deliberate so a real AI generator can replace
 * the body of `careerResources()` later without changing the route,
 * the payload shape, or the frontend renderer.
 *
 *   Future drop-in: `await openai.chat.completions.create(...)` →
 *   parse → return the same `{ resumeTips, interviewPrep, skillGrowth }`
 *   shape. Cache per-skill-fingerprint in Redis for cost control.
 *
 * Every entry carries `{ id, icon, title, body, cta? }` so the
 * frontend can render cards uniformly without inventing structure.
 */

const RESUME_TIPS = [
  {
    id: 'rt-quantify',
    icon: '◆',
    title: 'Quantify every bullet',
    body: 'Recruiters skim resumes in 7 seconds. Replace "improved performance" with "cut p95 latency by 38% across 4 services" — concrete numbers stick.',
  },
  {
    id: 'rt-keywords',
    icon: '●',
    title: 'Mirror the job description',
    body: 'Most resumes pass through an ATS first. Reuse the exact phrasing from the job ad for skills + responsibilities; the bot is a string-match, not a synonym engine.',
  },
  {
    id: 'rt-recency',
    icon: '▲',
    title: 'Lead with the last 5 years',
    body: 'Detail your most recent two roles in depth; collapse anything before that to a single line. Hiring managers care about what you can do this quarter, not what you shipped in 2017.',
  },
];

const INTERVIEW_PREP = [
  {
    id: 'ip-system',
    icon: '◇',
    title: 'System design rehearsal',
    body: 'For senior roles, expect a 45-minute design round. Pick one familiar product (chat, ride-share, feed) and practise narrating capacity, storage, partitioning, and failure modes end-to-end.',
  },
  {
    id: 'ip-behavioural',
    icon: '✦',
    title: 'STAR-format stories ready',
    body: 'Have five Situation-Task-Action-Result stories pre-loaded — one conflict, one win, one failure, one mentorship, one ambiguity. Most behavioural rounds are just remixes of those five.',
  },
  {
    id: 'ip-questions',
    icon: '?',
    title: 'Ask three sharp questions',
    body: 'End every interview with questions that show you read the role: how is success measured in the first 6 months, what does the team\'s on-call rotation look like, and where does this role get its next promotion from.',
  },
];

const SKILL_GROWTH = [
  {
    id: 'sg-ship',
    icon: '★',
    title: 'Ship one small thing weekly',
    body: 'Pick a new framework, library, or pattern and ship a real-world micro-project every week. Hiring signals come from delivery, not from courses-completed counts.',
  },
  {
    id: 'sg-fundamentals',
    icon: '◯',
    title: 'Re-learn fundamentals quarterly',
    body: 'Senior roles increasingly test fundamentals (data structures, OS, networking) you "did once at university". Block 30 minutes a day for a 4-week refresh every quarter.',
  },
  {
    id: 'sg-mentor',
    icon: '◈',
    title: 'Find one mentor, mentor one person',
    body: 'The strongest professional growth lever isn\'t a course — it\'s the feedback loop. Reach out cold to someone two levels above you, and offer your time to someone two levels below.',
  },
];

/**
 * Return the three curated lists.
 *
 * @param {object}  [opts]
 * @param {string[]}[opts.skills]   Optional candidate skills. Currently
 *                                  ignored; reserved for future
 *                                  skill-aware personalisation.
 * @param {string}  [opts.role]     Optional candidate current title.
 *                                  Reserved for future use.
 */
function careerResources(_opts = {}) {
  // The signature accepts personalisation hints so we can swap the
  // body for an AI call later without touching callers.
  return {
    resumeTips: RESUME_TIPS,
    interviewPrep: INTERVIEW_PREP,
    skillGrowth: SKILL_GROWTH,
  };
}

module.exports = {
  careerResources,
};
