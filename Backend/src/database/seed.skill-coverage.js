'use strict';

/**
 * Seed: 200 new companies + skill-coverage jobs
 * ---------------------------------------------
 * Adds another batch of realistic companies on top of whatever
 * `seed.bulk.js` / `seed.fresh-jobs.js` already produced, then
 * generates enough job postings that EVERY skill in the `skills`
 * table appears in at least 50 active job listings.
 *
 * Why a separate seeder
 * ---------------------
 * The existing bulk + fresh-jobs seeders fix the company list at
 * ~240 rows and the job list at 250 PK-only postings. They aren't
 * structured to guarantee per-skill coverage. Rather than mutate
 * those (and risk breaking the existing test data), this is a pure
 * additive layer with its own marker so it can be rolled back
 * independently.
 *
 * Markers (used for idempotency + rollback):
 *   - companies   cover_url = 'skill-coverage-v1:companies'
 *   - jobs        slug suffix `-skill-cov-v1-<i>`
 *
 * Commands:
 *   node src/database/seed.skill-coverage.js              insert
 *   node src/database/seed.skill-coverage.js rollback     remove
 *
 * Or via npm aliases (added in package.json):
 *   npm run seed:skill-coverage
 *   npm run seed:skill-coverage:rollback
 */

const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const COMPANY_MARKER = 'skill-coverage-v1:companies';
const JOB_MARKER = 'skill-cov-v1';
const TARGET_COMPANIES = 200;
const MIN_JOBS_PER_SKILL = 50;
const MAX_SKILLS_PER_JOB = 6;
const BATCH = 100;

/* --------------------------------------------------------------------------
 * Connection + helpers
 * -------------------------------------------------------------------------- */

async function getConnection() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    multipleStatements: false,
  });
}

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function pick(arr, i) { return arr[Math.abs(i) % arr.length]; }

async function chunkedInsert(conn, sql, values, chunkSize = BATCH) {
  let affected = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const [res] = await conn.query(sql, [slice]);
    affected += res?.affectedRows || 0;
  }
  return affected;
}

/* --------------------------------------------------------------------------
 * Company name pools — kept distinct from seed.bulk.js so slugs don't
 * collide. Combinatorial generation gives us > 200 unique names.
 * -------------------------------------------------------------------------- */

const FIRSTS = [
  'Aurora', 'Borealis', 'Cipher', 'Delta', 'Echo', 'Fable', 'Granite',
  'Horizon', 'Ignite', 'Juno', 'Kalon', 'Lumos', 'Magnet', 'Nimble',
  'Obsidian', 'Pinnacle', 'Quasar', 'Radius', 'Stellar', 'Trove', 'Ursa',
  'Veritas', 'Wisp', 'Xenith', 'Yondr', 'Zenith', 'Apex', 'Boreal',
  'Cascade', 'Drift', 'Ember', 'Forge', 'Glint', 'Halo', 'Ion', 'Jet',
  'Kindle', 'Lattice', 'Mosaic', 'Nova', 'Orbit', 'Prism', 'Quill',
  'Ridge', 'Spark', 'Tempo', 'Uplink', 'Vortex', 'Wander', 'Yara',
];

const SECONDS = [
  'Labs', 'AI', 'Cloud', 'Robotics', 'Networks', 'Systems', 'Compute',
  'Studio', 'Works', 'Forge', 'Data', 'Logic', 'Analytics', 'Bio',
  'Health', 'Finance', 'Capital', 'Energy', 'Mobility', 'Optics',
  'Quantum', 'Materials', 'Sensors', 'Vision', 'Voice', 'Devices',
];

const CITIES_COUNTRIES = [
  ['Karachi', 'Pakistan', 'Asia/Karachi'],
  ['Lahore', 'Pakistan', 'Asia/Karachi'],
  ['Islamabad', 'Pakistan', 'Asia/Karachi'],
  ['San Francisco', 'USA', 'America/Los_Angeles'],
  ['New York', 'USA', 'America/New_York'],
  ['Austin', 'USA', 'America/Chicago'],
  ['Seattle', 'USA', 'America/Los_Angeles'],
  ['Boston', 'USA', 'America/New_York'],
  ['Toronto', 'Canada', 'America/Toronto'],
  ['London', 'United Kingdom', 'Europe/London'],
  ['Manchester', 'United Kingdom', 'Europe/London'],
  ['Berlin', 'Germany', 'Europe/Berlin'],
  ['Munich', 'Germany', 'Europe/Berlin'],
  ['Amsterdam', 'Netherlands', 'Europe/Amsterdam'],
  ['Bangalore', 'India', 'Asia/Kolkata'],
  ['Mumbai', 'India', 'Asia/Kolkata'],
  ['Hyderabad', 'India', 'Asia/Kolkata'],
  ['Singapore', 'Singapore', 'Asia/Singapore'],
  ['Dubai', 'United Arab Emirates', 'Asia/Dubai'],
  ['Sydney', 'Australia', 'Australia/Sydney'],
];

const INDUSTRIES = [
  'Software / SaaS', 'Fintech', 'Healthtech', 'E-commerce', 'AI / ML',
  'EdTech', 'Cybersecurity', 'Logistics', 'Media', 'Energy', 'Climate Tech',
  'Travel', 'Real Estate', 'Retail', 'Telecommunications', 'Manufacturing',
  'Gaming', 'Consumer Apps', 'B2B SaaS', 'Government Tech',
];

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

const JOB_TYPES = ['full_time', 'full_time', 'full_time', 'contract', 'part_time', 'internship'];
const EXP_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'];
const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const CURRENCIES_FOR_COUNTRY = {
  Pakistan: 'PKR',
  India: 'INR',
  'United Kingdom': 'GBP',
  Germany: 'EUR',
  Netherlands: 'EUR',
  Singapore: 'SGD',
  'United Arab Emirates': 'AED',
  Australia: 'AUD',
};
const DEFAULT_CURRENCY = 'USD';

function makeCompanyList(n) {
  const out = [];
  const seen = new Set();
  let i = 0;
  while (out.length < n) {
    const name = `${pick(FIRSTS, i)} ${pick(SECONDS, i * 3 + 1)}`;
    const slug = slugify(name);
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push({ name, slug });
    }
    i += 1;
    if (i > 50_000) break; // safety
  }
  // Add a distinguishing numeric suffix until we hit the target if the
  // base combinatorial space ever runs short. Slug uniqueness is
  // double-checked.
  let pad = 1;
  while (out.length < n) {
    const name = `${pick(FIRSTS, pad)} ${pick(SECONDS, pad * 5)} ${pad}`;
    const slug = slugify(name);
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push({ name, slug });
    }
    pad += 1;
  }
  return out.slice(0, n);
}

/* --------------------------------------------------------------------------
 * Reference data
 * -------------------------------------------------------------------------- */

async function loadCountryMap(conn) {
  const [rows] = await conn.query(`SELECT id, code, name FROM countries`);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  byName['USA'] = byCode['US'];
  byName['UK'] = byCode['GB'];
  return { byCode, byName };
}

async function loadCategoryMap(conn) {
  const [rows] = await conn.query(`SELECT id, name FROM job_categories`);
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

async function loadAllSkillNames(conn) {
  const [rows] = await conn.query(`SELECT name FROM skills WHERE is_active = 1 ORDER BY id`);
  return rows.map((r) => r.name);
}

/* --------------------------------------------------------------------------
 * Stage 1 — companies
 * -------------------------------------------------------------------------- */

async function seedCompanies(conn) {
  const { byCode, byName } = await loadCountryMap(conn);
  const companies = makeCompanyList(TARGET_COMPANIES);
  const FOUNDED = [2010, 2012, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

  const rows = companies.map((c, i) => {
    const [city, country] = pick(CITIES_COUNTRIES, i);
    const industry = pick(INDUSTRIES, i + 3);
    const size = pick(SIZES, i + 1);
    const founded = pick(FOUNDED, i + 5);
    const tagline = `${industry} team building reliable products for global customers.`;
    const description = [
      `${c.name} is a ${industry.toLowerCase()} company headquartered in ${city}, ${country}.`,
      `Founded in ${founded}, the team currently sits in the ${size} headcount band.`,
      `We hire across engineering, product, design, data, and go-to-market roles.`,
    ].join(' ');
    const website = `https://www.${slugify(c.name).replace(/-/g, '')}.example.com`;
    return [
      null,                             // owner_user_id
      c.name,
      c.slug,
      tagline,
      description,
      industry,
      size,
      website,
      null,                             // logo_url
      COMPANY_MARKER,                   // cover_url = sentinel
      city,
      country,
      founded,
      'verified',                       // verification_status
      i < 12 ? 1 : 0,                   // is_featured for the first dozen
      'active',                         // status
    ];
  });

  // Note: `companies` doesn't have a `country_id` column in this schema
  // — country is stored as a free-text name. seed.bulk.js handled the
  // same gap with a guarded UPDATE that we don't need here.
  void byCode; void byName;
  const sql = `INSERT INTO companies
    (owner_user_id, name, slug, tagline, description, industry, size, website,
     logo_url, cover_url, location, country, founded_year,
     verification_status, is_featured, status)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      tagline = VALUES(tagline), description = VALUES(description),
      industry = VALUES(industry), size = VALUES(size),
      website = VALUES(website), cover_url = VALUES(cover_url),
      location = VALUES(location), country = VALUES(country),
      founded_year = VALUES(founded_year),
      verification_status = VALUES(verification_status),
      is_featured = VALUES(is_featured), status = VALUES(status)`;
  const affected = await chunkedInsert(conn, sql, rows, 50);
  logger.info(`Skill-coverage seed: companies upserted (${affected} affected rows)`);
}

/* --------------------------------------------------------------------------
 * Stage 2 — jobs with per-skill quota
 *
 * The algorithm:
 *   - Each skill starts with a remaining quota of MIN_JOBS_PER_SKILL.
 *   - We pick MAX_SKILLS_PER_JOB skills with the highest remaining
 *     quota, build one job from them, decrement each.
 *   - Repeat until every skill has quota = 0.
 *
 * This produces ~ (total_skills * MIN_JOBS_PER_SKILL / MAX_SKILLS_PER_JOB)
 * job rows. With 525 skills × 50 / 6 ≈ 4,375 jobs. Each skill ends up
 * appearing in exactly MIN_JOBS_PER_SKILL jobs.
 * -------------------------------------------------------------------------- */

function categoryForSkills(skills, cats) {
  // Cheap heuristic: scan the skill list for substrings that map to a
  // category. Falls back to "Software Engineering" which is the
  // catch-all bucket in the existing schema.
  const blob = skills.join(' ').toLowerCase();
  const tests = [
    [/python|tensorflow|pytorch|ml|tensor|pandas|scikit/, 'Data Science'],
    [/data|sql|airflow|spark|bigquery|warehouse|tableau|looker/, 'Data Science'],
    [/figma|sketch|design system|illustrator|photoshop|adobe xd|prototyping/, 'Design'],
    [/seo|ppc|sem|marketing|content|growth|paid acquisition|copywriting/, 'Marketing'],
    [/sales|crm|outreach|account exec/, 'Sales'],
    [/finance|accounting|fp&a|excel/, 'Finance'],
    [/recruit|hr |onboarding|people ops/, 'Human Resources'],
    [/zendesk|customer support|customer success/, 'Customer Support'],
    [/product manager|product strategy|roadmap/, 'Product Management'],
  ];
  for (const [rx, name] of tests) {
    if (rx.test(blob) && cats[name]) return cats[name];
  }
  return cats['Software Engineering'] || Object.values(cats)[0] || null;
}

function titleForSkills(skills, seed) {
  // First skill = anchor; second skill = supporting tech.
  const anchor = skills[0];
  const support = skills[1] || '';
  const level = pick(EXP_LEVELS, seed);
  const role = pick([
    'Engineer', 'Developer', 'Specialist', 'Consultant', 'Architect',
  ], seed);
  const prefix = level === 'senior' ? 'Senior ' : (level === 'lead' ? 'Lead ' : (level === 'entry' ? 'Junior ' : ''));
  if (support) return `${prefix}${anchor} / ${support} ${role}`;
  return `${prefix}${anchor} ${role}`;
}

function salaryFor(level, currency, seed) {
  // Per-currency mid-band, scaled by experience level. Numbers are
  // round-ish so they read naturally on the card.
  const baseUSD = {
    entry:    [38_000, 60_000],
    junior:   [55_000, 80_000],
    mid:      [80_000, 120_000],
    senior:   [120_000, 170_000],
    lead:     [150_000, 220_000],
  }[level] || [60_000, 100_000];
  const fx = {
    USD: 1, GBP: 0.78, EUR: 0.92, AUD: 1.5, SGD: 1.34, AED: 3.67,
    INR: 83, PKR: 280,
  }[currency] || 1;
  const min = Math.round(baseUSD[0] * fx);
  const max = Math.round(baseUSD[1] * fx);
  // Jitter ±10% so adjacent rows don't all read identically.
  const jitter = ((seed % 9) - 4) / 100;
  return [Math.round(min * (1 + jitter)), Math.round(max * (1 + jitter))];
}

function deadlineFor(seed) {
  // 7..60 days in the future. Stable jitter per seed.
  const days = 7 + (seed % 54);
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(23, 59, 59, 0);
  return d;
}

function buildJobs({ allSkills, companies, cats, countryMap }) {
  const remaining = new Map(allSkills.map((name) => [name, MIN_JOBS_PER_SKILL]));
  const rows = [];
  let i = 0;

  while (Array.from(remaining.values()).some((q) => q > 0)) {
    // Skills sorted by remaining quota desc — the ones still short of
    // their floor get picked first. We grab the top MAX_SKILLS_PER_JOB
    // and rotate them into this job.
    const need = [...remaining.entries()]
      .filter(([, q]) => q > 0)
      .sort((a, b) => b[1] - a[1]);
    const slice = need.slice(0, MAX_SKILLS_PER_JOB).map(([name]) => name);
    // Shuffle within slice so the same combo doesn't recur every iteration.
    const shuffled = slice
      .map((s, k) => ({ s, r: ((i * 7919) + k * 31) % 997 }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.s);

    const skills = shuffled;
    const seed = i + 1;
    const company = pick(companies, i * 13 + 7);
    const [city, country, tz] = pick(CITIES_COUNTRIES, i);
    const country_id = countryMap.byName[country] || countryMap.byCode['US'] || null;
    const work_mode = pick(WORK_MODES, i);
    const is_remote = work_mode === 'remote' ? 1 : 0;
    const is_global_remote = work_mode === 'remote' && (i % 4 === 0) ? 1 : 0;
    const job_type = pick(JOB_TYPES, i);
    const level = pick(EXP_LEVELS, i);
    const currency = CURRENCIES_FOR_COUNTRY[country] || DEFAULT_CURRENCY;
    const [salary_min, salary_max] = salaryFor(level, currency, seed);
    const title = titleForSkills(skills, seed);
    const category_id = categoryForSkills(skills, cats);
    const skills_tags = skills.join(',');

    const slug = `${slugify(title)}-${slugify(company.name)}-${JOB_MARKER}-${i}`;
    // Stagger published_at over the last 60 days so "Posted within"
    // filters have meaningful spread. Stable per seed.
    const publishedAt = new Date(Date.now() - ((i * 17) % (60 * 86400000)));
    const deadline = deadlineFor(seed);

    const description = [
      `${title} role at ${company.name} based in ${city}, ${country}.`,
      `This is a ${level}-band ${job_type.replace(/_/g, '-')} opportunity with a ${work_mode} work mode.`,
      `We're looking for someone strong on ${skills.slice(0, 3).join(', ')} who can ramp quickly and contribute to a high-output team within 30 days.`,
    ].join(' ');

    const responsibilities = [
      `Own end-to-end delivery of features using ${skills.slice(0, 3).join(', ')}.`,
      `Partner with product + design on scoping, estimation, and trade-offs.`,
      `Drive measurable outcomes against quarterly goals.`,
      `Mentor peers and set quality standards for the team.`,
    ].join('\n');

    const requirements = [
      `${level.charAt(0).toUpperCase() + level.slice(1)}-band experience (3+ years preferred).`,
      `Strong hands-on with ${skills.slice(0, 4).join(', ')}.`,
      `Excellent written + verbal communication; async-first comfortable.`,
      `Bachelor's degree in a relevant field or equivalent professional experience.`,
    ].join('\n');

    const benefits = [
      `Competitive ${currency} salary band: ${(salary_min/1000).toFixed(0)}K – ${(salary_max/1000).toFixed(0)}K (annual)`,
      `Health insurance for self + dependents`,
      `Annual learning & development stipend`,
      `Generous paid time off + parental leave`,
      `Flexible ${work_mode} working arrangement`,
    ].join('\n');

    rows.push([
      company.id,
      null,                                  // posted_by_user_id
      category_id,
      title,
      slug,
      description,
      responsibilities,
      requirements,
      benefits,
      job_type,
      level,
      city,
      city,
      country,
      country_id,
      tz,
      is_remote,
      work_mode,
      is_global_remote,
      salary_min,
      salary_max,
      currency,
      'year',
      skills_tags,
      deadline,
      ((seed) % 3) + 1,                      // vacancies
      'open',
      (i % 7 === 0) ? 1 : 0,                 // is_featured every 7th
      'approved',
      publishedAt,
    ]);

    for (const s of skills) {
      remaining.set(s, remaining.get(s) - 1);
    }
    i += 1;

    // Safety cap so a programming error can't run away.
    if (i > 50_000) {
      throw new Error('Job generator exceeded safety cap (50,000). Aborting.');
    }
  }
  return rows;
}

async function clearPriorJobs(conn) {
  const [res] = await conn.query(
    `DELETE FROM jobs WHERE slug LIKE ?`,
    [`%-${JOB_MARKER}-%`]
  );
  return res?.affectedRows || 0;
}

async function clearPriorCompanies(conn) {
  // Hard-delete only companies whose cover_url marker matches. FK
  // cascade on jobs cleans up any jobs that referenced them.
  const [res] = await conn.query(
    `DELETE FROM companies WHERE cover_url = ?`,
    [COMPANY_MARKER]
  );
  return res?.affectedRows || 0;
}

async function loadAllCompanies(conn) {
  // Mix the new + existing companies so the new jobs spread realistically.
  const [rows] = await conn.query(
    `SELECT id, name, slug FROM companies
     WHERE status = 'active' AND deleted_at IS NULL`
  );
  return rows;
}

async function insertJobs(conn, rows) {
  const sql = `INSERT INTO jobs
    (company_id, posted_by_user_id, category_id, title, slug, description,
     responsibilities, requirements, benefits, job_type, experience_level,
     location, city, country, country_id, timezone, is_remote, work_mode, is_global_remote,
     salary_min, salary_max, salary_currency, salary_period, skills_tags,
     application_deadline, vacancies, status, is_featured, admin_status, published_at)
    VALUES ?`;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const [res] = await conn.query(sql, [slice]);
    inserted += res?.affectedRows || slice.length;
  }
  return inserted;
}

/* --------------------------------------------------------------------------
 * Verification
 * -------------------------------------------------------------------------- */

async function verifyCoverage(conn) {
  const [rows] = await conn.query(`SELECT name FROM skills WHERE is_active = 1`);
  let belowFloor = 0;
  const samples = [];
  for (const r of rows) {
    const [c] = await conn.query(
      `SELECT COUNT(*) AS n FROM jobs
       WHERE status='open' AND deleted_at IS NULL
         AND LOWER(skills_tags) LIKE ?`,
      [`%${String(r.name).toLowerCase()}%`]
    );
    const count = Number(c[0].n);
    if (count < MIN_JOBS_PER_SKILL) {
      belowFloor += 1;
      if (samples.length < 10) samples.push(`${r.name}=${count}`);
    }
  }
  return { belowFloor, samples, total: rows.length };
}

/* --------------------------------------------------------------------------
 * Entry point
 * -------------------------------------------------------------------------- */

async function run({ mode = 'apply' } = {}) {
  const conn = await getConnection();
  try {
    if (mode === 'rollback') {
      const jobsRemoved = await clearPriorJobs(conn);
      const companiesRemoved = await clearPriorCompanies(conn);
      logger.info(`Skill-coverage rollback: removed ${jobsRemoved} jobs, ${companiesRemoved} companies.`);
      return;
    }
    if (mode === 'verify') {
      const v = await verifyCoverage(conn);
      logger.info(`Coverage check: ${v.belowFloor}/${v.total} skills below floor of ${MIN_JOBS_PER_SKILL}.`);
      if (v.belowFloor) logger.info(`Examples: ${v.samples.join(', ')}`);
      return;
    }

    await conn.beginTransaction();
    try {
      // 1) Stage 1 — companies
      await seedCompanies(conn);

      // 2) Wipe any previous skill-coverage jobs so the run is idempotent.
      const cleared = await clearPriorJobs(conn);
      if (cleared) logger.info(`Skill-coverage seed: cleared ${cleared} prior jobs`);

      // 3) Stage 2 — generate + insert jobs
      const [allSkills, companies, cats, countryMap] = await Promise.all([
        loadAllSkillNames(conn),
        loadAllCompanies(conn),
        loadCategoryMap(conn),
        loadCountryMap(conn),
      ]);
      if (!allSkills.length) throw new Error('No skills found — run seed:skills first.');
      if (!companies.length) throw new Error('No companies found.');

      const jobs = buildJobs({ allSkills, companies, cats, countryMap });
      logger.info(`Skill-coverage seed: generated ${jobs.length} job rows for ${allSkills.length} skills`);
      const inserted = await insertJobs(conn, jobs);
      logger.info(`Skill-coverage seed: inserted ${inserted} jobs`);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }

    // Post-commit verification (don't wrap in the tx so it always runs).
    const v = await verifyCoverage(conn);
    logger.info(`Coverage check: ${v.belowFloor}/${v.total} skills still below ${MIN_JOBS_PER_SKILL}.`);
    if (v.belowFloor) logger.info(`Examples: ${v.samples.join(', ')}`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const mode = process.argv.includes('rollback')
    ? 'rollback'
    : (process.argv.includes('verify') ? 'verify' : 'apply');
  run({ mode })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Skill-coverage seed failed', { error: err.message, stack: err.stack });
      process.exit(1);
    });
}

module.exports = { run };
