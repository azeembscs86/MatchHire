'use strict';

/**
 * Additive skill catalogue seeder.
 * --------------------------------
 * Tops up the `skills` table with the categories called out in the
 * "Skills & Expertise" product spec. Categories such as
 * "Frontend Development", "Backend Development", "Mobile App
 * Development", "UI/UX Design", "QA & Testing", "DevOps & Cloud",
 * "Database", "Project Management", "Content Writing", and
 * "Business Operations" did not have first-class buckets in the
 * earlier seeders (where they were folded into umbrella categories
 * like "Technology & Software" or "Design & Creative"). This
 * seeder gives the SkillsPicker tidy, narrowly-scoped category
 * groups without disturbing existing rows.
 *
 * Conventions match seed.industries / seed.expand:
 *   - mysql2/promise direct connection
 *   - INSERT IGNORE on (name, slug) so re-runs are safe
 *   - never deletes or modifies existing rows
 *
 * Command:
 *   npm run seed:skills
 */

const mysql = require('mysql2/promise');
const config = require('../config/env');
const logger = require('../utils/logger');

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

/**
 * Catalogue defined per the product spec. Skills already present
 * under another category (e.g. "React.js" is currently under
 * "Technology & Software") will be left alone — the seeder uses
 * INSERT IGNORE on the unique slug, so the row's original category
 * is preserved.  If you want to consolidate older rows into these
 * new buckets, run a one-off migration; this file is intentionally
 * non-destructive.
 */
const SKILLS_BY_CATEGORY = {
  'Software Development': [
    'Software Engineering', 'Object-Oriented Programming', 'Functional Programming',
    'System Design', 'Software Architecture', 'Design Patterns',
    'Test-Driven Development', 'Code Review', 'Refactoring', 'Debugging',
  ],
  'Frontend Development': [
    'HTML', 'CSS', 'JavaScript', 'TypeScript',
    'React.js', 'Next.js', 'Vue.js', 'Nuxt.js', 'Angular',
    'Tailwind CSS', 'Bootstrap', 'SASS', 'Material UI',
    'Redux', 'React Query', 'Zustand', 'Web Accessibility (WCAG)',
    'Responsive Design', 'Web Performance', 'Vite', 'Webpack',
  ],
  'Backend Development': [
    'Node.js', 'Express.js', 'NestJS', 'Fastify',
    'PHP', 'Laravel', 'Symfony', 'CodeIgniter',
    'Python', 'Django', 'Flask', 'FastAPI',
    'Java', 'Spring Boot', 'Kotlin (Backend)',
    'Go', 'Rust (Backend)', 'Ruby on Rails',
    'REST APIs', 'GraphQL', 'gRPC', 'WebSockets',
    'Authentication & Authorization', 'JWT', 'OAuth 2.0',
    'Background Jobs', 'Cron Scheduling',
  ],
  'Mobile App Development': [
    'React Native', 'Flutter', 'Expo',
    'Android (Kotlin)', 'Android (Java)', 'iOS (Swift)', 'iOS (Objective-C)',
    'Mobile UI/UX', 'Push Notifications', 'In-App Purchases',
    'App Store Optimization', 'Mobile App Architecture',
  ],
  'UI/UX Design': [
    'UI Design', 'UX Design', 'User Research', 'Wireframing', 'Prototyping',
    'Design Systems', 'Figma', 'Sketch', 'Adobe XD',
    'Accessibility (a11y)', 'Interaction Design', 'Information Architecture',
    'Usability Testing', 'Design Thinking',
  ],
  'QA & Testing': [
    'Manual Testing', 'Automation Testing', 'Test Planning', 'Test Case Design',
    'Selenium', 'Cypress', 'Playwright', 'Appium',
    'API Testing', 'Postman', 'JMeter', 'Performance Testing',
    'Load Testing', 'Security Testing', 'Regression Testing',
    'Jest', 'Mocha', 'JUnit', 'TestNG',
  ],
  'DevOps & Cloud': [
    'AWS', 'Azure', 'Google Cloud Platform', 'DigitalOcean',
    'Docker', 'Kubernetes', 'Helm', 'Terraform', 'Ansible',
    'CI/CD', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI',
    'Nginx', 'Apache', 'Linux Administration', 'Bash Scripting',
    'Monitoring', 'Prometheus', 'Grafana', 'Datadog',
    'Site Reliability Engineering', 'Infrastructure as Code',
  ],
  'Database': [
    'MySQL', 'PostgreSQL', 'SQL Server', 'Oracle Database', 'SQLite',
    'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'Cassandra',
    'Database Design', 'Database Optimisation', 'Query Tuning',
    'Schema Migration', 'Data Modeling', 'Stored Procedures', 'Indexing',
  ],
  'Data Science & AI': [
    'Python (Data)', 'R', 'Pandas', 'NumPy', 'SciPy', 'scikit-learn',
    'TensorFlow', 'PyTorch', 'Keras',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
    'LLM Engineering', 'Prompt Engineering', 'Vector Databases',
    'MLOps', 'Data Pipelines', 'ETL', 'Apache Airflow',
    'Data Visualisation', 'Tableau', 'Power BI', 'Looker',
    'Statistical Modeling',
  ],
  'Cybersecurity': [
    'Application Security', 'Cloud Security', 'Network Security',
    'Penetration Testing', 'Vulnerability Assessment', 'Threat Modeling',
    'Incident Response', 'SOC Operations', 'SIEM', 'OWASP Top 10',
    'IAM', 'Zero Trust', 'Cryptography', 'Secure Coding',
    'Security Auditing', 'Compliance (SOC 2, ISO 27001)',
  ],
  'Project Management': [
    'Agile', 'Scrum', 'Kanban', 'SAFe',
    'Project Planning', 'Roadmapping', 'Risk Management',
    'Stakeholder Management', 'Jira', 'Asana', 'Trello',
    'Resource Allocation', 'Budgeting', 'Sprint Planning',
    'Retrospectives', 'OKRs', 'PMP', 'PRINCE2',
  ],
  'Marketing': [
    'Digital Marketing', 'SEO', 'SEM', 'PPC Advertising',
    'Google Ads', 'Meta Ads', 'TikTok Ads', 'LinkedIn Ads',
    'Content Marketing', 'Email Marketing', 'Marketing Automation',
    'HubSpot', 'Mailchimp', 'Marketo',
    'Brand Strategy', 'Growth Marketing', 'Performance Marketing',
    'Social Media Strategy', 'Influencer Marketing',
    'Marketing Analytics', 'Google Analytics',
  ],
  'Sales': [
    'B2B Sales', 'B2C Sales', 'Enterprise Sales', 'Inside Sales',
    'Outbound Prospecting', 'Cold Outreach', 'Lead Qualification',
    'Account Management', 'Account-Based Selling',
    'Salesforce', 'HubSpot CRM', 'Pipedrive',
    'Negotiation', 'Closing Deals', 'Sales Forecasting',
    'Pipeline Management', 'Channel Sales',
  ],
  'Finance': [
    'Financial Modeling', 'Financial Analysis', 'Equity Research',
    'Treasury Operations', 'Cash Flow Management', 'Budgeting & Forecasting',
    'Investment Analysis', 'Risk Management', 'Banking Operations',
    'Credit Analysis', 'Corporate Finance', 'FP&A',
    'Accounting Standards (IFRS, GAAP)', 'Excel Financial Modeling',
  ],
  'HR': [
    'Recruitment', 'Technical Recruiting', 'Talent Acquisition',
    'Onboarding', 'Employee Engagement', 'Performance Management',
    'HR Analytics', 'HRIS', 'Workday', 'BambooHR',
    'Compensation & Benefits', 'Workforce Planning', 'Employee Relations',
    'Learning & Development', 'Diversity & Inclusion',
  ],
  'Healthcare': [
    'Patient Care', 'Clinical Procedures', 'Triage', 'ICU Care',
    'Surgical Assistance', 'Emergency Response', 'Diagnosis',
    'Phlebotomy', 'Radiology', 'Pharmacy Operations', 'EHR Systems',
    'Clinical Research', 'Medical Coding', 'Medical Billing',
    'Public Health', 'Telemedicine',
  ],
  'Education': [
    'Lesson Planning', 'Curriculum Development', 'Classroom Management',
    'Student Assessment', 'Distance Learning', 'STEM Teaching',
    'Special Education', 'Educational Leadership', 'Academic Research',
    'University Lecturing', 'LMS Management', 'Course Design',
  ],
  'Engineering': [
    'Civil Engineering', 'Structural Design', 'AutoCAD', 'Revit',
    'Mechanical Design', 'HVAC', 'BIM',
    'Electrical Engineering', 'PLC Programming', 'Embedded Systems',
    'Industrial Engineering', 'Process Engineering',
    'Site Engineering', 'Quality Assurance', 'Safety Standards',
  ],
  'Customer Support': [
    'Helpdesk Operations', 'Ticket Triage', 'Customer Success',
    'Customer Onboarding', 'Account Health Monitoring',
    'Zendesk', 'Intercom', 'Freshdesk', 'Salesforce Service Cloud',
    'Conflict Resolution', 'Bilingual Support', 'Live Chat Support',
    'Knowledge Base Management',
  ],
  'Content Writing': [
    'Copywriting', 'Technical Writing', 'SEO Writing',
    'Blog Writing', 'Long-form Content', 'Editing & Proofreading',
    'Content Strategy', 'Storytelling', 'Email Copy',
    'Social Media Copy', 'Ghostwriting', 'Press Releases',
    'Style Guides', 'Brand Voice Development',
  ],
  'Business Operations': [
    'Operations Management', 'Process Improvement', 'Six Sigma',
    'Lean Operations', 'Vendor Management', 'Procurement',
    'Inventory Management', 'Supply Chain', 'Logistics',
    'Office Administration', 'Documentation', 'Reporting',
    'Workflow Automation', 'KPI Tracking', 'Operational Excellence',
  ],
};

async function chunkedInsert(conn, sql, values, chunkSize = 200) {
  if (!values.length) return 0;
  let inserted = 0;
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const [res] = await conn.query(sql, [slice]);
    inserted += res?.affectedRows || 0;
  }
  return inserted;
}

async function run() {
  const conn = await getConnection();
  try {
    const rows = [];
    for (const [category, names] of Object.entries(SKILLS_BY_CATEGORY)) {
      for (const name of names) {
        rows.push([name, slugify(name), category, 1]);
      }
    }
    const inserted = await chunkedInsert(
      conn,
      `INSERT IGNORE INTO skills (name, slug, category, is_active) VALUES ?`,
      rows
    );

    // Quick verification readout.
    const [[totals]] = await conn.query(`SELECT COUNT(*) AS n FROM skills`);
    const [byCat] = await conn.query(
      `SELECT category, COUNT(*) AS n FROM skills
       WHERE category IN (?)
       GROUP BY category ORDER BY category`,
      [Object.keys(SKILLS_BY_CATEGORY)]
    );

    logger.info?.('seed.skills done', { inserted, total: totals.n });
    console.log(JSON.stringify({
      ok: true,
      inserted_new_rows: inserted,
      total_skills_now: Number(totals.n),
      categories_touched: byCat.map((r) => ({ category: r.category, count: Number(r.n) })),
    }, null, 2));
  } catch (err) {
    console.error('seed.skills failed:', err.message);
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
