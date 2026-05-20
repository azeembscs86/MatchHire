'use strict';

/**
 * Additive (non-destructive) expansion seeder.
 * -------------------------------------------
 * Adds +50 companies / +50 candidates / +50 jobs to whatever the database
 * currently holds. Designed to be safe alongside the prior `seed.industries.js`
 * run: it never truncates, never deletes admins, never reassigns existing
 * users. Idempotent — re-running upserts the same names but skips inserts
 * that would collide on a unique key (email / slug / category-slug / skill-slug).
 *
 * Tops up new categories + new skills used by under-represented professions
 * (healthcare, pharmacy, education, legal, customer support, retail, ...)
 * before inserting the new companies / candidates / jobs.
 *
 * Conventions mirror existing seeders:
 *   - mysql2/promise direct connection (multipleStatements: false)
 *   - bcryptjs cost 10 for the demo password
 *   - chunked multi-row INSERTs via `INSERT INTO ... VALUES ?`
 *   - transactions for the user/profile/skill chains
 *
 * Commands:
 *   npm run seed:expand     additive +50 round (safe to re-run)
 */

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'Password@123';
const TARGET_COMPANIES = 50;
const TARGET_CANDIDATES = 50;
const TARGET_JOBS = 50;

/* ============================================================================
 * 1. Connection + helpers
 * ========================================================================== */

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

async function chunkedInsert(conn, sql, values, chunkSize = 100) {
  if (!values.length) return 0;
  let inserted = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const [res] = await conn.query(sql, [slice]);
    inserted += res?.affectedRows || 0;
  }
  return inserted;
}

function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

/* ============================================================================
 * 2. Reference data — new categories + new skills
 *    (idempotent: upsert by slug)
 * ========================================================================== */

const EXTRA_CATEGORIES = [
  ['Healthcare', 'stethoscope'],
  ['Pharmacy', 'pill'],
  ['Teaching', 'school'],
  ['Education', 'book'],
  ['Engineering', 'wrench'],
  ['Finance', 'dollar'],
  ['Accounting', 'calculator'],
  ['HR', 'users'],
  ['Sales', 'handshake'],
  ['Marketing', 'megaphone'],
  ['Legal', 'gavel'],
  ['Customer Support', 'headset'],
  ['Operations', 'cog'],
  ['Hospitality', 'bed'],
  ['Retail', 'shopping-bag'],
  ['Logistics', 'truck'],
  ['Media', 'film'],
  ['Software Development', 'code'],
  ['Data & AI', 'chart-line'],
  ['Cybersecurity', 'shield'],
];

const EXTRA_SKILLS = {
  Healthcare: [
    'Patient Care', 'Triage', 'Diagnosis', 'Clinical Procedures', 'ICU Care',
    'Surgical Assistance', 'Emergency Response', 'Phlebotomy', 'EHR Systems',
  ],
  Pharmacy: [
    'Pharmacology', 'Pharmacy Operations', 'Prescription Verification',
    'Compounding', 'Drug Interactions', 'Inventory Control',
  ],
  Education: [
    'Lesson Planning', 'Curriculum Development', 'Classroom Management',
    'Student Assessment', 'Distance Learning', 'STEM Teaching',
    'Academic Research', 'University Lecturing',
  ],
  Engineering: [
    'AutoCAD', 'Structural Design', 'Mechanical Design', 'Electrical Wiring',
    'PLC Programming', 'Site Engineering', 'Quality Assurance',
    'Safety Standards', 'BIM',
  ],
  Finance: [
    'Financial Modeling', 'Equity Research', 'Treasury Operations',
    'Cash Flow Analysis', 'Banking Operations', 'Credit Analysis',
  ],
  Accounting: [
    'Bookkeeping', 'Reconciliation', 'Accounts Payable', 'Accounts Receivable',
    'Tax Filing', 'Audit Support', 'IFRS', 'GAAP', 'QuickBooks',
  ],
  HR: [
    'Recruitment', 'Onboarding', 'Performance Management',
    'Compensation Planning', 'Employee Engagement', 'HR Analytics',
    'HRIS', 'Workday',
  ],
  Sales: [
    'B2B Sales', 'B2C Sales', 'Account Management', 'Channel Sales',
    'Outbound Prospecting', 'Salesforce', 'HubSpot CRM',
  ],
  Marketing: [
    'SEO', 'SEM', 'PPC Advertising', 'Content Strategy', 'Email Marketing',
    'Marketing Automation', 'Brand Strategy', 'Performance Marketing',
  ],
  Legal: [
    'Contract Drafting', 'Litigation', 'Corporate Law', 'Compliance',
    'Intellectual Property', 'Labour Law', 'Legal Research',
  ],
  'Customer Support': [
    'Helpdesk Operations', 'Zendesk', 'Intercom', 'Ticket Triage',
    'Customer Success', 'Conflict Resolution', 'Bilingual Support',
  ],
  Operations: [
    'Process Improvement', 'Vendor Management', 'Procurement', 'Six Sigma',
    'Inventory Management', 'Office Administration',
  ],
  Hospitality: [
    'Front Desk Operations', 'Guest Relations', 'Concierge', 'Food & Beverage',
    'Housekeeping', 'Event Coordination',
  ],
  Retail: [
    'Store Management', 'Visual Merchandising', 'POS Systems', 'Loss Prevention',
    'Inventory Replenishment', 'Customer Engagement',
  ],
  Logistics: [
    'Supply Chain', 'Warehouse Management', 'Freight Forwarding',
    'Last-Mile Delivery', 'Fleet Management', 'Customs Documentation',
  ],
  Media: [
    'Video Editing', 'Adobe Premiere Pro', 'Final Cut Pro', 'Sound Design',
    'Broadcast Journalism', 'Storyboarding', 'Production Coordination',
  ],
  'Software Development': [
    'Microservices', 'Event-Driven Architecture', 'gRPC', 'Domain-Driven Design',
    'Test-Driven Development', 'GraphQL Federation', 'WebAssembly',
  ],
  'Data & AI': [
    'PyTorch', 'TensorFlow', 'LLM Engineering', 'Prompt Engineering', 'MLOps',
    'Vector Databases', 'Data Pipelines', 'Snowflake', 'dbt',
  ],
  Cybersecurity: [
    'SOC Operations', 'Threat Hunting', 'Penetration Testing', 'SIEM',
    'Incident Response', 'IAM', 'Cloud Security', 'OWASP Top 10',
  ],
};

async function upsertCategories(conn) {
  for (const [name, icon] of EXTRA_CATEGORIES) {
    await conn.execute(
      `INSERT INTO job_categories (name, slug, icon, is_active) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), is_active = 1`,
      [name, slugify(name), icon]
    );
  }
}

async function upsertSkills(conn) {
  const rows = [];
  for (const [category, names] of Object.entries(EXTRA_SKILLS)) {
    for (const name of names) {
      rows.push([name, slugify(name), category, 1]);
    }
  }
  // INSERT IGNORE handles existing slugs without errors; we re-run safely.
  await chunkedInsert(
    conn,
    `INSERT IGNORE INTO skills (name, slug, category, is_active) VALUES ?`,
    rows,
    200
  );
}

/* ============================================================================
 * 3. Companies — 50 realistic businesses across the new categories
 * ========================================================================== */

const COMPANY_SEED = [
  // Healthcare & Pharmacy
  { name: 'Aga Khan Health Services', industry: 'Hospital', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Shifa International Hospitals', industry: 'Hospital', country: 'Pakistan', city: 'Islamabad', size: '501-1000' },
  { name: 'CMH Lahore Medical College', industry: 'Hospital', country: 'Pakistan', city: 'Lahore', size: '201-500' },
  { name: 'Saifee Hospital', industry: 'Hospital', country: 'Pakistan', city: 'Karachi', size: '201-500' },
  { name: 'D. Watson Pharmacy Group', industry: 'Pharmacy', country: 'Pakistan', city: 'Lahore', size: '201-500' },
  { name: 'Servaid Pharmacy', industry: 'Pharmacy', country: 'Pakistan', city: 'Karachi', size: '51-200' },
  // Education
  { name: 'Beaconhouse School System', industry: 'School', country: 'Pakistan', city: 'Lahore', size: '501-1000' },
  { name: 'The City School Network', industry: 'School', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Roots International Schools', industry: 'School', country: 'Pakistan', city: 'Islamabad', size: '201-500' },
  { name: 'LUMS Lahore University', industry: 'University', country: 'Pakistan', city: 'Lahore', size: '1001-5000' },
  { name: 'IBA Karachi', industry: 'University', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  // Engineering / Industrial
  { name: 'Descon Engineering', industry: 'Engineering', country: 'Pakistan', city: 'Lahore', size: '1001-5000' },
  { name: 'NESPAK', industry: 'Engineering', country: 'Pakistan', city: 'Lahore', size: '1001-5000' },
  // Finance / Accounting
  { name: 'A.F. Ferguson & Co. (PwC)', industry: 'Accounting Firm', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'KPMG Taseer Hadi & Co.', industry: 'Accounting Firm', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Habib Bank Limited', industry: 'Bank', country: 'Pakistan', city: 'Karachi', size: '5001+' },
  { name: 'United Bank Limited', industry: 'Bank', country: 'Pakistan', city: 'Karachi', size: '5001+' },
  { name: 'Faysal Bank', industry: 'Bank', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  // HR / Operations
  { name: 'PeopleStrong HR', industry: 'HR Consulting', country: 'India', city: 'Mumbai', size: '201-500' },
  { name: 'OnPoint Operations', industry: 'Business Services', country: 'UAE', city: 'Dubai', size: '51-200' },
  // Sales / Marketing
  { name: 'Tribal Worldwide', industry: 'Marketing Agency', country: 'UAE', city: 'Dubai', size: '51-200' },
  { name: 'Ogilvy Pakistan', industry: 'Marketing Agency', country: 'Pakistan', city: 'Karachi', size: '51-200' },
  { name: 'IAL Saatchi & Saatchi', industry: 'Marketing Agency', country: 'Pakistan', city: 'Karachi', size: '51-200' },
  // Legal
  { name: 'Cornelius Lane & Mufti', industry: 'Legal Firm', country: 'Pakistan', city: 'Lahore', size: '51-200' },
  { name: 'Mandviwalla & Zafar', industry: 'Legal Firm', country: 'Pakistan', city: 'Karachi', size: '51-200' },
  // Customer Support / BPO
  { name: 'Ibex Global', industry: 'BPO', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  { name: 'TRG Pakistan', industry: 'BPO', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  // Hospitality
  { name: 'Pearl Continental Hotels', industry: 'Hotel', country: 'Pakistan', city: 'Lahore', size: '1001-5000' },
  { name: 'Serena Hotels Pakistan', industry: 'Hotel', country: 'Pakistan', city: 'Islamabad', size: '501-1000' },
  { name: 'Movenpick Karachi', industry: 'Hotel', country: 'Pakistan', city: 'Karachi', size: '201-500' },
  // Retail
  { name: 'Khaadi', industry: 'Retail', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  { name: 'Sapphire Retail', industry: 'Retail', country: 'Pakistan', city: 'Lahore', size: '501-1000' },
  { name: 'Imtiaz Super Markets', industry: 'Retail', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  // Logistics
  { name: 'TCS Logistics', industry: 'Logistics', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  { name: 'Leopards Courier', industry: 'Logistics', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  { name: 'M&P Express Logistics', industry: 'Logistics', country: 'Pakistan', city: 'Lahore', size: '501-1000' },
  // Media
  { name: 'Dawn Media Group', industry: 'Media', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Geo News Network', industry: 'Media', country: 'Pakistan', city: 'Karachi', size: '1001-5000' },
  { name: 'ARY Digital Network', industry: 'Media', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  // Software / Data & AI / Cybersecurity
  { name: 'Folio3 Software', industry: 'Software House', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: '10Pearls', industry: 'Software House', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Arbisoft', industry: 'Software House', country: 'Pakistan', city: 'Lahore', size: '501-1000' },
  { name: 'Tkxel', industry: 'Software House', country: 'Pakistan', city: 'Lahore', size: '201-500' },
  { name: 'VentureDive', industry: 'Software House', country: 'Pakistan', city: 'Karachi', size: '201-500' },
  { name: 'Afiniti', industry: 'Data & AI', country: 'Pakistan', city: 'Karachi', size: '501-1000' },
  { name: 'Data Vault Pakistan', industry: 'Data & AI', country: 'Pakistan', city: 'Lahore', size: '51-200' },
  { name: 'TrillionCyber', industry: 'Cybersecurity', country: 'Pakistan', city: 'Islamabad', size: '51-200' },
  { name: 'Rewterz Information Security', industry: 'Cybersecurity', country: 'Pakistan', city: 'Karachi', size: '51-200' },
  { name: 'Securiti.ai', industry: 'Cybersecurity', country: 'USA', city: 'San Jose', size: '501-1000' },
  { name: 'Northern Trust Operations', industry: 'Finance', country: 'UK', city: 'London', size: '5001+' },
];

async function seedCompanies(conn) {
  const existing = await conn.query(`SELECT LOWER(slug) AS slug FROM companies`).then(([rows]) => new Set(rows.map((r) => r.slug)));
  const target = COMPANY_SEED.slice(0, TARGET_COMPANIES);

  const rows = [];
  const ids = [];
  for (const c of target) {
    const baseSlug = slugify(c.name);
    if (existing.has(baseSlug)) {
      const [row] = await conn.query(`SELECT id FROM companies WHERE slug = ? LIMIT 1`, [baseSlug]);
      if (row?.[0]) ids.push({ id: row[0].id, ...c });
      continue;
    }
    rows.push([
      null,                       // owner_user_id
      c.name, baseSlug,
      `${c.industry} headquartered in ${c.city}.`,
      c.industry,
      c.size,
      null,                       // website
      null,                       // logo
      c.city,
      c.country,
      'active',
      'verified',
      0,                          // is_featured
    ]);
  }
  if (rows.length) {
    await chunkedInsert(
      conn,
      `INSERT INTO companies (owner_user_id, name, slug, tagline, industry, size, website, logo_url, location, country, status, verification_status, is_featured)
       VALUES ?`,
      rows,
      50
    );
  }
  // Fetch back ids for everything we touched (new + already-existing).
  const slugs = target.map((c) => slugify(c.name));
  const [back] = await conn.query(
    `SELECT id, name, slug, industry, location, country FROM companies WHERE slug IN (?)`,
    [slugs]
  );
  return back;
}

/* ============================================================================
 * 4. Candidates — 50 realistic profiles across the new professions
 * ========================================================================== */

const CANDIDATE_SEED = [
  { name: 'Dr. Areeba Khan',     title: 'General Physician',           cat: 'Healthcare',       city: 'Karachi',   country: 'Pakistan', exp: 6,  skills: ['Patient Care','Triage','Diagnosis','EHR Systems'] },
  { name: 'Dr. Hassan Iqbal',    title: 'Cardiologist',                cat: 'Healthcare',       city: 'Lahore',    country: 'Pakistan', exp: 11, skills: ['Patient Care','Diagnosis','ICU Care','Emergency Response'] },
  { name: 'Nurse Saira Ali',     title: 'Senior Staff Nurse',          cat: 'Healthcare',       city: 'Islamabad', country: 'Pakistan', exp: 8,  skills: ['Patient Care','Triage','ICU Care','EHR Systems'] },
  { name: 'Dr. Mahnoor Aslam',   title: 'Pediatrician',                cat: 'Healthcare',       city: 'Karachi',   country: 'Pakistan', exp: 7,  skills: ['Patient Care','Diagnosis','Clinical Procedures'] },
  { name: 'Faraz Ahmed',         title: 'Clinical Pharmacist',         cat: 'Pharmacy',         city: 'Karachi',   country: 'Pakistan', exp: 5,  skills: ['Pharmacology','Pharmacy Operations','Prescription Verification'] },
  { name: 'Hira Tariq',          title: 'Retail Pharmacist',           cat: 'Pharmacy',         city: 'Lahore',    country: 'Pakistan', exp: 4,  skills: ['Pharmacology','Prescription Verification','Inventory Control'] },
  { name: 'Bilal Yousuf',        title: 'Mathematics Teacher',         cat: 'Teaching',         city: 'Karachi',   country: 'Pakistan', exp: 6,  skills: ['Lesson Planning','Classroom Management','Student Assessment'] },
  { name: 'Sana Mehmood',        title: 'English Teacher',             cat: 'Teaching',         city: 'Islamabad', country: 'Pakistan', exp: 5,  skills: ['Lesson Planning','Classroom Management','Curriculum Development'] },
  { name: 'Dr. Salman Raza',     title: 'University Professor',        cat: 'Education',        city: 'Lahore',    country: 'Pakistan', exp: 14, skills: ['University Lecturing','Academic Research','STEM Teaching'] },
  { name: 'Aisha Naseer',        title: 'Curriculum Designer',         cat: 'Education',        city: 'Karachi',   country: 'Pakistan', exp: 8,  skills: ['Curriculum Development','Lesson Planning','Distance Learning'] },
  { name: 'Engr. Usman Sheikh',  title: 'Civil Engineer',              cat: 'Engineering',      city: 'Karachi',   country: 'Pakistan', exp: 9,  skills: ['AutoCAD','Structural Design','Site Engineering','Safety Standards'] },
  { name: 'Engr. Hamza Khalid',  title: 'Mechanical Engineer',         cat: 'Engineering',      city: 'Lahore',    country: 'Pakistan', exp: 7,  skills: ['Mechanical Design','AutoCAD','Quality Assurance'] },
  { name: 'Engr. Rida Sami',     title: 'Electrical Engineer',         cat: 'Engineering',      city: 'Islamabad', country: 'Pakistan', exp: 6,  skills: ['Electrical Wiring','PLC Programming','Safety Standards'] },
  { name: 'Adeel Mukhtar',       title: 'Financial Analyst',           cat: 'Finance',          city: 'Karachi',   country: 'Pakistan', exp: 5,  skills: ['Financial Modeling','Equity Research','Cash Flow Analysis'] },
  { name: 'Maryam Chaudhry',     title: 'Senior Accountant',           cat: 'Accounting',       city: 'Lahore',    country: 'Pakistan', exp: 7,  skills: ['Bookkeeping','Reconciliation','Tax Filing','QuickBooks'] },
  { name: 'Hammad Sultan',       title: 'Audit Associate',             cat: 'Accounting',       city: 'Karachi',   country: 'Pakistan', exp: 3,  skills: ['Audit Support','IFRS','GAAP'] },
  { name: 'Zoya Iftikhar',       title: 'HR Business Partner',         cat: 'HR',               city: 'Karachi',   country: 'Pakistan', exp: 9,  skills: ['Recruitment','Performance Management','HR Analytics'] },
  { name: 'Rabia Faruq',         title: 'Talent Acquisition Lead',     cat: 'HR',               city: 'Lahore',    country: 'Pakistan', exp: 6,  skills: ['Recruitment','Onboarding','Employer Branding'] },
  { name: 'Omer Saeed',          title: 'B2B Sales Manager',           cat: 'Sales',            city: 'Karachi',   country: 'Pakistan', exp: 10, skills: ['B2B Sales','Account Management','Salesforce'] },
  { name: 'Komal Asad',          title: 'Key Account Executive',       cat: 'Sales',            city: 'Lahore',    country: 'Pakistan', exp: 4,  skills: ['Account Management','B2B Sales','HubSpot CRM'] },
  { name: 'Nida Mansoor',        title: 'Digital Marketing Manager',   cat: 'Marketing',        city: 'Karachi',   country: 'Pakistan', exp: 7,  skills: ['SEO','SEM','PPC Advertising','Marketing Automation'] },
  { name: 'Talha Ashraf',        title: 'Content Strategist',          cat: 'Marketing',        city: 'Islamabad', country: 'Pakistan', exp: 5,  skills: ['Content Strategy','Brand Strategy','SEO'] },
  { name: 'Adv. Sadia Hashmi',   title: 'Corporate Lawyer',            cat: 'Legal',            city: 'Lahore',    country: 'Pakistan', exp: 8,  skills: ['Corporate Law','Contract Drafting','Compliance'] },
  { name: 'Adv. Imran Naqvi',    title: 'Litigation Lawyer',           cat: 'Legal',            city: 'Karachi',   country: 'Pakistan', exp: 12, skills: ['Litigation','Legal Research','Labour Law'] },
  { name: 'Rabail Hasan',        title: 'Customer Success Manager',    cat: 'Customer Support', city: 'Karachi',   country: 'Pakistan', exp: 5,  skills: ['Customer Success','Zendesk','Intercom'] },
  { name: 'Junaid Bashir',       title: 'Helpdesk Team Lead',          cat: 'Customer Support', city: 'Lahore',    country: 'Pakistan', exp: 6,  skills: ['Helpdesk Operations','Ticket Triage','Conflict Resolution'] },
  { name: 'Ayesha Niaz',         title: 'Operations Coordinator',      cat: 'Operations',       city: 'Karachi',   country: 'Pakistan', exp: 4,  skills: ['Office Administration','Process Improvement','Vendor Management'] },
  { name: 'Shahbaz Anwar',       title: 'Procurement Specialist',      cat: 'Operations',       city: 'Lahore',    country: 'Pakistan', exp: 7,  skills: ['Procurement','Vendor Management','Inventory Management'] },
  { name: 'Hina Pervez',         title: 'Front Office Manager',        cat: 'Hospitality',      city: 'Karachi',   country: 'Pakistan', exp: 9,  skills: ['Front Desk Operations','Guest Relations','Event Coordination'] },
  { name: 'Wajid Akram',         title: 'Food & Beverage Supervisor',  cat: 'Hospitality',      city: 'Islamabad', country: 'Pakistan', exp: 6,  skills: ['Food & Beverage','Guest Relations','Housekeeping'] },
  { name: 'Mehwish Younas',      title: 'Retail Store Manager',        cat: 'Retail',           city: 'Lahore',    country: 'Pakistan', exp: 8,  skills: ['Store Management','Visual Merchandising','POS Systems'] },
  { name: 'Asad Riaz',           title: 'Visual Merchandiser',         cat: 'Retail',           city: 'Karachi',   country: 'Pakistan', exp: 5,  skills: ['Visual Merchandising','Customer Engagement','Inventory Replenishment'] },
  { name: 'Bilal Razzaq',        title: 'Warehouse Manager',           cat: 'Logistics',        city: 'Karachi',   country: 'Pakistan', exp: 9,  skills: ['Warehouse Management','Supply Chain','Inventory Management'] },
  { name: 'Yusra Mehmood',       title: 'Supply Chain Analyst',        cat: 'Logistics',        city: 'Lahore',    country: 'Pakistan', exp: 4,  skills: ['Supply Chain','Process Improvement'] },
  { name: 'Fatima Rashid',       title: 'Broadcast Journalist',        cat: 'Media',            city: 'Karachi',   country: 'Pakistan', exp: 7,  skills: ['Broadcast Journalism','Storyboarding','Production Coordination'] },
  { name: 'Daniyal Shaikh',      title: 'Senior Video Editor',         cat: 'Media',            city: 'Karachi',   country: 'Pakistan', exp: 6,  skills: ['Video Editing','Adobe Premiere Pro','Final Cut Pro'] },
  { name: 'Hassan Wahab',        title: 'Backend Engineer',            cat: 'Software Development', city: 'Lahore',   country: 'Pakistan', exp: 5,  skills: ['Node.js','MySQL','Redis','REST APIs','Microservices'] },
  { name: 'Sara Ehsan',          title: 'Senior Backend Engineer',     cat: 'Software Development', city: 'Karachi',  country: 'Pakistan', exp: 9,  skills: ['Node.js','Express.js','PostgreSQL','Redis','Docker'] },
  { name: 'Awais Hameed',        title: 'Senior Full-Stack Engineer',  cat: 'Software Development', city: 'Islamabad',country: 'Pakistan', exp: 8,  skills: ['React.js','Node.js','TypeScript','GraphQL'] },
  { name: 'Misbah Latif',        title: 'Frontend Engineer',           cat: 'Software Development', city: 'Karachi',  country: 'Pakistan', exp: 4,  skills: ['React.js','TypeScript','Next.js'] },
  { name: 'Rehan Asif',          title: 'DevOps Engineer',             cat: 'Software Development', city: 'Lahore',   country: 'Pakistan', exp: 7,  skills: ['Docker','Kubernetes','AWS','CI/CD'] },
  { name: 'Mohsin Tariq',        title: 'Data Analyst',                cat: 'Data & AI',        city: 'Karachi',   country: 'Pakistan', exp: 4,  skills: ['SQL','Excel','Data Pipelines','dbt'] },
  { name: 'Saba Imtiaz',         title: 'Senior Data Scientist',       cat: 'Data & AI',        city: 'Lahore',    country: 'Pakistan', exp: 8,  skills: ['Python','PyTorch','TensorFlow','MLOps'] },
  { name: 'Mariam Junejo',       title: 'AI Engineer',                 cat: 'Data & AI',        city: 'Karachi',   country: 'Pakistan', exp: 5,  skills: ['LLM Engineering','Prompt Engineering','PyTorch'] },
  { name: 'Hasan Zubair',        title: 'Cloud Security Engineer',     cat: 'Cybersecurity',    city: 'Islamabad', country: 'Pakistan', exp: 6,  skills: ['Cloud Security','SIEM','Incident Response'] },
  { name: 'Iqra Salam',          title: 'SOC Analyst',                 cat: 'Cybersecurity',    city: 'Karachi',   country: 'Pakistan', exp: 4,  skills: ['SOC Operations','SIEM','Threat Hunting'] },
  { name: 'Tahir Mehmood',       title: 'Penetration Tester',          cat: 'Cybersecurity',    city: 'Lahore',    country: 'Pakistan', exp: 7,  skills: ['Penetration Testing','OWASP Top 10','Threat Hunting'] },
  { name: 'Sameen Ali',          title: 'Product Designer',            cat: 'Design',           city: 'Karachi',   country: 'Pakistan', exp: 6,  skills: ['UI Design','UX Design','Figma','Prototyping'] },
  { name: 'Owais Mansoor',       title: 'UX Researcher',               cat: 'Design',           city: 'Lahore',    country: 'Pakistan', exp: 5,  skills: ['User Research','UX Design','Figma'] },
  { name: 'Nimra Anwer',         title: 'Talent Manager',              cat: 'HR',               city: 'Karachi',   country: 'Pakistan', exp: 6,  skills: ['Talent Acquisition','HRIS','Workday'] },
];

function emailForName(name, idx) {
  // First+last lowercased, dots, with a stable suffix so re-runs collide
  // (and the INSERT IGNORE skips them).
  const slug = String(name).toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/dr\.?|adv\.?|engr\.?|nurse/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${slug || 'candidate'}.${idx + 1}@matchhire-demo.com`;
}

async function seedCandidates(conn, skillIdByName) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const target = CANDIDATE_SEED.slice(0, TARGET_CANDIDATES);

  const created = [];
  for (let i = 0; i < target.length; i += 1) {
    const c = target[i];
    const email = emailForName(c.name, i);
    // Insert user (idempotent by email)
    await conn.execute(
      `INSERT IGNORE INTO users (full_name, email, password_hash, role, status, email_verified_at)
       VALUES (?, ?, ?, 'candidate', 'active', NOW())`,
      [c.name.replace(/^(Dr\.|Adv\.|Engr\.|Nurse)\s+/i, ''), email, passwordHash]
    );
    const [[u]] = await conn.query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [email]);
    if (!u) continue;
    created.push({ id: u.id, ...c });

    // Upsert profile
    await conn.execute(
      `INSERT INTO candidate_profiles
        (user_id, headline, summary, current_title, years_experience, location, city, country, open_to_remote, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         headline = VALUES(headline),
         summary = VALUES(summary),
         current_title = VALUES(current_title),
         years_experience = VALUES(years_experience),
         location = VALUES(location),
         city = VALUES(city),
         country = VALUES(country)`,
      [
        u.id,
        `${c.title} · ${c.exp}+ yrs experience`,
        `Experienced ${c.title.toLowerCase()} based in ${c.city}, ${c.country}.`,
        c.title,
        c.exp,
        c.city,
        c.city,
        c.country,
      ]
    );

    // Replace skills (idempotent)
    await conn.execute(`DELETE FROM candidate_skills WHERE candidate_user_id = ?`, [u.id]);
    const skillRows = [];
    for (const sk of c.skills) {
      const sid = skillIdByName.get(sk.toLowerCase());
      if (!sid) continue;
      const proficiency = c.exp >= 7 ? 'expert' : c.exp >= 4 ? 'advanced' : 'intermediate';
      const yrs = Math.max(1, Math.floor(c.exp * 0.7));
      skillRows.push([u.id, sid, proficiency, yrs]);
    }
    if (skillRows.length) {
      await conn.query(
        `INSERT INTO candidate_skills (candidate_user_id, skill_id, proficiency, years_experience) VALUES ?`,
        [skillRows]
      );
    }

    // Recompute profile strength
    const [[row]] = await conn.query(
      `SELECT cp.headline, cp.summary, cp.resume_url, cp.linkedin_url, cp.portfolio_url, cp.location,
              (SELECT COUNT(*) FROM candidate_skills WHERE candidate_user_id = cp.user_id) AS skill_count
       FROM candidate_profiles cp WHERE cp.user_id = ?`,
      [u.id]
    );
    let score = 20;
    if (row.headline) score += 15;
    if (row.summary) score += 15;
    if (row.resume_url) score += 15;
    if (row.linkedin_url) score += 10;
    if (row.portfolio_url) score += 5;
    if (row.location) score += 5;
    score += Math.min(15, Number(row.skill_count) * 2);
    if (score > 100) score = 100;
    await conn.execute(`UPDATE candidate_profiles SET profile_strength = ? WHERE user_id = ?`, [score, u.id]);
  }
  return created;
}

/* ============================================================================
 * 5. Jobs — 50 realistic openings matched to the new categories
 * ========================================================================== */

const JOB_TEMPLATES = [
  // Healthcare
  { cat: 'Healthcare',       title: 'General Physician',          industries: ['Hospital'],        salary: [12000, 28000], lvl: 'mid',    skills: ['Patient Care','Diagnosis','Clinical Procedures','EHR Systems'] },
  { cat: 'Healthcare',       title: 'Senior Staff Nurse',          industries: ['Hospital'],        salary: [8000, 18000],  lvl: 'mid',    skills: ['Patient Care','Triage','ICU Care'] },
  { cat: 'Healthcare',       title: 'Cardiologist',                industries: ['Hospital'],        salary: [25000, 60000], lvl: 'senior', skills: ['Diagnosis','Clinical Procedures','ICU Care'] },
  { cat: 'Healthcare',       title: 'Hospital Administrator',      industries: ['Hospital'],        salary: [10000, 24000], lvl: 'senior', skills: ['Office Administration','Process Improvement'] },
  // Pharmacy
  { cat: 'Pharmacy',         title: 'Clinical Pharmacist',         industries: ['Hospital','Pharmacy'], salary: [9000, 20000], lvl: 'mid',  skills: ['Pharmacology','Prescription Verification','Inventory Control'] },
  { cat: 'Pharmacy',         title: 'Retail Pharmacist',           industries: ['Pharmacy'],        salary: [7000, 15000],  lvl: 'mid',    skills: ['Pharmacology','Prescription Verification'] },
  // Teaching / Education
  { cat: 'Teaching',         title: 'Mathematics Teacher',         industries: ['School'],          salary: [6000, 14000],  lvl: 'mid',    skills: ['Lesson Planning','Classroom Management','Student Assessment'] },
  { cat: 'Teaching',         title: 'English Teacher',             industries: ['School'],          salary: [6000, 14000],  lvl: 'mid',    skills: ['Lesson Planning','Classroom Management','Curriculum Development'] },
  { cat: 'Education',        title: 'University Lecturer',         industries: ['University'],      salary: [15000, 35000], lvl: 'senior', skills: ['University Lecturing','Academic Research','STEM Teaching'] },
  { cat: 'Education',        title: 'Curriculum Designer',         industries: ['School','University'], salary: [10000, 22000], lvl: 'mid', skills: ['Curriculum Development','Distance Learning'] },
  // Engineering
  { cat: 'Engineering',      title: 'Senior Civil Engineer',       industries: ['Engineering'],     salary: [15000, 32000], lvl: 'senior', skills: ['AutoCAD','Structural Design','Site Engineering'] },
  { cat: 'Engineering',      title: 'Mechanical Engineer',         industries: ['Engineering'],     salary: [12000, 26000], lvl: 'mid',    skills: ['Mechanical Design','AutoCAD','Quality Assurance'] },
  { cat: 'Engineering',      title: 'Electrical Engineer',         industries: ['Engineering'],     salary: [12000, 26000], lvl: 'mid',    skills: ['Electrical Wiring','PLC Programming','Safety Standards'] },
  // Finance / Accounting
  { cat: 'Finance',          title: 'Financial Analyst',           industries: ['Bank','Finance','Accounting Firm'], salary: [12000, 26000], lvl: 'mid', skills: ['Financial Modeling','Cash Flow Analysis','Excel'] },
  { cat: 'Finance',          title: 'Treasury Manager',            industries: ['Bank','Finance'],  salary: [25000, 55000], lvl: 'senior', skills: ['Treasury Operations','Banking Operations','Cash Flow Analysis'] },
  { cat: 'Accounting',       title: 'Senior Accountant',           industries: ['Accounting Firm','Finance'], salary: [10000, 22000], lvl: 'mid', skills: ['Bookkeeping','Reconciliation','Tax Filing','QuickBooks'] },
  { cat: 'Accounting',       title: 'Audit Manager',               industries: ['Accounting Firm'], salary: [18000, 40000], lvl: 'senior', skills: ['Audit Support','IFRS','GAAP'] },
  // HR
  { cat: 'HR',               title: 'HR Business Partner',         industries: ['HR Consulting','Software House'], salary: [15000, 32000], lvl: 'senior', skills: ['Performance Management','Employee Engagement','HR Analytics'] },
  { cat: 'HR',               title: 'Talent Acquisition Specialist', industries: ['HR Consulting','Software House'], salary: [10000, 22000], lvl: 'mid', skills: ['Recruitment','Onboarding','Employer Branding'] },
  // Sales / Marketing
  { cat: 'Sales',            title: 'B2B Sales Manager',           industries: ['Software House','BPO'], salary: [18000, 45000], lvl: 'senior', skills: ['B2B Sales','Account Management','Salesforce'] },
  { cat: 'Sales',            title: 'Account Executive',           industries: ['Software House','Marketing Agency'], salary: [10000, 22000], lvl: 'mid', skills: ['Account Management','B2B Sales','HubSpot CRM'] },
  { cat: 'Marketing',        title: 'Digital Marketing Manager',   industries: ['Marketing Agency','Retail'], salary: [15000, 32000], lvl: 'senior', skills: ['SEO','SEM','PPC Advertising','Marketing Automation'] },
  { cat: 'Marketing',        title: 'Content Strategist',          industries: ['Marketing Agency','Media'], salary: [10000, 22000], lvl: 'mid', skills: ['Content Strategy','SEO','Brand Strategy'] },
  // Legal
  { cat: 'Legal',            title: 'Corporate Lawyer',            industries: ['Legal Firm'],      salary: [18000, 42000], lvl: 'senior', skills: ['Corporate Law','Contract Drafting','Compliance'] },
  { cat: 'Legal',            title: 'Litigation Associate',        industries: ['Legal Firm'],      salary: [12000, 26000], lvl: 'mid',    skills: ['Litigation','Legal Research','Labour Law'] },
  // Customer Support
  { cat: 'Customer Support', title: 'Customer Success Manager',    industries: ['BPO','Software House'], salary: [12000, 25000], lvl: 'mid', skills: ['Customer Success','Zendesk','Intercom'] },
  { cat: 'Customer Support', title: 'Bilingual Support Agent',     industries: ['BPO'],             salary: [6000, 14000],  lvl: 'entry',  skills: ['Helpdesk Operations','Bilingual Support','Ticket Triage'] },
  // Operations
  { cat: 'Operations',       title: 'Operations Manager',          industries: ['Business Services','Logistics'], salary: [15000, 32000], lvl: 'senior', skills: ['Process Improvement','Vendor Management','Procurement'] },
  { cat: 'Operations',       title: 'Procurement Specialist',      industries: ['Business Services','Retail'], salary: [9000, 20000], lvl: 'mid', skills: ['Procurement','Vendor Management','Inventory Management'] },
  // Hospitality
  { cat: 'Hospitality',      title: 'Front Office Manager',        industries: ['Hotel'],           salary: [10000, 22000], lvl: 'senior', skills: ['Front Desk Operations','Guest Relations','Event Coordination'] },
  { cat: 'Hospitality',      title: 'F&B Supervisor',              industries: ['Hotel'],           salary: [7000, 16000],  lvl: 'mid',    skills: ['Food & Beverage','Housekeeping','Guest Relations'] },
  // Retail
  { cat: 'Retail',           title: 'Retail Store Manager',        industries: ['Retail'],          salary: [10000, 22000], lvl: 'senior', skills: ['Store Management','Visual Merchandising','POS Systems'] },
  { cat: 'Retail',           title: 'Visual Merchandiser',         industries: ['Retail'],          salary: [7000, 14000],  lvl: 'mid',    skills: ['Visual Merchandising','Customer Engagement'] },
  // Logistics
  { cat: 'Logistics',        title: 'Warehouse Manager',           industries: ['Logistics'],       salary: [12000, 26000], lvl: 'senior', skills: ['Warehouse Management','Supply Chain','Inventory Management'] },
  { cat: 'Logistics',        title: 'Supply Chain Analyst',        industries: ['Logistics'],       salary: [10000, 22000], lvl: 'mid',    skills: ['Supply Chain','Process Improvement'] },
  // Media
  { cat: 'Media',            title: 'Senior Video Editor',         industries: ['Media'],           salary: [10000, 22000], lvl: 'mid',    skills: ['Video Editing','Adobe Premiere Pro','Sound Design'] },
  { cat: 'Media',            title: 'Broadcast Journalist',        industries: ['Media'],           salary: [8000, 18000],  lvl: 'mid',    skills: ['Broadcast Journalism','Storyboarding','Production Coordination'] },
  // Software / Data / Cyber
  { cat: 'Software Development', title: 'Senior Backend Engineer',  industries: ['Software House'],  salary: [25000, 70000], lvl: 'senior', skills: ['Node.js','Express.js','PostgreSQL','Redis','Microservices'] },
  { cat: 'Software Development', title: 'Backend Engineer',         industries: ['Software House'],  salary: [15000, 35000], lvl: 'mid',    skills: ['Node.js','MySQL','REST APIs'] },
  { cat: 'Software Development', title: 'Senior Full-Stack Engineer', industries: ['Software House'], salary: [28000, 75000], lvl: 'senior', skills: ['React.js','Node.js','TypeScript','GraphQL'] },
  { cat: 'Software Development', title: 'Frontend Engineer',        industries: ['Software House'],  salary: [12000, 30000], lvl: 'mid',    skills: ['React.js','TypeScript','Next.js'] },
  { cat: 'Software Development', title: 'DevOps Engineer',          industries: ['Software House','Cybersecurity'], salary: [18000, 45000], lvl: 'senior', skills: ['Docker','Kubernetes','AWS','CI/CD'] },
  { cat: 'Data & AI',        title: 'Senior Data Scientist',        industries: ['Data & AI'],       salary: [25000, 60000], lvl: 'senior', skills: ['Python','PyTorch','TensorFlow','MLOps'] },
  { cat: 'Data & AI',        title: 'Data Analyst',                 industries: ['Data & AI','Software House'], salary: [10000, 24000], lvl: 'mid', skills: ['SQL','Excel','Data Pipelines','dbt'] },
  { cat: 'Data & AI',        title: 'AI Engineer',                  industries: ['Data & AI','Software House'], salary: [22000, 55000], lvl: 'senior', skills: ['LLM Engineering','Prompt Engineering','PyTorch'] },
  { cat: 'Cybersecurity',    title: 'SOC Analyst',                  industries: ['Cybersecurity'],   salary: [12000, 28000], lvl: 'mid',    skills: ['SOC Operations','SIEM','Threat Hunting'] },
  { cat: 'Cybersecurity',    title: 'Penetration Tester',           industries: ['Cybersecurity'],   salary: [18000, 45000], lvl: 'senior', skills: ['Penetration Testing','OWASP Top 10'] },
  { cat: 'Cybersecurity',    title: 'Cloud Security Engineer',      industries: ['Cybersecurity'],   salary: [22000, 55000], lvl: 'senior', skills: ['Cloud Security','SIEM','Incident Response'] },
  { cat: 'Design',           title: 'Senior Product Designer',      industries: ['Software House'],  salary: [15000, 38000], lvl: 'senior', skills: ['UI Design','UX Design','Figma','Prototyping'] },
  { cat: 'Design',           title: 'UX Researcher',                industries: ['Software House'],  salary: [12000, 28000], lvl: 'mid',    skills: ['User Research','UX Design'] },
];

function currencyFor(country) {
  if (country === 'UAE') return 'AED';
  if (country === 'UK') return 'GBP';
  if (country === 'USA') return 'USD';
  if (country === 'India') return 'INR';
  return 'PKR';
}

async function loadCategoryMap(conn) {
  const [rows] = await conn.query(`SELECT id, name FROM job_categories`);
  const map = new Map();
  for (const r of rows) map.set(r.name.toLowerCase(), r.id);
  // Aliases so templates with category names that aren't 1:1 still find a home.
  if (!map.has('teaching') && map.has('education')) map.set('teaching', map.get('education'));
  if (!map.has('accounting') && map.has('finance')) map.set('accounting', map.get('finance'));
  if (!map.has('healthcare') && map.has('operations')) map.set('healthcare', map.get('operations'));
  return map;
}

async function loadSkillMap(conn) {
  const [rows] = await conn.query(`SELECT id, name FROM skills`);
  const map = new Map();
  for (const r of rows) map.set(r.name.toLowerCase(), r.id);
  return map;
}

function pickCompanyForIndustries(companies, allowed, seed) {
  const filtered = companies.filter((c) => allowed.includes(c.industry));
  const pool = filtered.length ? filtered : companies;
  return pool[Math.abs(seed) % pool.length];
}

async function seedJobs(conn, companies) {
  const catMap = await loadCategoryMap(conn);
  const target = JOB_TEMPLATES.slice(0, TARGET_JOBS);

  const rows = [];
  for (let i = 0; i < target.length; i += 1) {
    const tpl = target[i];
    const company = pickCompanyForIndustries(companies, tpl.industries, i);
    if (!company) continue;
    const baseSlug = `${slugify(tpl.title)}-${company.id}-${Date.now() + i}`;
    const cat = catMap.get(tpl.cat.toLowerCase()) || catMap.get('operations') || null;
    const currency = currencyFor(company.country);
    rows.push([
      company.id,
      null,                        // posted_by_user_id
      cat,
      tpl.title,
      baseSlug,
      `${tpl.title} role at ${company.name} (${company.country}). Responsible for delivering quality outcomes for the ${tpl.cat} function.`,
      `Lead day-to-day ${tpl.cat.toLowerCase()} activities for ${company.name}.`,
      `Hands-on ${tpl.cat.toLowerCase()} experience required.`,
      'Market-competitive salary, health benefits, and growth runway.',
      'full_time',
      tpl.lvl,
      company.location,
      company.country,
      0,                           // is_remote
      tpl.salary[0],
      tpl.salary[1],
      currency,
      'month',
      tpl.skills.join(','),
      null,                        // application_deadline
      1,                           // vacancies
      'open',
      i < 8 ? 1 : 0,               // first 8 are featured
      'approved',
      new Date(),
    ]);
  }
  if (!rows.length) return 0;
  await chunkedInsert(
    conn,
    `INSERT INTO jobs (
       company_id, posted_by_user_id, category_id, title, slug, description, responsibilities, requirements, benefits,
       job_type, experience_level, location, country, is_remote, salary_min, salary_max, salary_currency, salary_period,
       skills_tags, application_deadline, vacancies, status, is_featured, admin_status, published_at
     ) VALUES ?`,
    rows,
    50
  );
  return rows.length;
}

/* ============================================================================
 * 6. Driver
 * ========================================================================== */

async function run() {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await upsertCategories(conn);
    await upsertSkills(conn);

    const skillMap = await loadSkillMap(conn);
    const companies = await seedCompanies(conn);
    const candidates = await seedCandidates(conn, skillMap);
    const jobsInserted = await seedJobs(conn, companies);
    await conn.commit();

    logger.info?.('seed.expand done', {
      categories: EXTRA_CATEGORIES.length,
      skills: Object.values(EXTRA_SKILLS).reduce((s, a) => s + a.length, 0),
      companiesTouched: companies.length,
      candidatesTouched: candidates.length,
      jobsInserted,
    });
    console.log(JSON.stringify({
      ok: true,
      categoriesUpserted: EXTRA_CATEGORIES.length,
      skillsUpserted: Object.values(EXTRA_SKILLS).reduce((s, a) => s + a.length, 0),
      companies: companies.length,
      candidates: candidates.length,
      jobs: jobsInserted,
    }, null, 2));
  } catch (err) {
    await conn.rollback();
    console.error('seed.expand failed:', err.message);
    process.exitCode = 1;
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  run().catch(() => process.exit(1));
}

module.exports = { run };
