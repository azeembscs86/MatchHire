'use strict';

/**
 * Bulk realistic seed - companies, candidates, jobs (240 of each).
 * ---------------------------------------------------------------
 * Complements the small curated `seed.js` (admins + 3 demo companies +
 * a handful of candidates) with realistic-looking volume for local/
 * staging testing. Pure addition: nothing in `seed.js` is touched and
 * the existing API surface keeps working.
 *
 * Style:
 *   - same mysql2 connection helper as seed.js
 *   - same bcryptjs cost-10 hashing for the demo password
 *   - same slugify helper
 *   - all writes go through `ON DUPLICATE KEY UPDATE` / `INSERT IGNORE`
 *     so the seeder is idempotent (safe to run repeatedly)
 *   - bulk multi-row INSERTs in chunks of 50-100 rows for speed
 *
 * Rollback strategy:
 *   - every bulk-inserted company tags `cover_url = 'bulk-seed:v1'`
 *   - every bulk-inserted candidate tags `avatar_url = 'bulk-seed:v1'`
 *   - `seed.bulk.js rollback` deletes rows with those markers; FK
 *     cascades (jobs.company_id, candidate_profiles.user_id,
 *     candidate_skills.candidate_user_id) clean up the rest.
 *
 * Commands:
 *   npm run seed:bulk            insert (idempotent)
 *   npm run seed:bulk:rollback   remove bulk rows only
 */

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'Password@123';
const MARKER = 'bulk-seed:v1';
const BATCH = 100;

/* --------------------------------------------------------------------------
 * Connection + helpers (mirrors seed.js)
 * -------------------------------------------------------------------------- */

async function getConnection() {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    multipleStatements: false,
    dateStrings: false,
  });
}

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function pick(arr, i) { return arr[i % arr.length]; }
function rangePick(min, max, seed) { return min + (seed % (max - min + 1)); }

async function chunkedInsert(conn, sql, values, chunkSize = BATCH) {
  // mysql2 supports `INSERT ... VALUES ?` with a nested array. We chunk
  // to keep packet size sane and to surface per-batch errors clearly.
  let inserted = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const [res] = await conn.query(sql, [slice]);
    inserted += res?.affectedRows || slice.length;
  }
  return inserted;
}

/* --------------------------------------------------------------------------
 * Data tables - kept inline so the seeder is self-contained
 * -------------------------------------------------------------------------- */

// 80 real-world tech companies (well-known names) + 80 startup-style
// generated names + 80 "<adj> <noun>" generated names = 240 unique.
const REAL_COMPANIES = [
  'Stripe', 'Plaid', 'Brex', 'Ramp', 'Notion', 'Figma', 'Linear', 'Vercel',
  'Webflow', 'Retool', 'Loom', 'Asana', 'Airtable', 'Datadog', 'Snowflake',
  'MongoDB', 'Elastic', 'HashiCorp', 'GitLab', 'GitHub', 'Atlassian',
  'Twilio', 'SendGrid', 'PagerDuty', 'Cloudflare', 'Fastly', 'New Relic',
  'Segment', 'Mixpanel', 'Amplitude', 'Heap', 'LaunchDarkly', 'Sentry',
  'Auth0', 'Okta', 'Snyk', 'Lacework', 'Tailscale', '1Password', 'Box',
  'Dropbox', 'Slack', 'Zoom', 'Calendly', 'Front', 'Intercom', 'Zendesk',
  'Freshworks', 'HubSpot', 'Mailchimp', 'ConvertKit', 'Klaviyo', 'Bevy',
  'Hopin', 'Discord', 'Anthropic', 'OpenAI', 'Cohere', 'Replicate',
  // Pakistan + South Asia
  'Systems Limited', 'NETSOL Technologies', 'Afiniti', '10Pearls', 'VentureDive',
  'Daraz', 'Bykea', 'Foodpanda Pakistan', 'Careem Pakistan', 'easypaisa',
  'JazzCash', 'Telenor Pakistan', 'Khaadi', 'Sapphire', 'Engro Corporation',
  'Lucky Cement', 'TPS Pakistan', 'Tintash', 'Arbisoft', 'Soliton Technologies',
  'Mindstorm Studios', 'Educative.io', 'PostEx', 'Airlift', 'TrukkApp',
];

const NIMBUS_FIRST = [
  'Nimbus', 'Cobalt', 'Reverie', 'Atlas', 'Bramble', 'Cypher', 'Drift',
  'Ember', 'Helix', 'Iris', 'Kestrel', 'Lumen', 'Marble', 'Onyx',
  'Plume', 'Quartz', 'Rivet', 'Sage', 'Tidal', 'Umber', 'Vela',
  'Willow', 'Xander', 'Yonder', 'Zephyr', 'Anchor', 'Beacon', 'Cinder',
  'Driftwood', 'Echo', 'Fjord', 'Glacier', 'Harbour', 'Indigo', 'Juniper',
  'Kindle', 'Lattice', 'Meridian', 'North', 'Orchid', 'Pebble', 'Quill',
  'Ridge', 'Solstice', 'Tundra', 'Vellum', 'Wayfinder', 'Zenith',
];
const NIMBUS_SECOND = [
  'Labs', 'AI', 'Robotics', 'Networks', 'Systems', 'Studio', 'Works',
  'Cloud', 'Bio', 'Health', 'Capital', 'Analytics', 'Logic', 'Data',
  'Compute', 'Sensor', 'Forge', 'Energy', 'Mobility', 'Optics',
];
const CITY_FIRST = [
  'Karachi', 'Lahore', 'Islamabad', 'San Francisco', 'New York', 'Austin',
  'Toronto', 'London', 'Berlin', 'Amsterdam', 'Bangalore', 'Mumbai',
  'Singapore', 'Dubai', 'Sydney',
];
const COUNTRY_FOR_CITY = {
  Karachi: 'Pakistan', Lahore: 'Pakistan', Islamabad: 'Pakistan',
  'San Francisco': 'USA', 'New York': 'USA', Austin: 'USA',
  Toronto: 'Canada', London: 'United Kingdom',
  Berlin: 'Germany', Munich: 'Germany',
  Amsterdam: 'Netherlands',
  Bangalore: 'India', Mumbai: 'India', Delhi: 'India',
  Singapore: 'Singapore', Dubai: 'United Arab Emirates', Sydney: 'Australia',
};

const INDUSTRIES = [
  'Software / SaaS', 'Fintech', 'Healthtech', 'E-commerce', 'AI / ML',
  'EdTech', 'Cybersecurity', 'Logistics', 'Media', 'Energy',
  'Climate Tech', 'Travel', 'Real Estate', 'Retail', 'Telecommunications',
];

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

function makeCompanyList() {
  const out = [];
  const seen = new Set();
  function add(name) {
    const slug = slugify(name);
    if (seen.has(slug)) return;
    seen.add(slug);
    out.push({ name, slug });
  }
  for (const n of REAL_COMPANIES) add(n);
  // Generated set 1: noun-suffix
  for (let i = 0; i < NIMBUS_FIRST.length && out.length < 160; i++) {
    add(`${NIMBUS_FIRST[i]} ${pick(NIMBUS_SECOND, i)}`);
  }
  // Generated set 2: "city-named" boutique studios
  for (let i = 0; i < CITY_FIRST.length * 6 && out.length < 240; i++) {
    const f = pick(CITY_FIRST, i);
    const s = pick(NIMBUS_SECOND, i * 3);
    add(`${f} ${s}`);
  }
  // Pad with combinations if needed
  let idx = 0;
  while (out.length < 240) {
    const name = `${pick(NIMBUS_FIRST, idx)} ${pick(NIMBUS_SECOND, idx + 7)} ${idx}`;
    add(name);
    idx += 1;
    if (idx > 10000) break;
  }
  return out.slice(0, 240);
}

/* --------------------------------------------------------------------------
 * Candidate name pools
 * -------------------------------------------------------------------------- */

const FIRST_NAMES = [
  // South Asia
  'Ali', 'Ahmed', 'Bilal', 'Hassan', 'Usman', 'Imran', 'Faisal', 'Saad',
  'Hamza', 'Zain', 'Daniyal', 'Owais', 'Raza', 'Salman', 'Tariq', 'Omar',
  'Abdullah', 'Ibrahim', 'Yousuf', 'Junaid', 'Bilawal', 'Ayan', 'Mehdi',
  'Fatima', 'Sara', 'Ayesha', 'Zainab', 'Maria', 'Hira', 'Mahnoor',
  'Iqra', 'Komal', 'Nida', 'Sana', 'Anum', 'Mehwish', 'Rabia', 'Madiha',
  'Asma', 'Saba', 'Nimra', 'Bushra', 'Hadia', 'Rida',
  // International
  'Maya', 'Daniel', 'Aisha', 'Tomas', 'Hannah', 'Ravi', 'Priya', 'Arjun',
  'Sanjay', 'Lakshmi', 'Karthik', 'Vivek', 'Neha', 'Pooja', 'Anjali',
  'Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin',
  'Lucas', 'Henry', 'Theodore', 'Jack', 'Levi', 'Alexander', 'Jackson',
  'Mateo', 'Daniel', 'Michael', 'Mason', 'Sebastian', 'Ethan', 'Logan',
  'Olivia', 'Emma', 'Charlotte', 'Amelia', 'Sophia', 'Isabella', 'Ava',
  'Mia', 'Evelyn', 'Harper', 'Luna', 'Camila', 'Gianna', 'Elizabeth',
  'Eleanor', 'Ella', 'Abigail', 'Sofia', 'Avery', 'Scarlett', 'Emily',
  'Aria', 'Penelope', 'Chloe', 'Layla', 'Mila',
  'Wei', 'Jing', 'Hao', 'Min', 'Lin', 'Yuki', 'Sakura', 'Hiro',
  'Takeshi', 'Hana', 'Jin', 'Soo', 'Min-Jun', 'Ji-woo',
  'Amara', 'Kwame', 'Zuri', 'Ade', 'Femi', 'Chidi', 'Adaeze',
];

const LAST_NAMES = [
  // South Asia
  'Khan', 'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Malik', 'Sheikh', 'Siddiqui',
  'Qureshi', 'Akhtar', 'Mahmood', 'Iqbal', 'Raza', 'Aslam', 'Rashid', 'Saeed',
  'Anwar', 'Javed', 'Mehta', 'Patel', 'Shah', 'Singh', 'Kumar', 'Sharma',
  'Gupta', 'Verma', 'Reddy', 'Rao', 'Nair', 'Iyer', 'Banerjee',
  // International
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Schmidt', 'Mueller', 'Fischer', 'Weber', 'Schneider',
  'Becker', 'Schulz', 'Hoffmann', 'Bauer', 'Kim', 'Park', 'Choi',
  'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Wu', 'Sato',
  'Suzuki', 'Tanaka', 'Watanabe',
];

const ROLES = [
  { title: 'Backend Engineer', skills: ['Node.js', 'Express', 'MySQL', 'Redis', 'Docker'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Senior Backend Engineer', skills: ['Node.js', 'Go', 'PostgreSQL', 'AWS', 'Kubernetes'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Frontend Engineer', skills: ['React', 'TypeScript', 'JavaScript', 'GraphQL'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Senior Frontend Engineer', skills: ['React', 'TypeScript', 'Node.js', 'GraphQL'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Full-Stack Engineer', skills: ['JavaScript', 'TypeScript', 'React', 'Node.js'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Mobile App Developer (iOS)', skills: ['Swift', 'iOS', 'GraphQL', 'REST'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Mobile App Developer (Android)', skills: ['Kotlin', 'Android', 'REST'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'QA Engineer', skills: ['Selenium', 'Cypress', 'Jest', 'Postman'], dept: 'QA', cat: 'Software Engineering' },
  { title: 'Senior QA Engineer', skills: ['Cypress', 'Playwright', 'CI/CD', 'API Testing'], dept: 'QA', cat: 'Software Engineering' },
  { title: 'DevOps Engineer', skills: ['Docker', 'Kubernetes', 'AWS', 'Terraform'], dept: 'DevOps', cat: 'Software Engineering' },
  { title: 'Senior DevOps Engineer', skills: ['Kubernetes', 'GCP', 'AWS', 'Terraform', 'CI/CD'], dept: 'DevOps', cat: 'Software Engineering' },
  { title: 'Site Reliability Engineer', skills: ['Linux', 'Kubernetes', 'Prometheus', 'Grafana'], dept: 'DevOps', cat: 'Software Engineering' },
  { title: 'UI/UX Designer', skills: ['Figma', 'Design Systems', 'Prototyping'], dept: 'Design', cat: 'Design' },
  { title: 'Senior Product Designer', skills: ['Figma', 'Product Strategy', 'Research'], dept: 'Design', cat: 'Design' },
  { title: 'Product Manager', skills: ['Product Strategy', 'Analytics', 'Discovery'], dept: 'Product', cat: 'Product Management' },
  { title: 'Senior Product Manager', skills: ['Roadmapping', 'B2B SaaS', 'Analytics'], dept: 'Product', cat: 'Product Management' },
  { title: 'Engineering Manager', skills: ['Leadership', 'Hiring', 'Backend', 'Coaching'], dept: 'Engineering', cat: 'Software Engineering' },
  { title: 'Data Analyst', skills: ['SQL', 'Python', 'Tableau', 'BigQuery'], dept: 'Data/Analytics', cat: 'Data Science' },
  { title: 'Data Engineer', skills: ['Python', 'Airflow', 'Spark', 'SQL'], dept: 'Data/Analytics', cat: 'Data Science' },
  { title: 'ML Engineer', skills: ['Python', 'PyTorch', 'AWS', 'MLOps'], dept: 'Data/Analytics', cat: 'Data Science' },
  { title: 'Marketing Executive', skills: ['SEO', 'Content Writing', 'Analytics'], dept: 'Marketing', cat: 'Marketing' },
  { title: 'Growth Marketing Manager', skills: ['Growth', 'SEO', 'Analytics', 'Paid Acquisition'], dept: 'Marketing', cat: 'Marketing' },
  { title: 'Sales Development Representative', skills: ['B2B Sales', 'Cold Outreach', 'CRM'], dept: 'Sales', cat: 'Sales' },
  { title: 'Account Executive', skills: ['B2B Sales', 'Demoing', 'Negotiation'], dept: 'Sales', cat: 'Sales' },
  { title: 'HR Executive', skills: ['Recruiting', 'HR Operations', 'Onboarding'], dept: 'HR', cat: 'Human Resources' },
  { title: 'Recruiter', skills: ['Sourcing', 'Interviewing', 'ATS'], dept: 'HR', cat: 'Human Resources' },
  { title: 'Finance Officer', skills: ['Accounting', 'Excel', 'Reporting'], dept: 'Finance', cat: 'Finance' },
  { title: 'FP&A Analyst', skills: ['Excel', 'Financial Modelling', 'SaaS Metrics'], dept: 'Finance', cat: 'Finance' },
  { title: 'Customer Support Specialist', skills: ['Zendesk', 'Communication', 'Triage'], dept: 'Customer Support', cat: 'Customer Support' },
  { title: 'Customer Success Manager', skills: ['Account Management', 'B2B SaaS', 'Onboarding'], dept: 'Customer Support', cat: 'Customer Support' },
  { title: 'Operations Associate', skills: ['Excel', 'Project Management', 'Process'], dept: 'Operations', cat: 'Operations' },
  { title: 'Operations Manager', skills: ['Project Management', 'Vendor Management', 'Process'], dept: 'Operations', cat: 'Operations' },
];

const EXP_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead', 'executive'];
const JOB_TYPES = ['full_time', 'full_time', 'full_time', 'contract', 'part_time'];
const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const AVAILABILITIES = ['immediate', 'two_weeks', 'one_month', 'negotiable'];
const PROFICIENCIES = ['intermediate', 'advanced', 'expert'];

/* --------------------------------------------------------------------------
 * Helpers that read existing reference data so we set FK columns correctly
 * -------------------------------------------------------------------------- */

async function loadCountryMap(conn) {
  const [rows] = await conn.query(`SELECT id, code, name FROM countries`);
  // Index by both code and humanised name (USA / United Kingdom)
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  // Add the aliases used elsewhere in the codebase.
  byName['USA'] = byCode['US'];
  byName['UK'] = byCode['GB'];
  byName['UAE'] = byCode['AE'];
  return { byCode, byName };
}

async function loadCityTimezones(conn) {
  const [rows] = await conn.query(`SELECT name, timezone FROM cities`);
  return Object.fromEntries(rows.map((r) => [r.name, r.timezone]));
}

async function loadSkillMap(conn) {
  const [rows] = await conn.query(`SELECT id, name FROM skills`);
  // Case-insensitive name -> id lookup so role data and DB don't have
  // to match casing perfectly.
  return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
}

async function ensureMissingSkills(conn, skillsNeeded) {
  const existing = await loadSkillMap(conn);
  const toInsert = [];
  for (const name of skillsNeeded) {
    if (!existing.has(name.toLowerCase())) toInsert.push(name);
  }
  if (!toInsert.length) return;
  // Use the same shape as seed.js upsertSkills so column defaults stay sane.
  for (const name of toInsert) {
    await conn.execute(
      `INSERT INTO skills (name, slug, category, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [name, slugify(name), null]
    );
  }
}

async function loadCategoryMap(conn) {
  const [rows] = await conn.query(`SELECT id, name FROM job_categories`);
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

/* --------------------------------------------------------------------------
 * Stage 1: companies
 * -------------------------------------------------------------------------- */

async function seedCompanies(conn) {
  const { byCode, byName } = await loadCountryMap(conn);
  const companies = makeCompanyList();
  const FOUNDED_YEARS = [2008, 2010, 2012, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];

  const rows = companies.map((c, i) => {
    const city = pick(CITY_FIRST, i);
    const country = COUNTRY_FOR_CITY[city] || 'USA';
    const country_id = byName[country] || byCode['US'];
    const industry = pick(INDUSTRIES, i + 3);
    const size = pick(COMPANY_SIZES, i + 1);
    const founded = pick(FOUNDED_YEARS, i + 5);
    const tagline = `${industry} company building reliable products for global teams.`;
    const description = [
      `${c.name} is a ${industry.toLowerCase()} company based in ${city}, ${country}.`,
      `Founded in ${founded}, the team currently sits in the ${size} headcount band.`,
      `We hire across engineering, product, design, data, and go-to-market roles.`,
    ].join(' ');
    const websiteHost = slugify(c.name).replace(/-/g, '');
    const website = `https://www.${websiteHost}.example.com`;
    return [
      null,                       // owner_user_id
      c.name,
      c.slug,
      tagline,
      description,
      industry,
      size,
      website,
      null,                       // logo_url
      MARKER,                     // cover_url - sentinel for rollback
      city,
      country,
      founded,
      'verified',                 // verification_status
      i < 16 ? 1 : 0,             // is_featured (top 16)
      'active',                   // status
    ];
  });

  const sql = `INSERT INTO companies
    (owner_user_id, name, slug, tagline, description, industry, size, website, logo_url, cover_url,
     location, country, founded_year, verification_status, is_featured, status)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      name = VALUES(name), tagline = VALUES(tagline), description = VALUES(description),
      industry = VALUES(industry), size = VALUES(size), website = VALUES(website),
      cover_url = VALUES(cover_url), location = VALUES(location), country = VALUES(country),
      founded_year = VALUES(founded_year), verification_status = VALUES(verification_status),
      is_featured = VALUES(is_featured), status = VALUES(status)`;
  const inserted = await chunkedInsert(conn, sql, rows, 50);
  logger.info(`Bulk seed: companies upserted (${inserted} affected rows)`);

  // Backfill country_id so location-based search ranks them properly.
  await conn.query(
    `UPDATE companies c LEFT JOIN countries co ON co.name = c.country
     SET c.country_id = co.id
     WHERE c.country_id IS NULL`
  ).catch(() => null); // column may not exist on older schemas

  // Hand back the slug list so the candidate/job stage can map name -> id.
  const slugs = companies.map((c) => c.slug);
  const [companyRows] = await conn.query(
    `SELECT id, slug FROM companies WHERE slug IN (?)`,
    [slugs]
  );
  return companyRows; // [{ id, slug }, ...]
}

/* --------------------------------------------------------------------------
 * Stage 2: candidates (users + candidate_profiles + candidate_skills)
 * -------------------------------------------------------------------------- */

async function seedCandidates(conn, total = 240) {
  const { byName, byCode } = await loadCountryMap(conn);
  const cityTz = await loadCityTimezones(conn);
  const skillMap = await loadSkillMap(conn);
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Step A: users (bulk INSERT IGNORE on email)
  const userRows = [];
  const meta = []; // mirror data we need for profile + skills
  for (let i = 0; i < total; i++) {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 7);
    const full = `${first} ${last}`;
    const email = `${slugify(first)}.${slugify(last)}.${i + 1}@candidates.matchhire.test`;
    const role = pick(ROLES, i);
    const city = pick(CITY_FIRST, i + 2);
    const country = COUNTRY_FOR_CITY[city] || 'USA';
    const phoneSuffix = String(3000000 + i).padStart(7, '0');
    const phone = country === 'Pakistan' ? `+92 3${phoneSuffix.slice(1, 3)} ${phoneSuffix}` : `+1 ${phoneSuffix.slice(0, 3)}-${phoneSuffix.slice(3)}`;

    userRows.push([
      full,
      email,
      phone,
      password_hash,
      'candidate',
      'active',
      MARKER,                       // avatar_url - sentinel for rollback
    ]);
    meta.push({ email, full, first, last, role, city, country, idx: i });
  }

  const userSql = `INSERT INTO users
    (full_name, email, phone, password_hash, role, status, avatar_url)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone = VALUES(phone),
      avatar_url = VALUES(avatar_url),
      status = VALUES(status)`;
  await chunkedInsert(conn, userSql, userRows, 100);
  await conn.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW())
     WHERE avatar_url = ? AND email_verified_at IS NULL`,
    [MARKER]
  );
  logger.info(`Bulk seed: candidate users upserted (${userRows.length})`);

  // Step B: load resulting ids back, keyed by email
  const emails = meta.map((m) => m.email);
  const [rows] = await conn.query(
    `SELECT id, email FROM users WHERE email IN (?)`,
    [emails]
  );
  const idByEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));

  // Step C: candidate_profiles (one row per user) - bulk insert.
  const profileRows = [];
  for (const m of meta) {
    const user_id = idByEmail[m.email];
    if (!user_id) continue;
    const yrs = rangePick(1, 12, m.idx);
    const salaryMin = m.country === 'Pakistan' ? 12000 + (m.idx % 20) * 1000 : 60000 + (m.idx % 50) * 2000;
    const salaryMax = salaryMin + (yrs * 4000);
    const country_id = byName[m.country] || byCode['US'];
    const profile_strength = 60 + ((m.idx * 7) % 35);
    const summary = `${m.role.title} with ${yrs}+ years of experience across ${m.role.skills.slice(0, 3).join(', ')}. Currently based in ${m.city}.`;
    // Education is intentionally NULL here: writing a synthesised
    // "BS in Computer Science · X University · 20YY" string pollutes
    // every seeded candidate's profile with content they never
    // entered, and that fake row then surfaces on the candidate's
    // own Profile page. Real candidates fill this in by typing
    // (Profile.jsx) or by uploading a resume (resume parser). Leaving
    // the seed value NULL means the textarea starts empty, the
    // placeholder shows, and only what the candidate actually types
    // gets saved. See `scripts/clear-seeded-education.js` for the
    // one-off cleanup applied to existing seeded rows.
    const education = null;

    profileRows.push([
      user_id,
      m.role.title,                 // headline
      summary,
      m.role.title,                 // current_title
      yrs,
      m.city,                       // location
      m.city,                       // city
      m.country,
      country_id,
      cityTz[m.city] || null,
      pick([1, 1, 1, 0], m.idx),    // open_to_remote
      salaryMin,
      salaryMax,
      m.country === 'Pakistan' ? 'PKR' : 'USD',
      pick(AVAILABILITIES, m.idx),
      null,                         // resume_url
      null,                         // portfolio_url
      `https://linkedin.com/in/${slugify(m.full)}-${m.idx}`,
      m.role.title.toLowerCase().includes('engineer') ? `https://github.com/${slugify(m.first)}${m.idx}` : null,
      education,
      `${m.role.title} at ${pick(REAL_COMPANIES, m.idx + 1)} (${2018 + (m.idx % 6)} - present)`,
      'English',                    // languages
      profile_strength,
      1,                            // is_public
    ]);
  }
  const profileSql = `INSERT INTO candidate_profiles
    (user_id, headline, summary, current_title, years_experience,
     location, city, country, country_id, timezone, open_to_remote,
     expected_salary_min, expected_salary_max, salary_currency, availability,
     resume_url, portfolio_url, linkedin_url, github_url,
     education, experience, languages, profile_strength, is_public)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      headline = VALUES(headline), summary = VALUES(summary),
      current_title = VALUES(current_title), years_experience = VALUES(years_experience),
      location = VALUES(location), city = VALUES(city), country = VALUES(country),
      country_id = VALUES(country_id), timezone = VALUES(timezone),
      open_to_remote = VALUES(open_to_remote),
      expected_salary_min = VALUES(expected_salary_min),
      expected_salary_max = VALUES(expected_salary_max),
      salary_currency = VALUES(salary_currency),
      availability = VALUES(availability),
      linkedin_url = VALUES(linkedin_url),
      github_url = VALUES(github_url),
      education = VALUES(education),
      experience = VALUES(experience),
      languages = VALUES(languages),
      profile_strength = VALUES(profile_strength),
      is_public = VALUES(is_public)`;
  await chunkedInsert(conn, profileSql, profileRows, 100);
  logger.info(`Bulk seed: candidate profiles upserted (${profileRows.length})`);

  // Step D: candidate_skills - one row per (user, skill).
  const skillRows = [];
  for (const m of meta) {
    const user_id = idByEmail[m.email];
    if (!user_id) continue;
    for (const skillName of m.role.skills) {
      const sid = skillMap.get(skillName.toLowerCase());
      if (!sid) continue;
      skillRows.push([
        user_id,
        sid,
        pick(PROFICIENCIES, m.idx + sid),
        rangePick(1, 8, m.idx + sid),
      ]);
    }
  }
  const skillSql = `INSERT INTO candidate_skills
    (candidate_user_id, skill_id, proficiency, years_experience)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      proficiency = VALUES(proficiency),
      years_experience = VALUES(years_experience)`;
  await chunkedInsert(conn, skillSql, skillRows, 200);
  logger.info(`Bulk seed: candidate_skills upserted (${skillRows.length})`);

  return userRows.length;
}

/* --------------------------------------------------------------------------
 * Stage 3: jobs (cycling through every company so the catalogue feels real)
 * -------------------------------------------------------------------------- */

async function seedJobs(conn, companies, total = 240) {
  const { byName, byCode } = await loadCountryMap(conn);
  const cityTz = await loadCityTimezones(conn);
  const cats = await loadCategoryMap(conn);

  // `jobs.slug` has no unique index in the existing schema, so we can't
  // rely on ON DUPLICATE KEY UPDATE for idempotency. Instead, every
  // bulk-inserted job uses a deterministic slug pattern ending in
  // `-bulk-<i>` - we wipe rows matching that pattern before reinsert.
  // FK cascades on applications / favorites / interviews keep child
  // tables consistent.
  const [delRes] = await conn.query(
    `DELETE FROM jobs WHERE slug LIKE '%-bulk-%'`
  );
  if (delRes?.affectedRows) {
    logger.info(`Bulk seed: cleared ${delRes.affectedRows} prior bulk-tagged jobs before reinsert`);
  }

  const rows = [];
  for (let i = 0; i < total; i++) {
    const role = pick(ROLES, i);
    const company = companies[i % companies.length];
    const city = pick(CITY_FIRST, i + 3);
    const country = COUNTRY_FOR_CITY[city] || 'USA';
    const country_id = byName[country] || byCode['US'];
    const work_mode = pick(WORK_MODES, i + 1);
    const is_remote = work_mode === 'remote' ? 1 : 0;
    const is_global_remote = work_mode === 'remote' && (i % 3 === 0) ? 1 : 0;
    const exp_level = pick(EXP_LEVELS, i + role.title.length);
    const job_type = pick(JOB_TYPES, i);
    const baseSalary = country === 'Pakistan' ? 18000 : 90000;
    const salaryMin = baseSalary + (i % 30) * 1500;
    const salaryMax = salaryMin + 40000;
    const slug = `${slugify(role.title)}-${company.slug}-bulk-${i}`;
    const responsibilities = [
      `Own the ${role.dept.toLowerCase()} workflow end-to-end alongside cross-functional peers.`,
      `Ship measurable outcomes against a quarterly roadmap.`,
      `Coach junior teammates and lift the bar on code/design reviews.`,
    ].join('\n');
    const requirements = [
      `${exp_level.charAt(0).toUpperCase() + exp_level.slice(1)}-level experience in ${role.dept.toLowerCase()}.`,
      `Hands-on with ${role.skills.slice(0, 3).join(', ')}.`,
      `Comfortable in a fast-moving distributed environment.`,
    ].join('\n');
    const description = `${role.title} role at ${company.slug.replace(/-/g, ' ')} based in ${city}, ${country}. Department: ${role.dept}. Work mode: ${work_mode}.`;
    rows.push([
      company.id,
      null,                                // posted_by_user_id
      cats[role.cat] || null,
      role.title,
      slug,
      description,
      responsibilities,
      requirements,
      'Healthcare, equity, learning stipend, generous PTO.',
      job_type,
      exp_level,
      city,                                // location
      city,                                // city
      country,
      country_id,
      cityTz[city] || null,
      is_remote,
      work_mode,
      is_global_remote,
      salaryMin,
      salaryMax,
      country === 'Pakistan' ? 'USD' : 'USD',
      'year',
      role.skills.join(','),               // skills_tags
      null,                                // application_deadline
      (i % 4) + 1,                         // vacancies
      'open',
      i < 24 ? 1 : 0,                      // is_featured (first 24)
      'approved',                          // admin_status
      new Date(Date.now() - (i * 3 * 3600 * 1000)), // published_at staggered
    ]);
  }
  const sql = `INSERT INTO jobs
    (company_id, posted_by_user_id, category_id, title, slug, description,
     responsibilities, requirements, benefits, job_type, experience_level,
     location, city, country, country_id, timezone, is_remote, work_mode, is_global_remote,
     salary_min, salary_max, salary_currency, salary_period, skills_tags,
     application_deadline, vacancies, status, is_featured, admin_status, published_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      title = VALUES(title), description = VALUES(description),
      responsibilities = VALUES(responsibilities), requirements = VALUES(requirements),
      benefits = VALUES(benefits), job_type = VALUES(job_type),
      experience_level = VALUES(experience_level),
      location = VALUES(location), city = VALUES(city), country = VALUES(country),
      country_id = VALUES(country_id), timezone = VALUES(timezone),
      is_remote = VALUES(is_remote), work_mode = VALUES(work_mode),
      is_global_remote = VALUES(is_global_remote),
      salary_min = VALUES(salary_min), salary_max = VALUES(salary_max),
      salary_currency = VALUES(salary_currency), salary_period = VALUES(salary_period),
      skills_tags = VALUES(skills_tags),
      vacancies = VALUES(vacancies),
      status = VALUES(status), is_featured = VALUES(is_featured),
      admin_status = VALUES(admin_status), published_at = VALUES(published_at)`;
  await chunkedInsert(conn, sql, rows, 50);
  logger.info(`Bulk seed: jobs upserted (${rows.length})`);
}

/* --------------------------------------------------------------------------
 * Rollback - remove only the bulk-tagged rows; cascades clean up children
 * -------------------------------------------------------------------------- */

async function rollback(conn) {
  // Jobs and employer_profiles cascade off companies.id
  const [r1] = await conn.query(`DELETE FROM companies WHERE cover_url = ?`, [MARKER]);
  // candidate_profiles + candidate_skills cascade off users.id
  const [r2] = await conn.query(
    `DELETE FROM users WHERE avatar_url = ? AND role = 'candidate'`, [MARKER]
  );
  logger.info(`Bulk seed rollback: companies removed=${r1.affectedRows}, candidates removed=${r2.affectedRows}`);
}

/* --------------------------------------------------------------------------
 * Entry point
 * -------------------------------------------------------------------------- */

async function run({ mode = 'apply' } = {}) {
  const conn = await getConnection();
  try {
    if (mode === 'rollback') {
      await rollback(conn);
      return;
    }

    // Make sure the skills the role data references exist (otherwise
    // candidate_skills + jobs.skills_tags would point to missing names).
    const neededSkills = Array.from(new Set(ROLES.flatMap((r) => r.skills)));
    await ensureMissingSkills(conn, neededSkills);

    const companies = await seedCompanies(conn);
    const candidateCount = await seedCandidates(conn, 240);
    await seedJobs(conn, companies, 240);

    // Final counts so the seeder logs its own success metric.
    const [[cc]] = await conn.query(`SELECT COUNT(*) AS n FROM companies`);
    const [[uu]] = await conn.query(`SELECT COUNT(*) AS n FROM users WHERE role='candidate'`);
    const [[jj]] = await conn.query(`SELECT COUNT(*) AS n FROM jobs`);
    logger.info(`Bulk seed complete. counts: companies=${cc.n}, candidates=${uu.n}, jobs=${jj.n} (candidates upserted this run=${candidateCount})`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const mode = (process.argv[2] || 'apply').toLowerCase();
  run({ mode })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Bulk seed failed', { error: err.message, stack: err.stack });
      process.exit(1);
    });
}

module.exports = { run };
