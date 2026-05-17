'use strict';

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'Password@123';

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

async function upsertRoles(conn) {
  const roles = [
    ['candidate', 'Job seeker'],
    ['employer', 'Company recruiter'],
    ['admin', 'Platform administrator'],
    ['super_admin', 'Top-level administrator'],
  ];
  for (const [name, description] of roles) {
    await conn.execute(
      `INSERT INTO roles (name, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [name, description]
    );
  }
}

async function upsertCategories(conn) {
  const list = [
    ['Software Engineering', 'code'],
    ['Data Science', 'chart'],
    ['Product Management', 'briefcase'],
    ['Design', 'palette'],
    ['Marketing', 'megaphone'],
    ['Sales', 'handshake'],
    ['Finance', 'dollar'],
    ['Human Resources', 'users'],
    ['Customer Support', 'headset'],
    ['Operations', 'cog'],
  ];
  for (const [name, icon] of list) {
    await conn.execute(
      `INSERT INTO job_categories (name, slug, icon, is_active) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon)`,
      [name, slugify(name), icon]
    );
  }
}

async function upsertSkills(conn) {
  const list = [
    ['JavaScript', 'frontend'], ['TypeScript', 'frontend'], ['React', 'frontend'],
    ['Node.js', 'backend'], ['Express', 'backend'], ['MySQL', 'database'],
    ['PostgreSQL', 'database'], ['Redis', 'cache'], ['Python', 'backend'],
    ['Django', 'backend'], ['Java', 'backend'], ['Spring Boot', 'backend'],
    ['Go', 'backend'], ['Docker', 'devops'], ['Kubernetes', 'devops'],
    ['AWS', 'cloud'], ['GCP', 'cloud'], ['Azure', 'cloud'],
    ['GraphQL', 'api'], ['REST', 'api'], ['Figma', 'design'],
    ['Product Strategy', 'product'], ['SEO', 'marketing'], ['Content Writing', 'marketing'],
  ];
  for (const [name, category] of list) {
    await conn.execute(
      `INSERT INTO skills (name, slug, category, is_active) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)`,
      [name, slugify(name), category]
    );
  }
}

async function upsertUser(conn, { full_name, email, role, phone = null, avatar_url = null, status = 'active' }) {
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await conn.execute(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status, email_verified_at, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       phone = VALUES(phone),
       role = VALUES(role),
       status = VALUES(status),
       avatar_url = VALUES(avatar_url)`,
    [full_name, email, phone, password_hash, role, status, avatar_url]
  );
  const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
  return rows[0].id;
}

async function upsertCompany(conn, owner_user_id, data) {
  const slug = slugify(data.name);
  await conn.execute(
    `INSERT INTO companies (owner_user_id, name, slug, tagline, description, industry, size, website, logo_url, location, country, founded_year, verification_status, is_featured, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE
       owner_user_id = VALUES(owner_user_id),
       tagline = VALUES(tagline),
       description = VALUES(description),
       industry = VALUES(industry),
       size = VALUES(size),
       website = VALUES(website),
       logo_url = VALUES(logo_url),
       location = VALUES(location),
       country = VALUES(country),
       founded_year = VALUES(founded_year),
       verification_status = VALUES(verification_status),
       is_featured = VALUES(is_featured)`,
    [
      owner_user_id, data.name, slug, data.tagline, data.description, data.industry, data.size,
      data.website, data.logo_url, data.location, data.country, data.founded_year,
      data.verification_status || 'verified', data.is_featured ? 1 : 0,
    ]
  );
  const [rows] = await conn.execute('SELECT id FROM companies WHERE slug = ?', [slug]);
  return rows[0].id;
}

async function attachEmployerProfile(conn, user_id, company_id, designation = 'Talent Acquisition Lead') {
  await conn.execute(
    `INSERT INTO employer_profiles (user_id, company_id, designation, is_primary_contact)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), designation = VALUES(designation)`,
    [user_id, company_id, designation]
  );
}

async function attachCandidateProfile(conn, user_id, data) {
  await conn.execute(
    `INSERT INTO candidate_profiles
       (user_id, headline, summary, current_title, years_experience, location, country, open_to_remote,
        expected_salary_min, expected_salary_max, salary_currency, availability, resume_url,
        portfolio_url, linkedin_url, github_url, languages, profile_strength, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
       availability = VALUES(availability),
       resume_url = VALUES(resume_url),
       portfolio_url = VALUES(portfolio_url),
       linkedin_url = VALUES(linkedin_url),
       github_url = VALUES(github_url),
       languages = VALUES(languages),
       profile_strength = VALUES(profile_strength)`,
    [
      user_id, data.headline, data.summary, data.current_title, data.years_experience,
      data.location, data.country, data.open_to_remote ? 1 : 0,
      data.expected_salary_min, data.expected_salary_max, data.salary_currency || 'USD',
      data.availability || 'negotiable', data.resume_url || null, data.portfolio_url || null,
      data.linkedin_url || null, data.github_url || null, (data.languages || []).join(','),
      data.profile_strength || 80,
    ]
  );
}

async function attachCandidateSkills(conn, user_id, skillNames) {
  const [rows] = await conn.query(
    `SELECT id, name FROM skills WHERE name IN (${skillNames.map(() => '?').join(',')})`,
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
}

async function getCategoryId(conn, name) {
  const [rows] = await conn.execute('SELECT id FROM job_categories WHERE name = ?', [name]);
  return rows[0]?.id || null;
}

async function createJob(conn, company_id, posted_by_user_id, category_id, data) {
  const slug = slugify(`${data.title}-${company_id}-${Date.now()}`);
  const [res] = await conn.execute(
    `INSERT INTO jobs
       (company_id, posted_by_user_id, category_id, title, slug, description, responsibilities, requirements, benefits,
        job_type, experience_level, location, country, is_remote, salary_min, salary_max, salary_currency, salary_period,
        skills_tags, application_deadline, vacancies, status, is_featured, admin_status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, 'approved', NOW())`,
    [
      company_id, posted_by_user_id, category_id, data.title, slug,
      data.description, data.responsibilities, data.requirements, data.benefits,
      data.job_type, data.experience_level, data.location, data.country, data.is_remote ? 1 : 0,
      data.salary_min, data.salary_max, data.salary_currency || 'USD', data.salary_period || 'year',
      (data.skills_tags || []).join(','), data.application_deadline || null,
      data.vacancies || 1, data.is_featured ? 1 : 0,
    ]
  );
  return res.insertId;
}

async function ensurePreferences(conn, user_id) {
  await conn.execute(
    `INSERT INTO preferences (user_id, desired_titles, preferred_locations, preferred_job_types, remote_only, salary_min, salary_max, salary_currency, notify_email)
     VALUES (?, ?, ?, ?, 1, 80000, 160000, 'USD', 1)
     ON DUPLICATE KEY UPDATE
       desired_titles = VALUES(desired_titles),
       preferred_locations = VALUES(preferred_locations),
       preferred_job_types = VALUES(preferred_job_types)`,
    [user_id, 'Software Engineer,Full Stack Developer', 'Remote,New York,San Francisco', 'full_time,contract']
  );
}

async function createApplication(conn, job_id, candidate_user_id, company_id, status = 'applied') {
  await conn.execute(
    `INSERT INTO applications (job_id, candidate_user_id, company_id, cover_letter, status)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [job_id, candidate_user_id, company_id, 'I am very interested in this role and bring 4+ years of relevant experience.', status]
  );
  const [rows] = await conn.execute(
    'SELECT id FROM applications WHERE job_id = ? AND candidate_user_id = ?',
    [job_id, candidate_user_id]
  );
  return rows[0].id;
}

async function createFavorite(conn, user_id, job_id) {
  await conn.execute(
    `INSERT IGNORE INTO favorites (user_id, job_id) VALUES (?, ?)`,
    [user_id, job_id]
  );
}

async function createInterview(conn, application_id, job_id, company_id, candidate_user_id, employer_user_id) {
  await conn.execute(
    `INSERT INTO interviews
      (application_id, job_id, company_id, candidate_user_id, employer_user_id, scheduled_at, duration_minutes, mode, meeting_url, notes, status)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 DAY), 45, 'video', 'https://meet.example.com/match-hire-demo', 'Intro interview', 'scheduled')`,
    [application_id, job_id, company_id, candidate_user_id, employer_user_id]
  );
}

async function refreshJobCounts(conn) {
  await conn.query(`
    UPDATE jobs j
    LEFT JOIN (SELECT job_id, COUNT(*) c FROM applications GROUP BY job_id) a ON a.job_id = j.id
    SET j.applications_count = COALESCE(a.c, 0)
  `);
}

async function run() {
  const conn = await getConnection();
  try {
    logger.info('Seeding roles, categories, skills...');
    await upsertRoles(conn);
    await upsertCategories(conn);
    await upsertSkills(conn);

    logger.info('Seeding admin users...');
    const superAdminId = await upsertUser(conn, {
      full_name: 'Super Admin', email: 'superadmin@matchhire.com', role: 'super_admin',
    });
    const adminId = await upsertUser(conn, {
      full_name: 'Platform Admin', email: 'admin@matchhire.com', role: 'admin',
    });

    logger.info('Seeding employers and companies...');
    const employer1Id = await upsertUser(conn, {
      full_name: 'Alice Chen', email: 'alice@acme.com', role: 'employer',
    });
    const employer2Id = await upsertUser(conn, {
      full_name: 'Bob Martin', email: 'bob@northwind.com', role: 'employer',
    });
    const employer3Id = await upsertUser(conn, {
      full_name: 'Cara Singh', email: 'cara@globex.com', role: 'employer',
    });

    const acmeId = await upsertCompany(conn, employer1Id, {
      name: 'Acme Technologies',
      tagline: 'Innovate. Iterate. Inspire.',
      description: 'Acme Technologies builds developer tooling used by 10,000+ teams.',
      industry: 'Software',
      size: '201-500',
      website: 'https://acme.example.com',
      logo_url: 'https://logo.clearbit.com/acme.com',
      location: 'San Francisco',
      country: 'USA',
      founded_year: 2012,
      verification_status: 'verified',
      is_featured: true,
    });
    const northwindId = await upsertCompany(conn, employer2Id, {
      name: 'Northwind Labs',
      tagline: 'AI-first data infrastructure.',
      description: 'Northwind Labs powers analytics for Fortune 500 companies.',
      industry: 'Data & Analytics',
      size: '51-200',
      website: 'https://northwind.example.com',
      logo_url: 'https://logo.clearbit.com/northwind.com',
      location: 'New York',
      country: 'USA',
      founded_year: 2018,
      verification_status: 'verified',
      is_featured: true,
    });
    const globexId = await upsertCompany(conn, employer3Id, {
      name: 'Globex Corp',
      tagline: 'Scaling teams globally.',
      description: 'Globex is a remote-first product company.',
      industry: 'SaaS',
      size: '11-50',
      website: 'https://globex.example.com',
      logo_url: 'https://logo.clearbit.com/globex.com',
      location: 'Remote',
      country: 'Global',
      founded_year: 2020,
      verification_status: 'pending',
      is_featured: false,
    });

    await attachEmployerProfile(conn, employer1Id, acmeId, 'Head of Talent');
    await attachEmployerProfile(conn, employer2Id, northwindId, 'Recruiting Manager');
    await attachEmployerProfile(conn, employer3Id, globexId, 'People Ops');

    logger.info('Seeding candidate users...');
    const cand1 = await upsertUser(conn, { full_name: 'David Kim', email: 'david@candidate.com', role: 'candidate' });
    const cand2 = await upsertUser(conn, { full_name: 'Emma Rivera', email: 'emma@candidate.com', role: 'candidate' });
    const cand3 = await upsertUser(conn, { full_name: 'Farhan Ali', email: 'farhan@candidate.com', role: 'candidate' });
    const cand4 = await upsertUser(conn, { full_name: 'Grace Liu', email: 'grace@candidate.com', role: 'candidate' });

    await attachCandidateProfile(conn, cand1, {
      headline: 'Senior Full-Stack Engineer', summary: 'Building scalable web platforms for 7+ years.',
      current_title: 'Senior Software Engineer', years_experience: 7,
      location: 'San Francisco', country: 'USA', open_to_remote: true,
      expected_salary_min: 130000, expected_salary_max: 180000, languages: ['English', 'Korean'],
      linkedin_url: 'https://linkedin.com/in/davidkim',
      profile_strength: 92,
    });
    await attachCandidateProfile(conn, cand2, {
      headline: 'Data Scientist | ML Engineer', summary: 'NLP and recommendation systems specialist.',
      current_title: 'Data Scientist', years_experience: 5,
      location: 'New York', country: 'USA', open_to_remote: true,
      expected_salary_min: 120000, expected_salary_max: 165000, languages: ['English', 'Spanish'],
      profile_strength: 88,
    });
    await attachCandidateProfile(conn, cand3, {
      headline: 'Backend Engineer (Node.js / Go)', summary: 'Distributed systems and APIs at scale.',
      current_title: 'Software Engineer', years_experience: 4,
      location: 'Lahore', country: 'Pakistan', open_to_remote: true,
      expected_salary_min: 60000, expected_salary_max: 95000, languages: ['English', 'Urdu'],
      profile_strength: 84,
    });
    await attachCandidateProfile(conn, cand4, {
      headline: 'Product Designer', summary: 'Design systems and end-to-end product design.',
      current_title: 'Senior Product Designer', years_experience: 6,
      location: 'Berlin', country: 'Germany', open_to_remote: true,
      expected_salary_min: 80000, expected_salary_max: 120000, languages: ['English', 'German'],
      profile_strength: 90,
    });

    await attachCandidateSkills(conn, cand1, ['JavaScript', 'TypeScript', 'React', 'Node.js', 'MySQL', 'AWS']);
    await attachCandidateSkills(conn, cand2, ['Python', 'Django', 'PostgreSQL', 'AWS', 'GraphQL']);
    await attachCandidateSkills(conn, cand3, ['Node.js', 'Express', 'Go', 'Redis', 'Docker', 'Kubernetes']);
    await attachCandidateSkills(conn, cand4, ['Figma', 'Product Strategy']);

    await ensurePreferences(conn, cand1);
    await ensurePreferences(conn, cand2);
    await ensurePreferences(conn, cand3);
    await ensurePreferences(conn, cand4);

    logger.info('Seeding jobs...');
    const seCat = await getCategoryId(conn, 'Software Engineering');
    const dsCat = await getCategoryId(conn, 'Data Science');
    const designCat = await getCategoryId(conn, 'Design');

    const job1 = await createJob(conn, acmeId, employer1Id, seCat, {
      title: 'Senior Full-Stack Engineer',
      description: 'Join Acme to build the next generation of developer tools.',
      responsibilities: 'Ship features end-to-end across React and Node.js services.',
      requirements: '5+ years of full-stack experience. Strong JS/TS fundamentals.',
      benefits: 'Equity, healthcare, remote-friendly, unlimited PTO.',
      job_type: 'full_time', experience_level: 'senior',
      location: 'San Francisco', country: 'USA', is_remote: true,
      salary_min: 140000, salary_max: 190000,
      skills_tags: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
      vacancies: 2, is_featured: true,
    });
    const job2 = await createJob(conn, acmeId, employer1Id, seCat, {
      title: 'DevOps Engineer',
      description: 'Own CI/CD, observability, and cloud infrastructure.',
      responsibilities: 'Build automation. Manage AWS infra. Improve reliability.',
      requirements: 'Kubernetes, Terraform, AWS. 3+ years.',
      benefits: 'Equity, healthcare, learning stipend.',
      job_type: 'full_time', experience_level: 'mid',
      location: 'Remote', country: 'USA', is_remote: true,
      salary_min: 120000, salary_max: 160000,
      skills_tags: ['Docker', 'Kubernetes', 'AWS'],
    });
    const job3 = await createJob(conn, northwindId, employer2Id, dsCat, {
      title: 'Machine Learning Engineer',
      description: 'Build production ML pipelines for our analytics platform.',
      responsibilities: 'Productionize models. Optimize training and inference.',
      requirements: 'Python, ML frameworks, experience deploying models.',
      benefits: 'Top of market comp, equity, hybrid.',
      job_type: 'full_time', experience_level: 'senior',
      location: 'New York', country: 'USA', is_remote: false,
      salary_min: 150000, salary_max: 200000,
      skills_tags: ['Python', 'AWS'],
      is_featured: true,
    });
    const job4 = await createJob(conn, globexId, employer3Id, designCat, {
      title: 'Product Designer',
      description: 'Drive end-to-end product design for our flagship app.',
      responsibilities: 'Own design system. Run discovery. Ship pixel-perfect UI.',
      requirements: 'Figma mastery, strong portfolio.',
      benefits: 'Fully remote, async, generous time off.',
      job_type: 'full_time', experience_level: 'senior',
      location: 'Remote', country: 'Global', is_remote: true,
      salary_min: 90000, salary_max: 130000,
      skills_tags: ['Figma', 'Product Strategy'],
    });
    const job5 = await createJob(conn, globexId, employer3Id, seCat, {
      title: 'Backend Engineer (Node.js)',
      description: 'Build core APIs for our SaaS platform.',
      responsibilities: 'Design and own REST/GraphQL services.',
      requirements: 'Node.js, MySQL/Postgres, Redis. 3+ years.',
      benefits: 'Remote-first, async culture.',
      job_type: 'full_time', experience_level: 'mid',
      location: 'Remote', country: 'Global', is_remote: true,
      salary_min: 80000, salary_max: 120000,
      skills_tags: ['Node.js', 'Express', 'Redis'],
    });

    logger.info('Seeding applications, favorites, interviews...');
    const app1 = await createApplication(conn, job1, cand1, acmeId, 'shortlisted');
    const app2 = await createApplication(conn, job2, cand3, acmeId, 'applied');
    const app3 = await createApplication(conn, job3, cand2, northwindId, 'reviewing');
    const app4 = await createApplication(conn, job5, cand3, globexId, 'interview');
    const _app5 = await createApplication(conn, job4, cand4, globexId, 'applied');

    await createFavorite(conn, cand1, job2);
    await createFavorite(conn, cand2, job1);
    await createFavorite(conn, cand3, job5);
    await createFavorite(conn, cand4, job4);

    await createInterview(conn, app1, job1, acmeId, cand1, employer1Id);
    await createInterview(conn, app4, job5, globexId, cand3, employer3Id);

    await refreshJobCounts(conn);

    logger.info('Audit log starter...');
    await conn.execute(
      `INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, description)
       VALUES (?, 'seed', 'system', NULL, 'Initial demo data seeded')`,
      [superAdminId]
    );

    logger.info(`Seeding complete. Demo password for all accounts: ${DEMO_PASSWORD}`);
    logger.info(`Try: admin@matchhire.com / alice@acme.com / david@candidate.com`);
    void adminId;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((err) => {
    logger.error('Seeding failed', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { run };
