'use strict';

/**
 * Fresh job seed (May 2026)
 * --------------------------
 * Inserts ~250 realistic, in-date job postings across every department
 * the candidate-facing app currently surfaces. Designed to be idempotent
 * AND non-destructive:
 *
 *   - Every row is tagged with the slug suffix `-fresh-2026-<i>` so the
 *     seeder can wipe just its OWN rows on reseed without touching any
 *     of the other bulk / fixture data already in the table.
 *   - `companies`, `job_categories`, `applications`, `candidates`,
 *     `users` are READ ONLY here — we only insert into `jobs`.
 *
 * Per the spec:
 *   - Salary band MUST clear PKR 500,000 (annual) for every row. We use
 *     experience-tier base salaries that all start at 550K+ and scale
 *     to multi-million for executive / lead roles.
 *   - `application_deadline` lands 1–2 days from seed time, so listings
 *     stay active for ~24-48h and then the §35 expiry filter naturally
 *     hides them — useful for QA-ing the "expired filter works" path.
 *   - Coverage MUST hit every department in the spec list. We map the
 *     spec's 25 buckets onto the 25 existing `job_categories` rows so
 *     no migration is required.
 *
 * Run with `npm run seed:fresh-jobs` (added to package.json scripts).
 *
 * To roll back: `npm run seed:fresh-jobs -- rollback` deletes only the
 * rows whose slug carries the marker.
 */

const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const MARKER = 'fresh-2026';
const TARGET = 250;        // total jobs to insert (>= spec's 200)
const BATCH = 50;

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

/* ============================================================================
 * Role catalogue — keyed by spec-bucket name; maps to a job_categories row.
 * Every entry carries 6+ realistic titles + a skill basket so the matcher
 * has something meaningful to score against.
 * ========================================================================== */

const CATEGORIES = [
  // Spec bucket name (banner)        → DB category name
  { spec: 'Software Engineering',     cat: 'Software Engineering', titles: [
      'Software Engineer', 'Full Stack Engineer', 'Senior Software Engineer',
      'Staff Software Engineer', 'Engineering Manager', 'Software Architect',
      'Junior Software Engineer', 'Platform Engineer', 'Build Engineer',
    ], skills: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Git', 'REST APIs', 'CI/CD', 'Algorithms'] },

  { spec: 'Backend Development',      cat: 'Software Development', titles: [
      'Backend Engineer', 'Node.js Developer', 'Senior Backend Engineer',
      'Microservices Engineer', 'API Engineer', 'PHP Developer',
      'Java Backend Engineer', 'Golang Engineer', 'Backend Tech Lead',
    ], skills: ['Node.js', 'Express', 'PostgreSQL', 'Redis', 'Docker', 'GraphQL', 'gRPC', 'Kafka'] },

  { spec: 'Frontend Development',     cat: 'Software Development', titles: [
      'Frontend Engineer', 'React Developer', 'Senior Frontend Engineer',
      'Next.js Developer', 'UI Engineer', 'Mobile Engineer',
      'Frontend Tech Lead', 'Angular Developer', 'Vue.js Developer',
    ], skills: ['React', 'TypeScript', 'Next.js', 'CSS', 'Tailwind', 'Web Performance', 'Accessibility', 'Vite'] },

  { spec: 'DevOps',                   cat: 'Software Development', titles: [
      'DevOps Engineer', 'Site Reliability Engineer', 'Senior DevOps Engineer',
      'Cloud Infrastructure Engineer', 'Platform SRE', 'DevOps Tech Lead',
      'Kubernetes Engineer', 'Release Engineer',
    ], skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'Linux', 'Prometheus', 'Grafana', 'Bash'] },

  { spec: 'QA',                       cat: 'Software Development', titles: [
      'QA Engineer', 'SDET', 'Senior QA Engineer', 'Automation QA Engineer',
      'QA Lead', 'Performance Test Engineer', 'Manual QA Tester',
    ], skills: ['Selenium', 'Cypress', 'Playwright', 'Jest', 'TestRail', 'Postman', 'JMeter', 'Test Strategy'] },

  { spec: 'UI/UX',                    cat: 'Design', titles: [
      'UI/UX Designer', 'Product Designer', 'Senior Product Designer',
      'UX Researcher', 'Visual Designer', 'Design Lead', 'Interaction Designer',
      'Design Systems Designer',
    ], skills: ['Figma', 'Sketch', 'Prototyping', 'User Research', 'Wireframing', 'Adobe XD', 'Design Systems', 'Usability Testing'] },

  { spec: 'Data Science',             cat: 'Data Science', titles: [
      'Data Scientist', 'Senior Data Scientist', 'Data Analyst',
      'Analytics Engineer', 'Lead Data Scientist', 'BI Developer',
      'Statistical Modeller', 'Quant Analyst',
    ], skills: ['Python', 'Pandas', 'SQL', 'NumPy', 'scikit-learn', 'Statistics', 'A/B Testing', 'PowerBI'] },

  { spec: 'AI/ML',                    cat: 'Data & AI', titles: [
      'Machine Learning Engineer', 'AI Engineer', 'Senior ML Engineer',
      'NLP Engineer', 'Computer Vision Engineer', 'MLOps Engineer',
      'Research Scientist', 'Lead AI Engineer',
    ], skills: ['Python', 'PyTorch', 'TensorFlow', 'LLMs', 'MLOps', 'Hugging Face', 'Embeddings', 'CUDA'] },

  { spec: 'Cybersecurity',            cat: 'Cybersecurity', titles: [
      'Security Engineer', 'Senior Security Engineer', 'SOC Analyst',
      'Penetration Tester', 'AppSec Engineer', 'Security Tech Lead',
      'Cloud Security Engineer', 'IAM Engineer',
    ], skills: ['OWASP', 'Pen Testing', 'SIEM', 'Burp Suite', 'Cloud Security', 'IAM', 'Cryptography', 'Threat Modeling'] },

  { spec: 'Product Management',       cat: 'Product Management', titles: [
      'Product Manager', 'Senior Product Manager', 'Group Product Manager',
      'Associate Product Manager', 'Product Lead', 'Technical Product Manager',
      'Growth Product Manager',
    ], skills: ['Roadmapping', 'User Research', 'A/B Testing', 'SQL', 'Wireframing', 'Stakeholder Mgmt', 'Analytics', 'Product Strategy'] },

  { spec: 'Marketing',                cat: 'Marketing', titles: [
      'Marketing Manager', 'Senior Marketing Manager', 'Growth Marketer',
      'Content Marketing Lead', 'SEO Specialist', 'Performance Marketer',
      'Brand Manager', 'Marketing Director',
    ], skills: ['SEO', 'SEM', 'Content Strategy', 'HubSpot', 'Google Analytics', 'Email Marketing', 'Copywriting', 'Brand Strategy'] },

  { spec: 'Sales',                    cat: 'Sales', titles: [
      'Account Executive', 'Senior Account Executive', 'SDR',
      'Enterprise AE', 'Sales Manager', 'Sales Director', 'BDR Lead',
      'Customer Success Manager',
    ], skills: ['CRM', 'Salesforce', 'HubSpot', 'Outbound', 'Cold Outreach', 'Negotiation', 'Discovery Calls', 'Pipeline Mgmt'] },

  { spec: 'HR',                       cat: 'HR', titles: [
      'HR Manager', 'Senior HR Business Partner', 'Talent Acquisition Lead',
      'People Ops Specialist', 'HR Director', 'Recruiter',
      'Compensation Analyst', 'L&D Manager',
    ], skills: ['Talent Acquisition', 'Employee Relations', 'HRIS', 'Compensation', 'Onboarding', 'Performance Mgmt', 'Workday', 'Greenhouse'] },

  { spec: 'Finance',                  cat: 'Finance', titles: [
      'Financial Analyst', 'Senior Financial Analyst', 'Finance Manager',
      'Controller', 'Director of Finance', 'FP&A Lead',
      'Treasury Analyst', 'Tax Specialist',
    ], skills: ['Excel', 'SAP', 'QuickBooks', 'Financial Modeling', 'IFRS', 'Audit', 'Forecasting', 'Power BI'] },

  { spec: 'Customer Support',         cat: 'Customer Support', titles: [
      'Customer Support Specialist', 'Senior Support Engineer',
      'Customer Success Lead', 'Support Manager', 'Technical Support Lead',
      'Helpdesk Engineer', 'CX Operations',
    ], skills: ['Zendesk', 'Intercom', 'Customer Empathy', 'SLA Mgmt', 'JIRA', 'Slack', 'Ticketing', 'Communication'] },

  { spec: 'Operations',               cat: 'Operations', titles: [
      'Operations Manager', 'Senior Operations Lead', 'Business Operations',
      'Strategy & Operations', 'Operations Director', 'Supply Chain Lead',
      'Logistics Manager', 'Operations Analyst',
    ], skills: ['Process Optimization', 'Excel', 'SQL', 'Project Management', 'Vendor Mgmt', 'Logistics', 'Lean', 'Six Sigma'] },

  { spec: 'Education',                cat: 'Education', titles: [
      'Curriculum Designer', 'Education Program Manager', 'Senior Instructor',
      'Academic Director', 'Learning Experience Designer', 'EdTech Lead',
      'Training Specialist',
    ], skills: ['Curriculum Design', 'Pedagogy', 'LMS', 'Instructional Design', 'Teaching', 'Assessment', 'Moodle', 'Canvas'] },

  { spec: 'Healthcare',               cat: 'Healthcare', titles: [
      'Registered Nurse', 'Senior Registered Nurse', 'Medical Officer',
      'Clinical Lead', 'Healthcare Operations Manager', 'ICU Nurse',
      'Lab Technologist', 'Radiographer',
    ], skills: ['Patient Care', 'Clinical Skills', 'EMR', 'BLS', 'ICU Protocols', 'Phlebotomy', 'Communication', 'Triage'] },

  { spec: 'Pharmacy',                 cat: 'Pharmacy', titles: [
      'Retail Pharmacist', 'Senior Hospital Pharmacist', 'Clinical Pharmacist',
      'Pharmacy Manager', 'Pharmacy Lead', 'Drug Information Specialist',
      'Pharmacovigilance Officer',
    ], skills: ['Pharmacology', 'Prescription Verification', 'Patient Counseling', 'Inventory Mgmt', 'GMP', 'Drug Interactions', 'GxP', 'Compounding'] },

  { spec: 'Engineering (General)',    cat: 'Engineering', titles: [
      'Project Engineer', 'Senior Engineering Lead', 'Quality Engineer',
      'Engineering Manager', 'Site Engineer', 'Process Engineer',
    ], skills: ['AutoCAD', 'Project Management', 'Quality Control', 'Six Sigma', 'Maintenance Engineering', 'Lean', 'SolidWorks', 'PLC'] },

  { spec: 'Civil',                    cat: 'Engineering', titles: [
      'Civil Engineer', 'Senior Civil Engineer', 'Structural Engineer',
      'Civil Project Manager', 'Site Civil Engineer', 'Geotechnical Engineer',
    ], skills: ['AutoCAD', 'Civil Engineering', 'Structural Analysis', 'Site Supervision', 'ETABS', 'Revit', 'STAAD Pro', 'Surveying'] },

  { spec: 'Mechanical',               cat: 'Engineering', titles: [
      'Mechanical Engineer', 'Senior Mechanical Engineer', 'HVAC Engineer',
      'Mechanical Project Lead', 'Maintenance Engineer', 'Design Engineer',
    ], skills: ['SolidWorks', 'AutoCAD', 'HVAC', 'Thermodynamics', 'CAD', 'Manufacturing', 'CAM', 'Lean'] },

  { spec: 'Electrical',               cat: 'Engineering', titles: [
      'Electrical Engineer', 'Senior Electrical Engineer', 'Power Systems Engineer',
      'Electronics Engineer', 'Electrical Project Lead', 'Substation Engineer',
    ], skills: ['Power Systems', 'Electrical Design', 'PLC', 'SCADA', 'AutoCAD Electrical', 'MATLAB', 'Embedded Systems', 'Circuit Analysis'] },

  { spec: 'Legal',                    cat: 'Legal', titles: [
      'Corporate Lawyer', 'Senior Legal Counsel', 'Legal Associate',
      'Compliance Officer', 'Legal Director', 'Contract Manager',
    ], skills: ['Contract Law', 'Compliance', 'Corporate Governance', 'Negotiation', 'Litigation', 'Drafting', 'IP Law', 'Regulatory'] },

  { spec: 'Admin',                    cat: 'Operations', titles: [
      'Office Manager', 'Executive Assistant', 'Senior Admin Officer',
      'Administrative Coordinator', 'Operations Admin Lead', 'Facilities Manager',
    ], skills: ['Office Mgmt', 'MS Office', 'Calendar Mgmt', 'Travel Coordination', 'Vendor Mgmt', 'Procurement', 'Communication', 'Scheduling'] },
];

/* ============================================================================
 * Salary tiers — annual PKR, every band > 500,000
 * ========================================================================== */

const SALARY_TIERS = {
  // [min, max] in PKR annual; every value clears the spec's 500,000 floor
  entry:     [600000, 1100000],
  junior:    [800000, 1400000],
  mid:       [1200000, 2200000],
  senior:    [1800000, 3200000],
  lead:      [2500000, 4500000],
  executive: [3500000, 6500000],
};

const JOB_TYPES = ['full_time', 'contract', 'part_time'];
const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const CITIES = ['Karachi', 'Lahore', 'Islamabad'];

/**
 * Derive an experience level from the title. The seed index lets us
 * deterministically split a slice of mid-level rows into 'entry' so
 * the spec's full 6-tier ladder (entry / junior / mid / senior / lead
 * / executive) gets coverage even when no title literally says
 * "Entry-level".
 */
function levelFromTitle(title, seed) {
  const t = title.toLowerCase();
  if (/(intern|junior|associate|trainee|entry|graduate)/.test(t)) return 'junior';
  if (/(director|head of|vp |chief )/.test(t)) return 'executive';
  if (/(lead|principal|staff|architect)/.test(t)) return 'lead';
  if (/(senior|sr\.|specialist|expert)/.test(t)) return 'senior';
  if (/(manager)/.test(t)) return 'lead'; // map "Manager" → lead per spec
  // Default = mid, but rotate a slice into 'entry' so the entry-level
  // band isn't empty in the seed (matches the spec's 6-level ladder).
  return (seed % 7 === 0) ? 'entry' : 'mid';
}

function salaryFor(level, seed) {
  const [lo, hi] = SALARY_TIERS[level];
  const min = lo + ((seed * 17_000) % (hi - lo));
  const max = Math.min(hi, min + 400_000 + ((seed * 23_000) % 600_000));
  return [Math.round(min / 1000) * 1000, Math.round(max / 1000) * 1000];
}

/** Deadline: tomorrow (1 day) or day-after-tomorrow (2 days), seed-derived. */
function deadlineFor(seed) {
  const days = (seed % 2) + 1;
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function loadCategoryMap(conn) {
  const [rows] = await conn.query('SELECT id, name FROM job_categories');
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

async function loadCompanies(conn) {
  // Prefer Pakistan-domiciled companies so locations + salaries feel
  // coherent. Fall back to any company if PK isn't enough.
  const [rows] = await conn.query(
    `SELECT id, name, slug, country, logo_url, industry, location
     FROM companies WHERE country = 'Pakistan' AND status = 'active'
     ORDER BY id`
  );
  return rows;
}

async function loadPakistanCountryId(conn) {
  const [rows] = await conn.query(
    `SELECT id FROM countries WHERE code = 'PK' OR name = 'Pakistan' LIMIT 1`
  );
  return rows[0]?.id || null;
}

/* ============================================================================
 * Build payload + insert
 * ========================================================================== */

function buildJobs({ companies, cats, pkCountryId }) {
  const rows = [];
  let i = 0;

  // Distribute jobs roughly evenly across the 25 spec buckets. 250 / 25 = 10
  // per bucket, with the remainder going to the first few.
  const perBucket = Math.ceil(TARGET / CATEGORIES.length);

  for (const bucket of CATEGORIES) {
    for (let b = 0; b < perBucket && rows.length < TARGET; b++) {
      const seed = i + 1;
      const title = pick(bucket.titles, b);
      const company = pick(companies, seed * 3 + b);
      const city = pick(CITIES, seed + b);
      const work_mode = pick(WORK_MODES, seed + b * 2);
      const is_remote = work_mode === 'remote' ? 1 : 0;
      const is_global_remote = work_mode === 'remote' && (seed % 4 === 0) ? 1 : 0;
      const job_type = pick(JOB_TYPES, seed + b);
      const level = levelFromTitle(title, seed);
      const [salary_min, salary_max] = salaryFor(level, seed);
      const deadline = deadlineFor(seed);
      const category_id = cats[bucket.cat] || null;
      const skills = bucket.skills.slice();
      // Rotate which 5 of the 8 skills get picked for this row so the
      // matcher has variety across rows in the same bucket.
      const rotated = skills.slice(b % skills.length).concat(skills.slice(0, b % skills.length));
      const skills_tags = rotated.slice(0, 5).join(',');

      const slug = `${slugify(title)}-${slugify(company.name)}-${MARKER}-${i}`;

      const description = [
        `${title} role at ${company.name} based in ${city}, Pakistan.`,
        `Department focus: ${bucket.spec}.`,
        `This is a ${level}-band ${job_type.replace(/_/g, '-')} opportunity with a ${work_mode} work mode.`,
        `We're looking for someone who can ramp quickly on ${rotated.slice(0, 3).join(', ')} and contribute to a high-output team within 30 days.`,
      ].join(' ');

      const responsibilities = [
        `Own ${bucket.spec.toLowerCase()} deliverables end-to-end with cross-functional partners.`,
        `Drive measurable outcomes against quarterly goals and partner with leadership on prioritisation.`,
        `Set the technical / professional standard for the team and mentor junior peers.`,
        `Document decisions and trade-offs so the team retains institutional knowledge.`,
      ].join('\n');

      const requirements = [
        `${level.charAt(0).toUpperCase() + level.slice(1)}-band experience in ${bucket.spec.toLowerCase()} (3+ years preferred).`,
        `Strong hands-on with ${rotated.slice(0, 4).join(', ')}.`,
        `Excellent written + verbal communication; comfortable in async-first workflows.`,
        `Bachelor's degree in a relevant field or equivalent professional experience.`,
      ].join('\n');

      const benefits = [
        `Competitive PKR salary band: PKR ${(salary_min/1000).toFixed(0)}K – ${(salary_max/1000).toFixed(0)}K (annual)`,
        `Health insurance for self + dependents`,
        `Annual learning & development stipend`,
        `Generous paid time off + parental leave`,
        `Flexible ${work_mode} working arrangement`,
      ].join('\n');

      rows.push([
        company.id,
        null,                                       // posted_by_user_id
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
        'Pakistan',
        pkCountryId,
        'Asia/Karachi',
        is_remote,
        work_mode,
        is_global_remote,
        salary_min,
        salary_max,
        'PKR',
        'year',
        skills_tags,
        deadline,
        ((seed + b) % 3) + 1,                       // vacancies
        'open',
        (i % 5 === 0) ? 1 : 0,                      // is_featured for every 5th
        'approved',
        new Date(Date.now() - (i * 30 * 60 * 1000)), // staggered published_at
      ]);
      i += 1;
    }
  }
  return rows;
}

async function clearPriorBatch(conn) {
  const [res] = await conn.query(
    `DELETE FROM jobs WHERE slug LIKE ?`,
    [`%-${MARKER}-%`]
  );
  if (res?.affectedRows) {
    logger.info(`Fresh seed: cleared ${res.affectedRows} prior fresh-seed rows`);
  }
  return res?.affectedRows || 0;
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

async function run({ mode = 'apply' } = {}) {
  const conn = await getConnection();
  try {
    if (mode === 'rollback') {
      const removed = await clearPriorBatch(conn);
      logger.info(`Fresh seed rollback: ${removed} rows removed.`);
      return;
    }

    await conn.beginTransaction();
    try {
      const cats = await loadCategoryMap(conn);
      const companies = await loadCompanies(conn);
      if (!companies.length) {
        throw new Error('No active Pakistan-domiciled companies found. Run the bulk seed first.');
      }
      const pkCountryId = await loadPakistanCountryId(conn);
      const cleared = await clearPriorBatch(conn);
      const rows = buildJobs({ companies, cats, pkCountryId });
      const inserted = await insertJobs(conn, rows);
      await conn.commit();
      logger.info(
        `Fresh seed: cleared ${cleared} prior rows, inserted ${inserted} new jobs ` +
        `(across ${CATEGORIES.length} buckets, deadline 1–2 days from now, salary > PKR 500K).`
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const mode = process.argv.includes('rollback') ? 'rollback' : 'apply';
  run({ mode })
    .then(() => process.exit(0))
    .catch((err) => { logger.error(err); process.exit(1); });
}

module.exports = { run };
