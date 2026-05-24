'use strict';

/**
 * QA test-user seeder
 * -------------------
 * Idempotently upserts the three canonical QA accounts
 * (candidate, employer, admin) directly into MySQL with a known
 * bcrypt password. The Playwright + Jest suites authenticate via
 * the real `/auth/login` endpoint using these creds, so we don't
 * have to ship real-user passwords through env vars.
 *
 * Run manually:   `node qa/test-data/seed-test-users.js`
 * Or via npm:     `npm run qa:seed`
 *
 * Uses the SAME DB connection settings as the backend (reads
 * Backend/.env.local). Safe to re-run — bcrypt hash is recomputed
 * each run so callers can rotate the QA password by editing
 * `users.js` and re-seeding.
 */

const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const { CANDIDATE, COMPANY, ADMIN, SHARED_PASSWORD } = require('./users');

// Load Backend/.env.local (gitignored — same file the API reads).
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env') });

function getDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  };
}

async function upsertUser(conn, user, passwordHash) {
  // Roles in the DB enum: 'candidate', 'employer', 'admin', 'super_admin'.
  await conn.execute(
    `INSERT INTO users (full_name, email, password_hash, role, status, email_verified_at, created_at)
     VALUES (?, ?, ?, ?, 'active', NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       status = 'active',
       email_verified_at = COALESCE(email_verified_at, NOW()),
       updated_at = NOW()`,
    [user.full_name, user.email, passwordHash, user.role]
  );
  const [[row]] = await conn.execute(
    `SELECT id, role FROM users WHERE email = ? LIMIT 1`,
    [user.email]
  );
  return row;
}

async function ensureCandidateProfile(conn, userId) {
  // Public profile so the user appears in similarity / recommended
  // feeds the candidate-flow tests verify.
  await conn.execute(
    `INSERT INTO candidate_profiles
       (user_id, headline, current_title, summary, years_experience,
        location, country, open_to_remote, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE
       headline = VALUES(headline),
       current_title = VALUES(current_title),
       summary = VALUES(summary),
       years_experience = VALUES(years_experience),
       is_public = 1`,
    [
      userId,
      'QA Candidate · Backend Engineer',
      'Senior Backend Engineer',
      'Synthetic profile used by the QA automation suite.',
      6,
      'Karachi',
      'Pakistan',
    ]
  );
}

async function ensureEmployerCompany(conn, ownerUserId, companyName) {
  // Upsert the employer's company so the dashboard endpoints + the
  // /employers/recommended-candidates surface have something to
  // anchor on. Slug derived from name (lowercase + dashes).
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await conn.execute(
    `INSERT INTO companies
       (owner_user_id, name, slug, industry, location, country,
        verification_status, status, created_at)
     VALUES (?, ?, ?, 'Software / SaaS', 'Karachi', 'Pakistan',
             'verified', 'active', NOW())
     ON DUPLICATE KEY UPDATE
       owner_user_id = VALUES(owner_user_id),
       industry = VALUES(industry),
       location = VALUES(location),
       country = VALUES(country),
       verification_status = 'verified',
       status = 'active',
       updated_at = NOW()`,
    [ownerUserId, companyName, slug]
  );
}

async function main() {
  const conn = await mysql.createConnection(getDbConfig());
  try {
    const hash = await bcrypt.hash(SHARED_PASSWORD, 10);

    const candidate = await upsertUser(conn, CANDIDATE, hash);
    await ensureCandidateProfile(conn, candidate.id);

    const employer = await upsertUser(conn, COMPANY, hash);
    await ensureEmployerCompany(conn, employer.id, COMPANY.company_name);

    const admin = await upsertUser(conn, ADMIN, hash);

    // eslint-disable-next-line no-console
    console.log(`QA test users ready:
  candidate id=${candidate.id}   email=${CANDIDATE.email}
  employer  id=${employer.id}    email=${COMPANY.email}
  admin     id=${admin.id}       email=${ADMIN.email}
  shared password = (read from QA_TEST_PASSWORD or default)`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
