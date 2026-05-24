'use strict';

/**
 * Shared environment access for the QA suite. Loads Backend's
 * `.env.local` first (DB creds, JWT secret), then Backend's
 * `.env` (defaults). Test-suite overrides live in process.env
 * and take precedence.
 *
 * Usage from any test file:
 *   const { API_URL, BASE_URL, qaUser } = require('../helpers/env');
 */

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env') });

const users = require('../test-data/users');

const API_URL = process.env.QA_API_URL
  || `http://localhost:${process.env.PORT || 3500}${process.env.API_PREFIX || '/api/v1'}`;
const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:5173';

module.exports = {
  API_URL,
  BASE_URL,
  CANDIDATE: users.CANDIDATE,
  COMPANY: users.COMPANY,
  ADMIN: users.ADMIN,
  qaUser: (role) => users[String(role).toUpperCase()] || null,
};
