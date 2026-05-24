'use strict';

/**
 * Canonical QA test users. Email + password pairs that every
 * automated test reads from. Kept in code (not in .env) on
 * purpose — they live only in the local dev DB after `qa:seed`,
 * so committing the values doesn't leak any production secret.
 *
 * The seeder (./seed-test-users.js) upserts these rows with the
 * shared password. Tests authenticate via the real /auth/login
 * endpoint, so any change to the auth surface is exercised.
 */

const SHARED_PASSWORD = process.env.QA_TEST_PASSWORD || 'QaTest@1234!';

module.exports = {
  SHARED_PASSWORD,
  CANDIDATE: {
    email: process.env.QA_CANDIDATE_EMAIL || 'qa-candidate@matchhire-qa.com',
    password: SHARED_PASSWORD,
    full_name: 'QA Candidate',
    role: 'candidate',
  },
  COMPANY: {
    email: process.env.QA_COMPANY_EMAIL || 'qa-company@matchhire-qa.com',
    password: SHARED_PASSWORD,
    full_name: 'QA Company Owner',
    role: 'employer',
    company_name: 'QA Test Company',
  },
  ADMIN: {
    email: process.env.QA_ADMIN_EMAIL || 'qa-admin@matchhire-qa.com',
    password: SHARED_PASSWORD,
    full_name: 'QA Admin',
    role: 'admin',
  },
};
