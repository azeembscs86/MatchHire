'use strict';

/**
 * Test-data seeder: Inovertex applicant pool.
 * --------------------------------------------
 * Populates a varied applicant pipeline against every active,
 * approved job posted by the company "Inovertex" so QA can
 * exercise the company dashboard's shortlist + reject flows end
 * to end.
 *
 * What it does
 *   1. Look up the Inovertex company row (errors out if missing —
 *      run `npm run seed` first to provision the demo dataset).
 *   2. List Inovertex's open + approved + non-expired jobs (cap 8).
 *   3. Upsert a dozen QA-only candidate accounts with deliberately
 *      tuned profiles (skills, current_title, years_experience,
 *      location) so the AI scorer will rank them across the full
 *      strong / medium / weak band.
 *   4. INSERT IGNORE applications for every (candidate, job) pair —
 *      the UNIQUE constraint on (job_id, candidate_user_id) means
 *      re-running the seeder is a no-op rather than a duplicate.
 *   5. Refresh `jobs.applications_count` so the dashboard tile
 *      counts reflect the new rows.
 *
 * Idempotent
 *   - Safe to re-run: every write is upsert or INSERT IGNORE.
 *   - Statuses are NOT reset on re-run, so a row you shortlisted
 *     manually stays shortlisted on the next pass.
 *
 * Rollback
 *   `npm run seed:inovertex-applications:rollback` deletes the
 *   test candidate users created by this seeder. FK cascades on
 *   `applications` / `candidate_profiles` / `candidate_skills`
 *   take their rows along automatically.
 *
 * Auth
 *   Every test candidate is provisioned with the same demo
 *   password (`Password@123`) so the QA team can sign in as any
 *   of them to confirm the candidate-side rejected-applications
 *   view renders the reason the employer picked.
 *
 * Usage
 *   npm run seed:inovertex-applications
 *   npm run seed:inovertex-applications -- rollback
 */

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'Password@123';
// Every seeded candidate is namespaced with this email suffix so
// the rollback path can scope its DELETE cleanly without
// touching any real user.
const TEST_EMAIL_DOMAIN = 'matchhire.test';
const TEST_EMAIL_PREFIX = 'qa.inovertex.';

/**
 * Candidate matrix.
 *
 * Each entry is one prospective applicant. The `skills` list is
 * what we'll attach via `candidate_skills`; the `current_title`
 * is what the role-overlap component of the match scorer reads.
 * `years_experience` + `location` feed the experience and
 * location components. We over-index on diversity so SOMETHING
 * lands above 60% no matter what Inovertex has posted, while a
 * couple of intentionally-mismatched entries (HR Generalist,
 * Junior Marketing) probe the below-threshold path the rejection
 * UI is designed for.
 */
const CANDIDATES = [
  {
    first: 'Aisha', last: 'Khan',
    headline: 'Senior Backend Engineer · Node.js + MySQL',
    current_title: 'Senior Backend Engineer',
    years_experience: 6,
    location: 'Karachi', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 200000, expected_max: 350000, currency: 'PKR',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Redis', 'Docker', 'REST APIs'],
    summary: 'Backend engineer with 6+ years building Node.js services on MySQL/Redis. Strong on REST design, queuing, and observability.',
  },
  {
    first: 'Bilal', last: 'Ahmed',
    headline: 'DevOps Engineer · AWS + Kubernetes',
    current_title: 'DevOps Engineer',
    years_experience: 5,
    location: 'Lahore', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 220000, expected_max: 380000, currency: 'PKR',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Linux'],
    summary: 'Cloud-native infra specialist: Terraformed AWS estates, GitOps with ArgoCD, k8s in production.',
  },
  {
    first: 'Chaudhry', last: 'Saad',
    headline: 'Frontend Engineer · React + TypeScript',
    current_title: 'Senior Frontend Engineer',
    years_experience: 5,
    location: 'Islamabad', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 200000, expected_max: 340000, currency: 'PKR',
    skills: ['React', 'TypeScript', 'Next.js', 'JavaScript', 'CSS', 'Tailwind CSS'],
    summary: 'Frontend engineer with deep React/Next.js. Strong on accessibility, design systems, and performance budgets.',
  },
  {
    first: 'Dania', last: 'Iqbal',
    headline: 'Full Stack Engineer · React + Node.js',
    current_title: 'Full Stack Engineer',
    years_experience: 4,
    location: 'Karachi', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 180000, expected_max: 300000, currency: 'PKR',
    skills: ['React', 'Node.js', 'MySQL', 'AWS', 'Docker', 'TypeScript'],
    summary: 'End-to-end product engineer. Comfortable owning a feature from migration to UI polish.',
  },
  {
    first: 'Erum', last: 'Malik',
    headline: 'QA Automation Engineer · Playwright + REST',
    current_title: 'Senior QA Engineer',
    years_experience: 5,
    location: 'Lahore', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 160000, expected_max: 260000, currency: 'PKR',
    skills: ['Playwright', 'Selenium', 'Cypress', 'JavaScript', 'REST APIs', 'API Testing'],
    summary: 'Test-automation specialist. Authored E2E suites for fintech and SaaS web apps.',
  },
  {
    first: 'Faisal', last: 'Raza',
    headline: 'Data Engineer · Python + SQL',
    current_title: 'Data Engineer',
    years_experience: 5,
    location: 'Karachi', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 200000, expected_max: 320000, currency: 'PKR',
    skills: ['Python', 'SQL', 'PostgreSQL', 'Airflow', 'Pandas', 'AWS'],
    summary: 'Built petabyte-scale ETL pipelines in Python + Airflow. Strong SQL fundamentals.',
  },
  {
    first: 'Gulnaaz', last: 'Sheikh',
    headline: 'Mid-level Backend Engineer · Python + Django',
    current_title: 'Backend Engineer',
    years_experience: 3,
    location: 'Islamabad', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 140000, expected_max: 240000, currency: 'PKR',
    skills: ['Python', 'Django', 'PostgreSQL', 'REST APIs', 'Docker'],
    summary: 'Three years building Django apps. Comfortable with PostgreSQL, Celery, and Docker.',
  },
  {
    first: 'Hamza', last: 'Tariq',
    headline: 'Mobile Engineer · React Native',
    current_title: 'Mobile Engineer',
    years_experience: 4,
    location: 'Lahore', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 180000, expected_max: 290000, currency: 'PKR',
    skills: ['React Native', 'TypeScript', 'JavaScript', 'iOS', 'Android'],
    summary: 'Cross-platform mobile engineer. Shipped 4 production apps with 100k+ MAU.',
  },
  {
    first: 'Iqra', last: 'Hussain',
    headline: 'Junior Frontend Engineer · HTML / CSS / JS',
    current_title: 'Junior Frontend Engineer',
    years_experience: 1,
    location: 'Karachi', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 70000, expected_max: 130000, currency: 'PKR',
    skills: ['HTML', 'CSS', 'JavaScript', 'React'],
    summary: 'Recent grad, one year of agency frontend work. Eager to grow into a senior team.',
  },
  {
    first: 'Junaid', last: 'Anwar',
    headline: 'Software Architect · Microservices + AWS',
    current_title: 'Principal Engineer',
    years_experience: 12,
    location: 'Karachi', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 400000, expected_max: 700000, currency: 'PKR',
    skills: ['Software Architecture', 'AWS', 'Microservices', 'Java', 'Kubernetes', 'System Design'],
    summary: 'Principal engineer with 12+ years. Designed and operated multi-region microservice estates.',
  },
  {
    first: 'Khadija', last: 'Yousaf',
    headline: 'HR Generalist · Recruitment + Operations',
    current_title: 'HR Generalist',
    years_experience: 6,
    location: 'Lahore', country: 'Pakistan',
    open_to_remote: 0,
    expected_min: 90000, expected_max: 150000, currency: 'PKR',
    skills: ['Recruitment', 'Microsoft Office', 'Onboarding'],
    summary: 'HR generalist applying for any open role at Inovertex. Six years of people operations.',
  },
  {
    first: 'Laila', last: 'Naeem',
    headline: 'Marketing Coordinator · Social media',
    current_title: 'Marketing Coordinator',
    years_experience: 2,
    location: 'Islamabad', country: 'Pakistan',
    open_to_remote: 1,
    expected_min: 80000, expected_max: 140000, currency: 'PKR',
    skills: ['Marketing', 'Social Media', 'Content Writing'],
    summary: 'Marketing generalist exploring whether engineering-adjacent roles fit my background.',
  },
];

/** Max number of Inovertex jobs each candidate will apply to. */
const MAX_JOBS_PER_CANDIDATE = 4;

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

async function findInovertexCompany(conn) {
  const [rows] = await conn.execute(
    `SELECT id, name, slug, owner_user_id
       FROM companies
      WHERE LOWER(name) = 'inovertex'
         OR LOWER(slug) = 'inovertex'
      LIMIT 1`
  );
  return rows[0] || null;
}

async function listInovertexJobs(conn, company_id) {
  const [rows] = await conn.execute(
    `SELECT id, title, skills_tags, experience_level, work_mode, location
       FROM jobs
      WHERE company_id = ?
        AND status = 'open'
        AND admin_status = 'approved'
        AND deleted_at IS NULL
        AND (application_deadline IS NULL OR application_deadline > NOW())
      ORDER BY published_at DESC, id DESC
      LIMIT 8`,
    [company_id]
  );
  return rows;
}

async function upsertCandidateUser(conn, c, idx) {
  const email = `${TEST_EMAIL_PREFIX}${String(idx + 1).padStart(2, '0')}@${TEST_EMAIL_DOMAIN}`;
  const full_name = `${c.first} ${c.last}`;
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await conn.execute(
    `INSERT INTO users (full_name, email, password_hash, role, status, email_verified_at)
     VALUES (?, ?, ?, 'candidate', 'active', NOW())
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       status = VALUES(status),
       email_verified_at = COALESCE(email_verified_at, NOW())`,
    [full_name, email, password_hash]
  );
  const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
  return { user_id: rows[0].id, email, full_name };
}

async function attachCandidateProfile(conn, user_id, c) {
  await conn.execute(
    `INSERT INTO candidate_profiles
       (user_id, headline, summary, current_title, years_experience, location, country, open_to_remote,
        expected_salary_min, expected_salary_max, salary_currency, availability, languages,
        profile_strength, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'negotiable', 'English,Urdu', 80, 1)
     ON DUPLICATE KEY UPDATE
       headline = VALUES(headline),
       summary = VALUES(summary),
       current_title = VALUES(current_title),
       years_experience = VALUES(years_experience),
       location = VALUES(location),
       country = VALUES(country),
       open_to_remote = VALUES(open_to_remote),
       expected_salary_min = VALUES(expected_salary_min),
       expected_salary_max = VALUES(expected_salary_max),
       salary_currency = VALUES(salary_currency),
       profile_strength = VALUES(profile_strength)`,
    [
      user_id, c.headline, c.summary, c.current_title, c.years_experience,
      c.location, c.country, c.open_to_remote,
      c.expected_min, c.expected_max, c.currency,
    ]
  );
}

async function attachCandidateSkills(conn, user_id, skillNames) {
  // Look skills up case-insensitively so seed runs against a catalogue
  // that may have different casing (e.g. "Node.js" vs "node.js"). Any
  // skill that doesn't exist in the catalogue is silently skipped — we
  // don't synthesise rows in the central skill table from this seeder.
  if (skillNames.length === 0) return;
  const placeholders = skillNames.map(() => 'LOWER(?)').join(',');
  const [rows] = await conn.query(
    `SELECT id, name FROM skills WHERE LOWER(name) IN (${placeholders})`,
    skillNames
  );
  for (const r of rows) {
    await conn.execute(
      `INSERT INTO candidate_skills (candidate_user_id, skill_id, proficiency, years_experience)
       VALUES (?, ?, 'advanced', 3)
       ON DUPLICATE KEY UPDATE proficiency = VALUES(proficiency)`,
      [user_id, r.id]
    );
  }
  return rows.length;
}

async function createApplication(conn, job_id, candidate_user_id, company_id, coverLetter) {
  // INSERT IGNORE relies on the UNIQUE (job_id, candidate_user_id)
  // constraint so re-running the seeder doesn't duplicate rows AND
  // doesn't reset the status of an application the employer has
  // already moved through the pipeline (e.g. shortlisted manually).
  await conn.execute(
    `INSERT IGNORE INTO applications (job_id, candidate_user_id, company_id, cover_letter, status)
     VALUES (?, ?, ?, ?, 'applied')`,
    [job_id, candidate_user_id, company_id, coverLetter]
  );
  const [rows] = await conn.execute(
    'SELECT id, status FROM applications WHERE job_id = ? AND candidate_user_id = ? LIMIT 1',
    [job_id, candidate_user_id]
  );
  return rows[0] || null;
}

async function refreshApplicationsCount(conn, jobIds) {
  if (jobIds.length === 0) return;
  await conn.query(`
    UPDATE jobs j
      LEFT JOIN (
        SELECT job_id, COUNT(*) c FROM applications GROUP BY job_id
      ) a ON a.job_id = j.id
       SET j.applications_count = COALESCE(a.c, 0)
     WHERE j.id IN (${jobIds.map(() => '?').join(',')})
  `, jobIds);
}

async function run() {
  const conn = await getConnection();
  try {
    logger.info('Inovertex applicant seeder — start');
    const company = await findInovertexCompany(conn);
    if (!company) {
      logger.error('Inovertex company not found. Run `npm run seed` (or create the company manually) before this seeder.');
      process.exitCode = 2;
      return;
    }
    logger.info(`Found company "${company.name}" (id=${company.id})`);

    const jobs = await listInovertexJobs(conn, company.id);
    if (jobs.length === 0) {
      logger.error('Inovertex has no active, approved, non-expired jobs. Post at least one job before running this seeder.');
      process.exitCode = 2;
      return;
    }
    logger.info(`Found ${jobs.length} active Inovertex job(s).`);

    let totalApplications = 0;
    let totalNewCandidates = 0;
    const touchedJobIds = new Set();

    for (let i = 0; i < CANDIDATES.length; i += 1) {
      const c = CANDIDATES[i];
      const { user_id, email, full_name } = await upsertCandidateUser(conn, c, i);
      await attachCandidateProfile(conn, user_id, c);
      const skillMatches = await attachCandidateSkills(conn, user_id, c.skills);
      logger.info(`Candidate ${i + 1}/${CANDIDATES.length}: ${full_name} <${email}> · ${skillMatches ?? 0}/${c.skills.length} skills attached.`);
      totalNewCandidates += 1;

      // Round-robin pick of up to MAX_JOBS_PER_CANDIDATE jobs so a
      // candidate hits a varied slice of postings rather than every
      // single one (keeps the applicant pool legible per job).
      const picks = [];
      const cap = Math.min(MAX_JOBS_PER_CANDIDATE, jobs.length);
      for (let k = 0; k < cap; k += 1) {
        picks.push(jobs[(i + k) % jobs.length]);
      }
      for (const job of picks) {
        const coverLetter = `Hi Inovertex team — I'd love to be considered for the ${job.title} role. My background as a ${c.current_title.toLowerCase()} (${c.years_experience}+ years, ${c.location}) covers ${c.skills.slice(0, 4).join(', ')}. Happy to discuss next steps.`;
        const created = await createApplication(conn, job.id, user_id, company.id, coverLetter);
        if (created) {
          totalApplications += 1;
          touchedJobIds.add(job.id);
        }
      }
    }

    await refreshApplicationsCount(conn, [...touchedJobIds]);

    logger.info('---');
    logger.info(`Inovertex applicant seeder — done.`);
    logger.info(`  Candidates upserted: ${totalNewCandidates}`);
    logger.info(`  Applications upserted: ${totalApplications}`);
    logger.info(`  Jobs touched: ${touchedJobIds.size}`);
    logger.info(`  Test login password: ${DEMO_PASSWORD}`);
    logger.info(`  Email pattern:       ${TEST_EMAIL_PREFIX}<NN>@${TEST_EMAIL_DOMAIN}`);
  } finally {
    await conn.end();
  }
}

async function rollback() {
  const conn = await getConnection();
  try {
    logger.info('Inovertex applicant seeder — rollback');
    // Delete users whose email matches the seeder's namespace. FK
    // cascades on `applications`, `candidate_profiles`, and
    // `candidate_skills` remove dependent rows automatically.
    const [res] = await conn.execute(
      `DELETE FROM users WHERE email LIKE ? AND email LIKE ?`,
      [`${TEST_EMAIL_PREFIX}%`, `%@${TEST_EMAIL_DOMAIN}`]
    );
    logger.info(`Removed ${res.affectedRows} test candidate user(s).`);

    // Recompute application counts on Inovertex's jobs so the
    // dashboard tile counts settle back to truth.
    const company = await findInovertexCompany(conn);
    if (company) {
      const [jobRows] = await conn.execute(
        `SELECT id FROM jobs WHERE company_id = ?`,
        [company.id]
      );
      await refreshApplicationsCount(conn, jobRows.map((r) => r.id));
    }
  } finally {
    await conn.end();
  }
}

(async () => {
  const mode = process.argv[2];
  try {
    if (mode === 'rollback') {
      await rollback();
    } else {
      await run();
    }
  } catch (err) {
    logger.error('Inovertex applicant seeder failed:', err);
    process.exitCode = 1;
  }
})();
