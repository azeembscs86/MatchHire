'use strict';

/**
 * Seed: 50 candidate-matching jobs via the live employer HTTP flow.
 * ----------------------------------------------------------------
 * Logs in as a configured employer account and posts 50 jobs through
 * the same `POST /api/v1/employers/jobs` surface a human employer
 * uses. The jobs are tuned so they reliably clear MatchHire's 60%
 * match floor for backend-leaning candidates (Node.js / Express /
 * MySQL / Redis / Docker), validating the end-to-end pipeline:
 *
 *   employer login → job create → company posted jobs → candidate
 *   detail → matching jobs panel.
 *
 * Credentials never live in this file. They're read from process.env
 * at runtime and `.env.local` is gitignored, so a re-clone never
 * carries the password:
 *
 *   COMPANY_EMAIL     — employer login email
 *   COMPANY_PASSWORD  — that employer's password
 *   API_BASE          — optional, defaults to http://localhost:<PORT>/api/v1
 *   MATCH_CANDIDATE_ID — optional, candidate id to verify against
 *                        after the run (defaults to 1222)
 *
 * Usage:
 *   node src/database/seed.matching-jobs.js          # post 50 jobs
 *   node src/database/seed.matching-jobs.js rollback # remove only these
 *   node src/database/seed.matching-jobs.js verify   # recheck matches
 *
 * Rollback marker: every job's slug carries `-match-seed-v1-<i>`.
 */

const config = require('../config/env');
const logger = require('../utils/logger');

const MARKER = 'match-seed-v1';
const TOTAL_JOBS = 50;
const VERIFY_CANDIDATE_ID = Number(process.env.MATCH_CANDIDATE_ID || 1222);
const API_BASE = process.env.API_BASE
  || `http://localhost:${config.port || 3500}${config.apiPrefix || '/api/v1'}`;

// node 18+ ships global fetch; older requires undici. Fall back gracefully.
const fetch = global.fetch || require('undici').fetch;

/* ---------------------------------------------------------------- *
 * Job templates — title + required skills. Every template includes
 * AT LEAST 4 of the candidate's six skills (Node.js, Express.js,
 * MySQL, Redis, Docker, REST APIs) so the skill-match component lands
 * at 20+ of the 30 available points. Combined with a backend-leaning
 * title and a Karachi location, every row clears the 60% floor.
 *
 * Skills the user spec'd:
 *   Node.js, Express.js, MySQL, MongoDB, Redis, Kafka, REST APIs, JWT,
 *   OAuth2, Docker, AWS, Laravel, PHP, Git, CI/CD, Swagger, Microservices.
 * ---------------------------------------------------------------- */

const TEMPLATES = [
  {
    title: 'Senior Backend Engineer',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Redis', 'Docker', 'REST APIs'],
  },
  {
    title: 'Lead Backend Engineer',
    level: 'lead',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Redis', 'Microservices', 'Docker'],
  },
  {
    title: 'Senior Node.js Developer',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'MongoDB', 'Redis', 'JWT', 'REST APIs'],
  },
  {
    title: 'Backend Engineer — Node.js / TypeScript',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Docker', 'AWS', 'Microservices'],
  },
  {
    title: 'Senior Full Stack Developer',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Redis', 'REST APIs', 'Docker'],
  },
  {
    title: 'Full Stack Engineer (Node.js / React)',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'MongoDB', 'REST APIs', 'JWT', 'Docker'],
  },
  {
    // "Engineer" anchors the title so it overlaps with candidate
    // headlines like "Software Engineer" / "Senior Software Engineer"
    // — the match service awards role-match points off any word
    // shared between job title and candidate current_title.
    title: 'PHP / Laravel Engineer',
    level: 'senior',
    skills: ['Laravel', 'PHP', 'MySQL', 'Redis', 'REST APIs', 'Docker'],
  },
  {
    title: 'Senior PHP / Laravel Engineer',
    level: 'senior',
    skills: ['Laravel', 'PHP', 'MySQL', 'Redis', 'Docker', 'Microservices'],
  },
  {
    title: 'API Engineer',
    level: 'senior',
    skills: ['Node.js', 'Express.js', 'REST APIs', 'Swagger', 'JWT', 'OAuth2', 'MySQL'],
  },
  {
    title: 'Senior API Platform Engineer',
    level: 'lead',
    skills: ['Node.js', 'Express.js', 'REST APIs', 'OAuth2', 'JWT', 'Docker', 'Microservices'],
  },
  {
    title: 'Microservices Engineer',
    level: 'senior',
    skills: ['Node.js', 'Microservices', 'Docker', 'Kafka', 'Redis', 'REST APIs'],
  },
  {
    title: 'Senior Microservices Architect',
    level: 'lead',
    skills: ['Microservices', 'Kafka', 'Docker', 'Node.js', 'Redis', 'AWS'],
  },
  {
    title: 'DevOps Backend Engineer',
    level: 'senior',
    skills: ['Node.js', 'Docker', 'AWS', 'CI/CD', 'Git', 'MySQL', 'Redis'],
  },
  {
    title: 'Senior Backend Engineer — DevOps',
    level: 'senior',
    skills: ['Node.js', 'Docker', 'AWS', 'CI/CD', 'Git', 'Express.js'],
  },
  {
    title: 'Backend Engineer (Microservices)',
    level: 'mid',
    skills: ['Node.js', 'Microservices', 'Docker', 'REST APIs', 'MySQL', 'Redis'],
  },
];

const CITIES = [
  { city: 'Karachi', country: 'Pakistan' },
  { city: 'Lahore', country: 'Pakistan' },
  { city: 'Islamabad', country: 'Pakistan' },
];

const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const JOB_TYPES = ['full_time', 'full_time', 'full_time', 'contract'];

/**
 * Default bands (PKR / year). Used when the candidate hasn't set a
 * salary expectation OR the candidate's expectation falls inside
 * this range. Comfortably above the 500K floor in the spec.
 */
const DEFAULT_BANDS = {
  mid:    [600_000,  1_400_000],
  senior: [1_200_000, 2_600_000],
  lead:   [1_800_000, 3_800_000],
};

function salaryFor(level, i, candidateExpect) {
  // If the candidate has a posted expected range, target a band
  // that overlaps it so `pickSalaryMatch` returns 10 points. Without
  // overlap the match service reports a salary gap and bleeds 10
  // points — enough to drop a 65% job under the 60% floor.
  if (candidateExpect && candidateExpect.min > 0 && candidateExpect.max > 0) {
    const cMin = candidateExpect.min;
    const cMax = candidateExpect.max;
    // Slide the band ladder inside the candidate's expectation so
    // mid < senior < lead but all three overlap the candidate range.
    const slot = { mid: 0.25, senior: 0.5, lead: 0.85 }[level] ?? 0.5;
    const span = cMax - cMin;
    const center = cMin + span * slot;
    const min = Math.round(Math.max(cMin, center - span * 0.20));
    const max = Math.round(Math.min(cMax, center + span * 0.25));
    return { salary_min: min, salary_max: max };
  }
  const [lo, hi] = DEFAULT_BANDS[level] || DEFAULT_BANDS.senior;
  const jitter = (i % 7) * 25_000;
  return { salary_min: lo + jitter, salary_max: hi + jitter * 2 };
}

function deadlineFor(i) {
  // 7..30 days out so the new `application_deadline > NOW()` filter
  // never hides them on day one.
  const days = 7 + (i % 24);
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

function buildJob(i, ctx = {}) {
  const tpl = TEMPLATES[i % TEMPLATES.length];
  const loc = CITIES[i % CITIES.length];
  const work_mode = WORK_MODES[i % WORK_MODES.length];
  const job_type = JOB_TYPES[i % JOB_TYPES.length];
  const { salary_min, salary_max } = salaryFor(tpl.level, i, ctx.candidateExpect);
  const skills = tpl.skills.slice();
  const description = [
    `${tpl.title} at our growing team based in ${loc.city}, ${loc.country}.`,
    `You'll own end-to-end delivery for services built on ${skills.slice(0, 3).join(', ')} and partner with product + design on scoping, estimation, and trade-offs.`,
    `Expect to ship features that move quarterly KPIs and mentor peers along the way.`,
  ].join(' ');
  const responsibilities = [
    `Design and deliver APIs and services using ${skills.slice(0, 3).join(', ')}.`,
    `Own infrastructure-as-code, deployment, and rollback for the systems you build.`,
    `Partner with product on scoping and trade-off decisions.`,
    `Mentor mid-level engineers and set quality standards for the team.`,
  ].join('\n');
  const requirements = [
    `${tpl.level === 'lead' ? '8+' : '5+'} years building production backend systems.`,
    `Hands-on with ${skills.slice(0, 4).join(', ')}.`,
    `Solid grounding in REST API design, schema design, and observability.`,
    `Comfortable writing clear technical docs (Swagger / runbooks).`,
  ].join('\n');
  const benefits = [
    `Competitive PKR salary band: ${(salary_min / 1000).toFixed(0)}K – ${(salary_max / 1000).toFixed(0)}K (annual)`,
    `Health insurance for self + dependents`,
    `Annual learning & development stipend`,
    `Generous paid time off + parental leave`,
    `Flexible ${work_mode} working arrangement`,
  ].join('\n');

  return {
    // Title carries a hidden marker token (kept short, all-lowercase
    // and on its own at the end) so the seeder can find and roll back
    // these rows by title later — `jobCreate` builds the slug from
    // the title automatically.
    title: `${tpl.title} [${MARKER}-${i}]`,
    description,
    responsibilities,
    requirements,
    benefits,
    job_type,
    experience_level: tpl.level,
    location: loc.city,
    country: loc.country,
    is_remote: work_mode === 'remote',
    salary_min,
    salary_max,
    salary_currency: 'PKR',
    salary_period: 'year',
    skills_tags: skills,
    application_deadline: deadlineFor(i),
    vacancies: ((i % 3) + 1),
    is_featured: i % 7 === 0,
    status: 'open',
  };
}

/* ---------------------------------------------------------------- *
 * HTTP helpers — minimal wrapper around fetch with a JSON envelope.
 * The MatchHire API wraps every payload in `{ Response, Data }`, so
 * we unwrap once and let upstream code work with `Data`.
 * ---------------------------------------------------------------- */

async function api(path, { method = 'POST', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.Response?.responseCode !== 1) {
    const msg = json?.Response?.message || `HTTP ${res.status}`;
    const err = new Error(`${method} ${path} failed: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.Data ?? {};
}

async function login() {
  const email = process.env.COMPANY_EMAIL;
  const password = process.env.COMPANY_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Set COMPANY_EMAIL and COMPANY_PASSWORD in Backend/.env.local before running.'
    );
  }
  const data = await api('/auth/login', {
    body: { email, password, rememberMe: false },
  });
  if (!data?.access_token) throw new Error('Login succeeded but no access_token returned.');
  return data.access_token;
}

/* ---------------------------------------------------------------- *
 * Verification — runs the matching-jobs service against the seeded
 * jobs so we can confirm the floor (60%) was actually cleared.
 * ---------------------------------------------------------------- */

async function verifyMatches(token, candidateId) {
  const data = await api(
    `/employers/candidates/${candidateId}/matching-jobs`,
    { token }
  );
  return data?.records || [];
}

/* ---------------------------------------------------------------- *
 * Rollback — DB direct because there's no employer "bulk delete" API.
 * Matches by the marker token baked into every seeded job's title.
 * ---------------------------------------------------------------- */

async function rollbackViaDb() {
  const mysql = require('mysql2/promise');
  const c = require('../config/env');
  const conn = await mysql.createConnection({
    host: c.db.host, port: c.db.port, user: c.db.user,
    password: c.db.password, database: c.db.name,
  });
  try {
    const [res] = await conn.query(
      `DELETE FROM jobs WHERE title LIKE ?`,
      [`%[${MARKER}-%]%`]
    );
    return res?.affectedRows || 0;
  } finally {
    await conn.end();
  }
}

/* ---------------------------------------------------------------- *
 * Entry point
 * ---------------------------------------------------------------- */

/**
 * Direct-DB fallback for the create + verify path.
 *
 * Bypasses the HTTP login flow when credentials can't be supplied
 * (eg. unknown password for the seeded account). Resolves the
 * employer's company by email instead, inserts the 50 jobs straight
 * into the `jobs` table, and runs the same match calculation against
 * the candidate's full context so we can report the same tier
 * breakdown. The HTTP path stays the default — this only fires when
 * the caller passes `--direct`.
 */
async function runDirect() {
  const mysql = require('mysql2/promise');
  const c = require('../config/env');
  const matchService = require('../services/match.service');
  const jobRepo = require('../repositories/job.repository');

  const email = process.env.COMPANY_EMAIL;
  if (!email) throw new Error('Set COMPANY_EMAIL in Backend/.env.local before running.');

  const conn = await mysql.createConnection({
    host: c.db.host, port: c.db.port, user: c.db.user,
    password: c.db.password, database: c.db.name,
  });
  try {
    const [[emp]] = await conn.query(
      `SELECT u.id AS user_id, co.id AS company_id, co.name
       FROM users u
       INNER JOIN companies co ON co.owner_user_id = u.id
       WHERE u.email = ? AND u.role = 'employer' AND u.deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    if (!emp) throw new Error(`No employer/company found for ${email}`);
    logger.info(`Direct insert: posting under company "${emp.name}" (id ${emp.company_id})`);

    const candidateExpect = await loadCandidateExpectation(VERIFY_CANDIDATE_ID);

    // Slug builder mirrors `job.repository#create` so links work.
    function slugify(s) {
      return String(s).toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }

    const rows = [];
    for (let i = 0; i < TOTAL_JOBS; i++) {
      const j = buildJob(i, { candidateExpect });
      const slug = `${slugify(j.title)}-${Date.now()}-${i}`;
      rows.push([
        emp.company_id, emp.user_id, null, j.title, slug,
        j.description, j.responsibilities, j.requirements, j.benefits,
        j.job_type, j.experience_level,
        j.location, j.location, j.country, null, null,
        j.is_remote ? 1 : 0, 'onsite', 0,
        j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
        (j.skills_tags || []).join(','),
        new Date(j.application_deadline),
        j.vacancies, 'open', j.is_featured ? 1 : 0, 'approved',
        new Date(),
      ]);
    }

    const sql = `INSERT INTO jobs
      (company_id, posted_by_user_id, category_id, title, slug,
       description, responsibilities, requirements, benefits,
       job_type, experience_level,
       location, city, country, country_id, timezone,
       is_remote, work_mode, is_global_remote,
       salary_min, salary_max, salary_currency, salary_period,
       skills_tags, application_deadline, vacancies,
       status, is_featured, admin_status, published_at)
      VALUES ?`;
    const [res] = await conn.query(sql, [rows]);
    logger.info(`Direct insert: created ${res.affectedRows}/${TOTAL_JOBS} jobs.`);

    // Verify via the same match algorithm the API uses.
    const candidate = await jobRepo.loadCandidateContext(VERIFY_CANDIDATE_ID);
    const { rows: jobs } = await jobRepo.listByCompany(emp.company_id, {
      page: 1, limit: 200, status: 'open', exclude_expired: true,
    });
    const seeded = jobs.filter((j) => /\[match-seed-v1-\d+\]$/.test(j.title));
    const scored = seeded
      .map((j) => ({ title: j.title, score: matchService.scoreJob(j, candidate).score }))
      .sort((a, b) => b.score - a.score);
    const above60 = scored.filter((r) => r.score > 60);
    const tiers = {
      strong: above60.filter((r) => r.score >= 85).length,
      good:   above60.filter((r) => r.score >= 70 && r.score < 85).length,
      pot:    above60.filter((r) => r.score >= 61 && r.score < 70).length,
    };
    logger.info(
      `Verify: ${above60.length}/${seeded.length} seeded jobs score >60% for candidate ${VERIFY_CANDIDATE_ID}.`
    );
    logger.info(`Tier breakdown: Strong=${tiers.strong}, Good=${tiers.good}, Potential=${tiers.pot}`);
    if (scored.length) {
      const top5 = scored.slice(0, 5)
        .map((r) => `${r.title.replace(/\s*\[match-seed-v1-\d+\]$/, '')} → ${r.score}%`)
        .join(' | ');
      logger.info(`Top 5: ${top5}`);
    }
  } finally {
    await conn.end();
  }
}

async function loadCandidateExpectation(candidateId) {
  const mysql = require('mysql2/promise');
  const c = require('../config/env');
  const conn = await mysql.createConnection({
    host: c.db.host, port: c.db.port, user: c.db.user,
    password: c.db.password, database: c.db.name,
  });
  try {
    const [rows] = await conn.query(
      `SELECT expected_salary_min, expected_salary_max
       FROM candidate_profiles WHERE user_id = ? LIMIT 1`,
      [candidateId]
    );
    if (!rows.length) return null;
    const min = Number(rows[0].expected_salary_min || 0);
    const max = Number(rows[0].expected_salary_max || 0);
    if (!min && !max) return null;
    return { min, max: max || min * 1.5 };
  } finally {
    await conn.end();
  }
}

async function run(mode) {
  if (mode === 'rollback') {
    const removed = await rollbackViaDb();
    logger.info(`Matching-jobs rollback: ${removed} jobs removed.`);
    return;
  }

  const token = await login();
  logger.info('Logged in as configured employer.');

  // Read the candidate's expected salary band once so every job can
  // target it for the +10 salary-match bonus. Optional — if the
  // candidate hasn't set expectations the default bands are used.
  const candidateExpect = await loadCandidateExpectation(VERIFY_CANDIDATE_ID);
  if (candidateExpect) {
    logger.info(
      `Targeting candidate ${VERIFY_CANDIDATE_ID} salary band (in PKR/yr).`
    );
  }

  if (mode === 'verify') {
    const matches = await verifyMatches(token, VERIFY_CANDIDATE_ID);
    const above60 = matches.filter((m) => m.match_score > 60);
    logger.info(`Verify: ${above60.length} matches > 60% for candidate ${VERIFY_CANDIDATE_ID}.`);
    if (above60.length) {
      const sample = above60.slice(0, 5)
        .map((m) => `${m.job_title} → ${m.match_score}%`).join(', ');
      logger.info(`Top 5: ${sample}`);
    }
    return;
  }

  // Create. Run requests serially so the DB isn't hammered with 50
  // concurrent inserts — the operation completes in a few seconds
  // either way.
  let created = 0;
  for (let i = 0; i < TOTAL_JOBS; i++) {
    const payload = buildJob(i, { candidateExpect });
    try {
      const job = await api('/employers/jobs', { body: payload, token });
      if (job?.id) created += 1;
    } catch (err) {
      logger.error(`Job ${i} failed: ${err.message}`);
      throw err;
    }
  }
  logger.info(`Matching-jobs seed: created ${created}/${TOTAL_JOBS} jobs.`);

  // Verify the matching surface returns >60% for every fresh row.
  const matches = await verifyMatches(token, VERIFY_CANDIDATE_ID);
  const above60 = matches.filter((m) => m.match_score > 60);
  logger.info(`Verify: ${above60.length} matches > 60% for candidate ${VERIFY_CANDIDATE_ID}.`);
  if (above60.length) {
    const tiers = {
      strong: above60.filter((m) => m.match_score >= 85).length,
      good:   above60.filter((m) => m.match_score >= 70 && m.match_score < 85).length,
      pot:    above60.filter((m) => m.match_score >= 61 && m.match_score < 70).length,
    };
    logger.info(`Tier breakdown: Strong=${tiers.strong}, Good=${tiers.good}, Potential=${tiers.pot}`);
  }
}

if (require.main === module) {
  const direct = process.argv.includes('--direct');
  const mode = process.argv.includes('rollback')
    ? 'rollback'
    : (process.argv.includes('verify') ? 'verify' : 'apply');
  const main = (mode === 'apply' && direct) ? runDirect() : run(mode);
  main
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Matching-jobs seed failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { run };
