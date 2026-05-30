'use strict';

/**
 * Multi-industry production-grade seeder.
 * ---------------------------------------
 * Truncates jobs / candidates / companies / skills and their child
 * tables, then reseeds with a realistic catalogue across 22 industries
 * and 18 professions.
 *
 * Style mirrors the existing seed.js + seed.bulk.js:
 *   - mysql2/promise connection helpers
 *   - bcryptjs cost 10 for the demo password (shared hash, computed once)
 *   - chunked multi-row INSERTs (50-200 rows per batch)
 *
 * Truncate strategy:
 *   - admin / super_admin users are PRESERVED
 *   - everything else is reset, including AUTO_INCREMENT counters
 *   - FOREIGN_KEY_CHECKS is temporarily disabled so TRUNCATE works
 *     across the child-to-parent chain
 *
 * Commands:
 *   npm run seed:industries             truncate + reseed
 *   npm run seed:industries:rollback    truncate ONLY (no reseed)
 */

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'Password@123';

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

function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }
function rangePick(min, max, seed) { return min + (Math.abs(seed) % (max - min + 1)); }

async function chunkedInsert(conn, sql, values, chunkSize = 100) {
  if (!values.length) return 0;
  let inserted = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const [res] = await conn.query(sql, [slice]);
    inserted += res?.affectedRows || slice.length;
  }
  return inserted;
}

/* ============================================================================
 * 2. Skills master - 220 skills across 12 categories
 * ========================================================================== */

const SKILLS_BY_CATEGORY = {
  'Technology & Software': [
    'PHP', 'Laravel', 'Symfony', 'CodeIgniter', 'Node.js', 'Express.js', 'NestJS',
    'JavaScript', 'TypeScript', 'React.js', 'Next.js', 'Vue.js', 'Angular',
    'React Native', 'Flutter', 'Android Development', 'iOS Development',
    'Kotlin', 'Swift', 'Java', 'Python', 'Django', 'Flask', 'FastAPI',
    '.NET', 'C#', 'Go', 'Ruby on Rails', 'REST APIs', 'GraphQL',
    'Microservices', 'WebSockets', 'Redis', 'Kafka', 'RabbitMQ',
    'MySQL', 'PostgreSQL', 'MongoDB', 'SQL Server', 'Oracle Database',
    'Database Design', 'API Integration', 'Git', 'GitHub', 'GitLab',
    'Bitbucket', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud',
    'CI/CD', 'DevOps', 'Linux', 'Nginx', 'System Design',
    'Software Architecture', 'Unit Testing', 'Automation Testing',
    'Cybersecurity', 'Cloud Security', 'Data Engineering',
    'Machine Learning', 'AI', 'Prompt Engineering',
  ],
  'Healthcare & Medical': [
    'General Medicine', 'MBBS', 'Nursing', 'Patient Care', 'Pharmacy',
    'Pharmacology', 'Clinical Research', 'Medical Billing', 'Medical Coding',
    'Lab Testing', 'Radiology', 'Physiotherapy', 'Dentistry',
    'Surgery Assistance', 'Emergency Care', 'Hospital Administration',
    'Public Health', 'Nutrition', 'Mental Health Counseling',
    'Medical Equipment Handling',
  ],
  'Education & Teaching': [
    'Classroom Management', 'Lesson Planning', 'Curriculum Development',
    'Early Childhood Education', 'Primary Teaching', 'Secondary Teaching',
    'University Teaching', 'Online Teaching', 'English Teaching',
    'Mathematics Teaching', 'Science Teaching', 'Computer Science Teaching',
    'Special Education', 'Student Assessment', 'Educational Leadership',
    'LMS Management', 'Academic Counseling',
  ],
  'Finance & Accounting': [
    'Accounting', 'Bookkeeping', 'Financial Reporting', 'Taxation',
    'Auditing', 'Budgeting', 'Payroll Management', 'Financial Analysis',
    'Cost Accounting', 'Accounts Payable', 'Accounts Receivable',
    'QuickBooks', 'ERP', 'Excel', 'Risk Management', 'Investment Analysis',
    'Banking Operations',
  ],
  'Sales & Marketing': [
    'Digital Marketing', 'SEO', 'SEM', 'Google Ads', 'Meta Ads',
    'Social Media Marketing', 'Content Marketing', 'Email Marketing',
    'Brand Management', 'Market Research', 'Sales Strategy',
    'Lead Generation', 'B2B Sales', 'B2C Sales', 'CRM',
    'Customer Relationship Management', 'Negotiation', 'Business Development',
    'Account Management', 'E-commerce Marketing',
  ],
  'Human Resources': [
    'Recruitment', 'Talent Acquisition', 'Onboarding', 'Employee Relations',
    'HR Operations', 'Payroll Coordination', 'Performance Management',
    'Training & Development', 'HR Policies', 'Conflict Resolution',
    'Compensation & Benefits', 'Workforce Planning', 'Interviewing',
    'Employer Branding',
  ],
  'Design & Creative': [
    'UI Design', 'UX Design', 'Figma', 'Adobe Photoshop', 'Adobe Illustrator',
    'Adobe XD', 'Graphic Design', 'Motion Graphics', 'Video Editing',
    'Animation', 'Branding', 'Wireframing', 'Prototyping', 'Product Design',
    'User Research', 'Canva',
  ],
  'Engineering & Technical': [
    'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
    'Electronics Engineering', 'Industrial Engineering', 'AutoCAD', 'HVAC',
    'PLC', 'Maintenance Engineering', 'Quality Control', 'Site Supervision',
    'Project Engineering', 'Technical Drawing', 'Safety Compliance',
  ],
  'Legal & Compliance': [
    'Legal Research', 'Contract Drafting', 'Corporate Law', 'Labor Law',
    'Compliance Management', 'Risk Compliance', 'Policy Drafting',
    'Legal Documentation', 'Regulatory Compliance',
  ],
  'Operations & Administration': [
    'Office Administration', 'Data Entry', 'Documentation', 'Vendor Management',
    'Procurement', 'Inventory Management', 'Supply Chain', 'Logistics',
    'Operations Management', 'Facility Management', 'Record Keeping',
    'Scheduling', 'Customer Support', 'Call Center Operations',
  ],
  'Hospitality & Retail': [
    'Hotel Management', 'Front Desk Operations', 'Restaurant Management',
    'Food Safety', 'Customer Service', 'Retail Sales', 'Cash Handling',
    'Store Management', 'Merchandising', 'Housekeeping', 'Event Management',
  ],
  'Media & Content': [
    'Content Writing', 'Copywriting', 'Script Writing', 'Journalism',
    'Blogging', 'Proofreading', 'Editing', 'Video Production', 'Photography',
    'Podcast Production', 'Social Media Content Creation',
  ],
};

/* ============================================================================
 * 3. Companies master - 22 industries x 10 names = 220 companies
 *    Real-sounding catalogue blending Pakistani + international names.
 * ========================================================================== */

const COMPANIES_BY_INDUSTRY = {
  'Software House': [
    'Systems Limited', 'NETSOL Technologies', 'Afiniti', '10Pearls', 'VentureDive',
    'Arbisoft', 'Tintash', 'Soliton Technologies', 'Mindstorm Studios', 'TPS Pakistan',
  ],
  'Hospital': [
    'Aga Khan University Hospital', 'Shifa International Hospital',
    'Liaquat National Hospital', 'Indus Hospital', 'SIUT Karachi',
    'Doctors Hospital Lahore', 'Hameed Latif Hospital', 'CMH Lahore Medical College',
    'Ziauddin Hospital', 'Jinnah Postgraduate Medical Centre',
  ],
  'Clinic': [
    'Nimra Medical Centre', 'Care Plus Clinic', 'Lifeline Family Clinic',
    'CityCare Polyclinic', 'Health First Clinic', 'AlShifa Family Clinic',
    'Wellness Medical Clinic', 'Prime Care Clinic', 'Bright Smile Dental Clinic',
    'Vision Plus Eye Clinic',
  ],
  'Pharmacy': [
    'Servaid Pharmacy', 'D.Watson Chemists', 'Clinix Pharmacy', 'Fazal Din Pharma Plus',
    'Green Cross Pharmacy', 'Health Plus Pharmacy', 'Wellcare Pharmacy',
    'OBS Pharma', 'Searle Pakistan', 'Getz Pharma',
  ],
  'School': [
    'Beaconhouse School System', 'The City School', 'Roots Millennium Schools',
    'Lahore Grammar School', 'Bay View High School', 'Foundation Public School',
    'The Educators', 'Karachi Grammar School', 'Generation School',
    'Headstart Primary School',
  ],
  'College': [
    'Aitchison College', 'Cadet College Hasan Abdal', 'Government College University',
    'St. Patrick\'s College', 'F.G. Sir Syed College', 'PAF College Sargodha',
    'Hilal College', 'D.J. Sindh Government Science College',
    'Forman Christian College', 'Adamjee Government Science College',
  ],
  'University': [
    'Lahore University of Management Sciences', 'NUST Islamabad',
    'Quaid-i-Azam University', 'IBA Karachi', 'GIK Institute',
    'Habib University', 'Karachi University', 'University of the Punjab',
    'COMSATS University Islamabad', 'FAST National University',
  ],
  'Bank': [
    'Habib Bank Limited', 'United Bank Limited', 'MCB Bank',
    'Allied Bank Limited', 'Bank Alfalah', 'Standard Chartered Pakistan',
    'Faysal Bank', 'Meezan Bank', 'JS Bank', 'Bank Al Habib',
  ],
  'Insurance': [
    'EFU General Insurance', 'Jubilee Life Insurance', 'Adamjee Insurance',
    'TPL Insurance', 'State Life Insurance', 'IGI Life Insurance',
    'Asia Insurance Company', 'Pak-Qatar Family Takaful',
    'Allianz EFU Health Insurance', 'Habib Insurance Company',
  ],
  'Retail': [
    'Khaadi', 'Sapphire Retail', 'Outfitters Stores', 'Gul Ahmed Ideas',
    'Junaid Jamshed', 'Limelight Pakistan', 'Bonanza Satrangi',
    'Cross Stitch', 'Saya Pakistan', 'Sana Safinaz',
  ],
  'E-commerce': [
    'Daraz Pakistan', 'Foodpanda Pakistan', 'Bykea', 'Airlift', 'PostEx',
    'TrukkApp', 'Cheetay', 'OLX Pakistan', 'PakWheels',
    'Zameen.com',
  ],
  'Manufacturing': [
    'Engro Corporation', 'Lucky Cement', 'Nishat Mills',
    'Atlas Honda', 'Indus Motor Company', 'Pak Suzuki Motor',
    'Fauji Fertilizer Company', 'Packages Limited', 'International Industries',
    'Crescent Steel & Allied Products',
  ],
  'Construction': [
    'Habib Construction Services', 'Bahria Town', 'DHA Projects',
    'Bina Group', 'Banu Mukhtar Contracting', 'IZHAR Group of Companies',
    'Sardar Builders', 'Imtiaz Group', 'Reliance Construction',
    'Husnain Cotex Limited',
  ],
  'Real Estate': [
    'Zameen.com Real Estate', 'Graana.com', 'Imlaak', 'Property Capital',
    'Pak Properties', 'Capital Smart City', 'Park View City',
    'Lake City Lahore', 'Eden Builders', 'Q-Links Builders',
  ],
  'Logistics': [
    'TCS Logistics', 'Leopards Courier Services', 'M&P Express',
    'BlueEx', 'Call Courier', 'Trax Logistics', 'PostEx Logistics',
    'Movers International', 'Pakistan Cables Logistics', 'Sundar Logistics',
  ],
  'Media': [
    'Geo News', 'Dawn Media Group', 'ARY Network', 'Express Media Group',
    'Hum Network Limited', 'BOL Network', 'Independent Media Corporation',
    'Jang Group', 'Samaa TV', '92 News HD',
  ],
  'Telecom': [
    'Jazz Pakistan', 'Telenor Pakistan', 'Zong CMPak', 'Ufone',
    'Pakistan Telecommunication Company', 'PTCL Group', 'Nayatel',
    'StormFiber', 'Wateen Telecom', 'Multinet Pakistan',
  ],
  'Restaurant': [
    'Kolachi Restaurant', 'Cafe Aylanto', 'BarBQ Tonight', 'Monal Restaurant',
    'Pie In The Sky', 'Cafe Flo', 'Xander\'s Restaurant',
    'Bundu Khan Restaurant', 'Kababjees', 'Tooso Italian Restaurant',
  ],
  'Hotel': [
    'Pearl Continental Hotel', 'Serena Hotels', 'Marriott Hotel Islamabad',
    'Movenpick Hotel Karachi', 'Avari Hotels', 'Ramada by Wyndham',
    'Hotel One', 'Faletti\'s Hotel', 'Beach Luxury Hotel', 'Mehran Hotel',
  ],
  'NGO': [
    'Edhi Foundation', 'Shaukat Khanum Memorial Trust', 'The Citizens Foundation',
    'Aman Foundation', 'Indus Earth Trust', 'SOS Children\'s Villages Pakistan',
    'Akhuwat Foundation', 'Saylani Welfare', 'Alkhidmat Foundation',
    'JDC Welfare Organization',
  ],
  'Legal Firm': [
    'Cornelius Lane & Mufti', 'RIAA Barker Gillette', 'Akhund Forbes',
    'HaidermotaBNR & Co', 'Mohsin Tayebaly & Co', 'A.K. Brohi & Co',
    'Vellani & Vellani', 'Liaquat Merchant Associates', 'Khalid Anwer & Co',
    'Surridge & Beecheno',
  ],
  'Accounting Firm': [
    'A.F. Ferguson & Co (PwC)', 'KPMG Taseer Hadi & Co', 'Deloitte Pakistan',
    'EY Ford Rhodes', 'BDO Ebrahim & Co', 'Grant Thornton Anjum Rahman',
    'Riaz Ahmad & Company', 'Yousuf Adil', 'Crowe Hussain Chaudhury & Co',
    'Russell Bedford Rahman Sarfaraz',
  ],
};

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

/* ============================================================================
 * 4. Professions master - 18 roles with category + skills + salary band
 *    Salary bands are USD-yearly midpoint targets; per-row jitter is applied.
 * ========================================================================== */

const PROFESSIONS = [
  // Software / Engineering
  { title: 'Backend Software Engineer', industry: 'Software House', dept: 'Engineering',
    cat: 'Software Engineering',
    skills: ['Node.js', 'Express.js', 'MySQL', 'Redis', 'REST APIs', 'Docker'],
    salaryMin: 18000, salaryMax: 70000 },
  { title: 'Frontend Software Engineer', industry: 'Software House', dept: 'Engineering',
    cat: 'Software Engineering',
    skills: ['React.js', 'Next.js', 'TypeScript', 'JavaScript', 'GraphQL'],
    salaryMin: 18000, salaryMax: 70000 },
  { title: 'DevOps Engineer', industry: 'Software House', dept: 'DevOps',
    cat: 'Software Engineering',
    skills: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Linux', 'Nginx'],
    salaryMin: 24000, salaryMax: 90000 },

  // Healthcare
  { title: 'General Physician', industry: 'Hospital', dept: 'Medical',
    cat: 'Healthcare',
    skills: ['MBBS', 'General Medicine', 'Patient Care', 'Emergency Care'],
    salaryMin: 25000, salaryMax: 75000 },
  { title: 'Pharmacist', industry: 'Pharmacy', dept: 'Pharmacy',
    cat: 'Healthcare',
    skills: ['Pharmacy', 'Pharmacology', 'Medical Coding', 'Patient Care'],
    salaryMin: 12000, salaryMax: 35000 },
  { title: 'Registered Nurse', industry: 'Hospital', dept: 'Medical',
    cat: 'Healthcare',
    skills: ['Nursing', 'Patient Care', 'Emergency Care', 'Medical Equipment Handling'],
    salaryMin: 10000, salaryMax: 28000 },

  // Education
  { title: 'School Teacher', industry: 'School', dept: 'Academics',
    cat: 'Education',
    skills: ['Classroom Management', 'Lesson Planning', 'Primary Teaching', 'Student Assessment'],
    salaryMin: 8000, salaryMax: 22000 },
  { title: 'University Lecturer', industry: 'University', dept: 'Academics',
    cat: 'Education',
    skills: ['University Teaching', 'Curriculum Development', 'Student Assessment', 'LMS Management'],
    salaryMin: 18000, salaryMax: 55000 },

  // Finance
  { title: 'Senior Accountant', industry: 'Accounting Firm', dept: 'Finance',
    cat: 'Finance',
    skills: ['Accounting', 'Bookkeeping', 'Financial Reporting', 'Auditing', 'Excel'],
    salaryMin: 14000, salaryMax: 45000 },

  // HR
  { title: 'HR Executive', industry: 'Software House', dept: 'HR',
    cat: 'Human Resources',
    skills: ['Recruitment', 'Onboarding', 'HR Operations', 'Performance Management'],
    salaryMin: 10000, salaryMax: 32000 },

  // Sales / Marketing
  { title: 'Sales Manager', industry: 'Retail', dept: 'Sales',
    cat: 'Sales',
    skills: ['B2B Sales', 'Negotiation', 'CRM', 'Lead Generation', 'Account Management'],
    salaryMin: 14000, salaryMax: 55000 },
  { title: 'Digital Marketing Executive', industry: 'E-commerce', dept: 'Marketing',
    cat: 'Marketing',
    skills: ['SEO', 'Google Ads', 'Meta Ads', 'Social Media Marketing', 'Content Marketing'],
    salaryMin: 12000, salaryMax: 38000 },

  // Design
  { title: 'UI/UX Designer', industry: 'Software House', dept: 'Design',
    cat: 'Design',
    skills: ['UI Design', 'UX Design', 'Figma', 'Wireframing', 'Prototyping'],
    salaryMin: 16000, salaryMax: 55000 },

  // Engineering (non-software)
  { title: 'Civil Engineer', industry: 'Construction', dept: 'Engineering',
    cat: 'Operations',
    skills: ['Civil Engineering', 'AutoCAD', 'Site Supervision', 'Safety Compliance'],
    salaryMin: 14000, salaryMax: 50000 },
  { title: 'Mechanical Engineer', industry: 'Manufacturing', dept: 'Engineering',
    cat: 'Operations',
    skills: ['Mechanical Engineering', 'AutoCAD', 'Quality Control', 'Maintenance Engineering'],
    salaryMin: 14000, salaryMax: 50000 },

  // Legal
  { title: 'Legal Officer', industry: 'Legal Firm', dept: 'Legal',
    cat: 'Operations',
    skills: ['Legal Research', 'Contract Drafting', 'Corporate Law', 'Compliance Management'],
    salaryMin: 14000, salaryMax: 60000 },

  // Operations / Admin
  { title: 'Operations Manager', industry: 'Logistics', dept: 'Operations',
    cat: 'Operations',
    skills: ['Operations Management', 'Supply Chain', 'Vendor Management', 'Project Management'],
    salaryMin: 18000, salaryMax: 70000 },
  { title: 'Admin Officer', industry: 'NGO', dept: 'Operations',
    cat: 'Operations',
    skills: ['Office Administration', 'Documentation', 'Scheduling', 'Record Keeping'],
    salaryMin: 8000, salaryMax: 22000 },
  { title: 'Customer Support Representative', industry: 'Telecom', dept: 'Customer Support',
    cat: 'Customer Support',
    skills: ['Customer Service', 'Call Center Operations', 'Customer Support', 'CRM'],
    salaryMin: 8000, salaryMax: 22000 },
  { title: 'Data Entry Operator', industry: 'Bank', dept: 'Operations',
    cat: 'Operations',
    skills: ['Data Entry', 'Excel', 'Documentation', 'Record Keeping'],
    salaryMin: 6000, salaryMax: 16000 },

  // Data / Analytics
  { title: 'Data Analyst', industry: 'Software House', dept: 'Data',
    cat: 'Data Science',
    skills: ['Excel', 'MySQL', 'Python', 'Financial Analysis'],
    salaryMin: 16000, salaryMax: 55000 },

  // Project Management
  { title: 'Project Manager', industry: 'Software House', dept: 'Project Management',
    cat: 'Product Management',
    skills: ['Project Engineering', 'Operations Management', 'Vendor Management', 'Scheduling'],
    salaryMin: 22000, salaryMax: 85000 },
];

/* ============================================================================
 * 5. Location pool - international mix as the brief requested
 * ========================================================================== */

const CITIES = [
  // Pakistan (required by brief)
  { city: 'Karachi', country: 'Pakistan', currency: 'PKR' },
  { city: 'Lahore', country: 'Pakistan', currency: 'PKR' },
  { city: 'Islamabad', country: 'Pakistan', currency: 'PKR' },
  { city: 'Rawalpindi', country: 'Pakistan', currency: 'PKR' },
  { city: 'Hyderabad', country: 'Pakistan', currency: 'PKR' },
  { city: 'Multan', country: 'Pakistan', currency: 'PKR' },
  { city: 'Faisalabad', country: 'Pakistan', currency: 'PKR' },
  // International (required by brief)
  { city: 'Dubai', country: 'United Arab Emirates', currency: 'AED' },
  { city: 'Riyadh', country: 'Saudi Arabia', currency: 'SAR' },
  { city: 'London', country: 'United Kingdom', currency: 'GBP' },
  { city: 'Toronto', country: 'Canada', currency: 'CAD' },
  { city: 'Berlin', country: 'Germany', currency: 'EUR' },
  { city: 'New York', country: 'United States', currency: 'USD' },
];

/* ============================================================================
 * 6. Candidate name pools (kept large enough for 220 unique full names)
 * ========================================================================== */

const FIRST_NAMES = [
  // South Asia
  'Ali', 'Ahmed', 'Bilal', 'Hassan', 'Usman', 'Imran', 'Faisal', 'Saad',
  'Hamza', 'Zain', 'Daniyal', 'Owais', 'Raza', 'Salman', 'Tariq', 'Omar',
  'Abdullah', 'Ibrahim', 'Yousuf', 'Junaid', 'Ayan', 'Mehdi', 'Bilawal',
  'Fatima', 'Sara', 'Ayesha', 'Zainab', 'Maria', 'Hira', 'Mahnoor',
  'Iqra', 'Komal', 'Nida', 'Sana', 'Anum', 'Mehwish', 'Rabia', 'Madiha',
  'Asma', 'Saba', 'Nimra', 'Bushra', 'Hadia', 'Rida',
  // Middle East / Europe / NA
  'Khalid', 'Amir', 'Rashid', 'Jamal', 'Tariq', 'Hisham', 'Karim',
  'Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin',
  'Lucas', 'Henry', 'Theodore', 'Jack', 'Alexander', 'Mason', 'Ethan',
  'Olivia', 'Emma', 'Charlotte', 'Amelia', 'Sophia', 'Isabella', 'Ava',
  'Mia', 'Evelyn', 'Harper', 'Luna', 'Elizabeth', 'Eleanor', 'Abigail',
  'Sofia', 'Avery', 'Scarlett', 'Emily', 'Aria', 'Penelope', 'Chloe',
  'Layla', 'Mila', 'Maya', 'Hannah',
];

const LAST_NAMES = [
  // South Asia
  'Khan', 'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Malik', 'Sheikh',
  'Siddiqui', 'Qureshi', 'Akhtar', 'Mahmood', 'Iqbal', 'Raza', 'Aslam',
  'Rashid', 'Saeed', 'Anwar', 'Javed', 'Mehta', 'Patel', 'Shah',
  'Mughal', 'Awan', 'Chaudhry', 'Butt', 'Tariq', 'Saleem', 'Bukhari',
  // International
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Schmidt', 'Mueller', 'Fischer', 'Weber', 'Schneider', 'Becker',
];

/* ============================================================================
 * 7. Truncate step
 *    Children -> parents. FK_CHECKS off so order is forgiving.
 *    Admins are preserved (handled separately via DELETE WHERE).
 * ========================================================================== */

const TRUNCATE_TABLES = [
  // child mappings first
  'candidate_skills',
  'application_match_results',
  'interviews',
  'favorites',
  'applications',
  'notifications',
  'preferences',
  'resume_parsed_data',
  'resumes',
  // profiles next
  'candidate_profiles',
  'employer_profiles',
  // primary entity tables
  'jobs',
  'companies',
  'skills',
  // auth artefacts of non-admin users
  'email_verification_tokens',
  'password_reset_tokens',
  'refresh_tokens',
];

async function truncateAll(conn) {
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TRUNCATE_TABLES) {
    // wrapped in a try so a missing table on older deployments doesn't abort
    try { await conn.query(`TRUNCATE TABLE \`${t}\``); }
    catch (err) { logger.warn(`truncate ${t} failed`, { error: err.message }); }
  }
  // Preserve admin / super_admin users; reset everything else.
  await conn.query(`DELETE FROM users WHERE role NOT IN ('admin','super_admin')`);
  await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
  logger.info('Truncated companies / jobs / candidates / skills + mapping/child tables (admins preserved).');
}

/* ============================================================================
 * 8. Skills insertion
 * ========================================================================== */

async function seedSkills(conn) {
  const rows = [];
  for (const [category, names] of Object.entries(SKILLS_BY_CATEGORY)) {
    for (const name of names) {
      rows.push([name, slugify(name), category, 1]);
    }
  }
  const sql = `INSERT INTO skills (name, slug, category, is_active) VALUES ?
               ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)`;
  await chunkedInsert(conn, sql, rows, 200);
  // Build a name->id lookup that the candidate/job stages can consume.
  const [out] = await conn.query(`SELECT id, name FROM skills`);
  const idByName = new Map(out.map((r) => [r.name.toLowerCase(), r.id]));
  logger.info(`Seeded skills: ${out.length} rows across ${Object.keys(SKILLS_BY_CATEGORY).length} categories`);
  return idByName;
}

/* ============================================================================
 * 9. Companies insertion
 * ========================================================================== */

async function seedCompanies(conn) {
  const FOUNDED_YEARS = [1995, 2000, 2005, 2008, 2010, 2012, 2014, 2016, 2018, 2020];
  const rows = [];
  let i = 0;
  for (const [industry, names] of Object.entries(COMPANIES_BY_INDUSTRY)) {
    for (const name of names) {
      const loc = CITIES[i % CITIES.length];
      const size = pick(COMPANY_SIZES, i + 1);
      const founded = pick(FOUNDED_YEARS, i + 3);
      const tagline = `${industry} | ${loc.city}, ${loc.country}`;
      const description = [
        `${name} is a ${industry.toLowerCase()} headquartered in ${loc.city}, ${loc.country}.`,
        `Established in ${founded}, the team currently operates in the ${size} headcount band and hires across multiple departments.`,
      ].join(' ');
      const websiteHost = slugify(name).replace(/-/g, '');
      const website = `https://www.${websiteHost}.example.com`;
      rows.push([
        null,                                          // owner_user_id
        name,
        `${slugify(name)}-${i + 1}`,                   // slug (always unique, suffixed)
        tagline,
        description,
        industry,
        size,
        website,
        null,                                          // logo_url
        null,                                          // cover_url
        loc.city,                                      // location
        loc.country,
        founded,
        'verified',                                    // verification_status
        i < 22 ? 1 : 0,                                // is_featured (one per industry)
        'active',                                      // status
      ]);
      i += 1;
    }
  }
  const sql = `INSERT INTO companies
    (owner_user_id, name, slug, tagline, description, industry, size, website,
     logo_url, cover_url, location, country, founded_year,
     verification_status, is_featured, status)
    VALUES ?`;
  await chunkedInsert(conn, sql, rows, 100);
  const [companies] = await conn.query(
    `SELECT id, name, industry, location AS city, country FROM companies ORDER BY id ASC`
  );
  logger.info(`Seeded companies: ${companies.length} rows across ${Object.keys(COMPANIES_BY_INDUSTRY).length} industries`);
  return companies;
}

/* ============================================================================
 * 10. Candidates insertion
 * ========================================================================== */

async function seedCandidates(conn, skillIdByName, total = 220) {
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // STEP A - users
  const userRows = [];
  const meta = [];
  for (let i = 0; i < total; i++) {
    const profession = pick(PROFESSIONS, i);
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 11);
    const full = `${first} ${last}`;
    const loc = CITIES[(i * 3) % CITIES.length];
    const email = `${slugify(first)}.${slugify(last)}.${i + 1}@careers.matchhire.test`;
    const phone = loc.country === 'Pakistan'
      ? `+92 3${(10 + (i % 80)).toString().padStart(2, '0')} ${(1000000 + i).toString().slice(-7)}`
      : `+1 ${(200 + (i % 700)).toString().padStart(3, '0')}-${(1000 + i).toString().slice(-4)}-${(2000 + i).toString().slice(-4)}`;
    userRows.push([
      full, email, phone, password_hash,
      'candidate', 'active', null,
    ]);
    meta.push({ idx: i, profession, full, first, last, email, loc });
  }
  await chunkedInsert(conn,
    `INSERT INTO users (full_name, email, phone, password_hash, role, status, avatar_url) VALUES ?`,
    userRows, 100
  );
  await conn.query(
    `UPDATE users SET email_verified_at = NOW()
     WHERE role = 'candidate' AND email_verified_at IS NULL`
  );

  // STEP B - load assigned user ids
  const emails = meta.map((m) => m.email);
  const [users] = await conn.query(
    `SELECT id, email FROM users WHERE email IN (?)`, [emails]
  );
  const idByEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));

  // STEP C - candidate_profiles
  const profileRows = [];
  for (const m of meta) {
    const uid = idByEmail[m.email]; if (!uid) continue;
    const yrs = rangePick(1, 14, m.idx + m.profession.title.length);
    const salaryMin = m.profession.salaryMin + (m.idx % 10) * 1500;
    const salaryMax = m.profession.salaryMax - (m.idx % 5) * 1500;
    const profile_strength = 60 + ((m.idx * 11) % 35);
    const summary = `${m.profession.title} with ${yrs}+ years of professional experience in ${m.profession.dept.toLowerCase()} across ${m.profession.skills.slice(0, 3).join(', ')}. Currently based in ${m.loc.city}, ${m.loc.country}.`;
    // Education intentionally NULL — same rationale as seed.bulk.js:
    // synthesised education strings polluted real candidates' Profile
    // pages with content they never entered. Real candidates fill
    // this in via the Profile textarea or the resume parser. See
    // `scripts/clear-seeded-education.js` for the one-off cleanup
    // applied to existing seeded rows.
    const education = null;
    const experience = `${m.profession.title} at ${pick(Object.values(COMPANIES_BY_INDUSTRY)[m.idx % 22], m.idx + 1)} (${2018 + (m.idx % 6)} - present)`;
    profileRows.push([
      uid, m.profession.title, summary, m.profession.title, yrs,
      m.loc.city, m.loc.city, m.loc.country, null,
      null,                                          // timezone (not vital here)
      m.idx % 4 === 0 ? 0 : 1,                       // open_to_remote
      salaryMin, Math.max(salaryMin + 5000, salaryMax),
      m.loc.currency, pick(['immediate', 'two_weeks', 'one_month', 'negotiable'], m.idx),
      null, null,
      `https://linkedin.com/in/${slugify(m.full)}-${m.idx}`,
      m.profession.title.toLowerCase().includes('software') || m.profession.title.toLowerCase().includes('devops')
        ? `https://github.com/${slugify(m.first)}${m.idx}` : null,
      education, experience, 'English',
      profile_strength, 1,
    ]);
  }
  await chunkedInsert(conn,
    `INSERT INTO candidate_profiles
       (user_id, headline, summary, current_title, years_experience,
        location, city, country, country_id, timezone, open_to_remote,
        expected_salary_min, expected_salary_max, salary_currency, availability,
        resume_url, portfolio_url, linkedin_url, github_url,
        education, experience, languages, profile_strength, is_public)
       VALUES ?`,
    profileRows, 100
  );

  // STEP D - candidate_skills
  const skillRows = [];
  for (const m of meta) {
    const uid = idByEmail[m.email]; if (!uid) continue;
    for (const skillName of m.profession.skills) {
      const sid = skillIdByName.get(skillName.toLowerCase());
      if (!sid) continue;
      skillRows.push([
        uid, sid,
        pick(['intermediate', 'advanced', 'expert'], m.idx + sid),
        rangePick(1, 10, m.idx + sid),
      ]);
    }
  }
  await chunkedInsert(conn,
    `INSERT INTO candidate_skills (candidate_user_id, skill_id, proficiency, years_experience)
     VALUES ?`,
    skillRows, 200
  );

  logger.info(`Seeded candidates: ${userRows.length} users + ${profileRows.length} profiles + ${skillRows.length} candidate_skills rows`);
  return userRows.length;
}

/* ============================================================================
 * 11. Jobs insertion
 *     Match company industry to the profession's expected industry where
 *     possible (e.g. Hospital posts Doctor / Nurse, Software House posts
 *     Backend Engineer). Falls back to a same-industry pool if no exact match.
 * ========================================================================== */

function pickCompanyForProfession(companies, profession, idx) {
  const sameIndustry = companies.filter((c) => c.industry === profession.industry);
  const pool = sameIndustry.length ? sameIndustry : companies;
  return pool[idx % pool.length];
}

async function seedJobs(conn, companies, skillIdByName, total = 220) {
  // Map job categories the profession references to their ids in
  // job_categories. Categories beyond the existing 10 fall back to NULL
  // so we don't break the FK.
  const [catRows] = await conn.query(`SELECT id, name FROM job_categories`);
  const catIdByName = Object.fromEntries(catRows.map((r) => [r.name, r.id]));
  const matchCategory = (label) => {
    const direct = catIdByName[label];
    if (direct) return direct;
    // Common aliases used in PROFESSIONS.cat
    const alias = {
      Healthcare: catIdByName['Customer Support'] || null,
      Education: catIdByName['Human Resources'] || null,
    };
    return alias[label] || null;
  };

  const WORK_MODES = ['onsite', 'hybrid', 'remote'];
  const JOB_TYPES = ['full_time', 'full_time', 'full_time', 'contract', 'part_time'];
  const EXP_LEVELS = ['entry', 'junior', 'mid', 'senior', 'lead'];

  const rows = [];
  for (let i = 0; i < total; i++) {
    const profession = pick(PROFESSIONS, i);
    const company = pickCompanyForProfession(companies, profession, i);
    const work_mode = pick(WORK_MODES, i + 1);
    const is_remote = work_mode === 'remote' ? 1 : 0;
    const is_global_remote = is_remote && (i % 4 === 0) ? 1 : 0;
    const exp_level = pick(EXP_LEVELS, i + profession.title.length);
    const job_type = pick(JOB_TYPES, i);
    const salaryMin = profession.salaryMin + (i % 15) * 1000;
    const salaryMax = profession.salaryMax - (i % 7) * 1000;
    const slug = `${slugify(profession.title)}-${slugify(company.name)}-${i + 1}`;
    const description = [
      `${company.name} is hiring a ${profession.title} for the ${profession.dept} team in ${company.city || company.country}.`,
      `The role offers ${work_mode} working with a ${exp_level}-level expectation.`,
    ].join(' ');
    const responsibilities = [
      `Own the ${profession.dept.toLowerCase()} workflow end-to-end alongside cross-functional peers.`,
      `Deliver measurable outcomes against a clearly defined quarterly plan.`,
      `Coach junior colleagues and lift the bar on quality and documentation.`,
      `Collaborate with leadership on priorities, hiring, and process improvements.`,
    ].join('\n');
    const requirements = [
      `${exp_level.charAt(0).toUpperCase() + exp_level.slice(1)}-level experience in ${profession.dept.toLowerCase()}.`,
      `Practical skills with ${profession.skills.slice(0, 4).join(', ')}.`,
      `Strong written + verbal communication.`,
      `Comfortable in a fast-moving environment with shifting priorities.`,
    ].join('\n');
    const benefits = 'Health insurance, paid leave, learning stipend, performance bonuses.';

    rows.push([
      company.id,
      null,                                            // posted_by_user_id
      matchCategory(profession.cat),
      profession.title,
      slug,
      description,
      responsibilities,
      requirements,
      benefits,
      job_type,
      exp_level,
      company.city,                                    // location
      company.city,                                    // city
      company.country,
      null,                                            // country_id resolved later
      null,                                            // timezone
      is_remote, work_mode, is_global_remote,
      salaryMin, Math.max(salaryMin + 5000, salaryMax),
      // Salary currency: USD for international, PKR for Pakistan (keep one column consistent)
      company.country === 'Pakistan' ? 'PKR' : 'USD',
      'year',
      profession.skills.join(','),                     // skills_tags
      null,                                            // application_deadline
      (i % 3) + 1,                                     // vacancies
      'open',
      i < 22 ? 1 : 0,                                  // is_featured (one per round-robin)
      'approved',
      new Date(Date.now() - (i * 4 * 3600 * 1000)),   // published_at staggered
    ]);
  }
  await chunkedInsert(conn,
    `INSERT INTO jobs
       (company_id, posted_by_user_id, category_id, title, slug, description,
        responsibilities, requirements, benefits, job_type, experience_level,
        location, city, country, country_id, timezone,
        is_remote, work_mode, is_global_remote,
        salary_min, salary_max, salary_currency, salary_period, skills_tags,
        application_deadline, vacancies, status, is_featured, admin_status, published_at)
     VALUES ?`,
    rows, 50
  );

  // Backfill country_id via the countries table (may not exist on older
  // deployments - swallow errors).
  await conn.query(
    `UPDATE jobs j
       LEFT JOIN countries co ON co.name = j.country
       SET j.country_id = co.id
     WHERE j.country_id IS NULL`
  ).catch(() => null);

  logger.info(`Seeded jobs: ${rows.length} rows linked to companies across ${Object.keys(COMPANIES_BY_INDUSTRY).length} industries`);
}

/* ============================================================================
 * 12. Entry point
 * ========================================================================== */

async function run({ mode = 'apply' } = {}) {
  const conn = await getConnection();
  try {
    // TRUNCATE causes an implicit COMMIT in MySQL; we therefore don't
    // wrap the seeder in a single transaction. The inserts that follow
    // are individually safe (each chunk is its own statement).
    await truncateAll(conn);
    if (mode === 'rollback') {
      logger.info('Rollback mode: truncate done, no reseed.');
      return;
    }
    const skillIdByName = await seedSkills(conn);
    const companies = await seedCompanies(conn);
    await seedCandidates(conn, skillIdByName, 220);
    await seedJobs(conn, companies, skillIdByName, 220);

    const [[cc]] = await conn.query(`SELECT COUNT(*) AS n FROM companies`);
    const [[uu]] = await conn.query(`SELECT COUNT(*) AS n FROM users WHERE role='candidate'`);
    const [[jj]] = await conn.query(`SELECT COUNT(*) AS n FROM jobs`);
    const [[ss]] = await conn.query(`SELECT COUNT(*) AS n FROM skills`);
    const [[cs]] = await conn.query(`SELECT COUNT(*) AS n FROM candidate_skills`);
    logger.info(`Industry seed done. companies=${cc.n}, candidates=${uu.n}, jobs=${jj.n}, skills=${ss.n}, candidate_skills=${cs.n}`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  const mode = (process.argv[2] || 'apply').toLowerCase();
  run({ mode })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Industry seed failed', { error: err.message, stack: err.stack });
      process.exit(1);
    });
}

module.exports = { run };
