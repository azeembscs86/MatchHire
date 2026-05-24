'use strict';

/**
 * Runs once per Jest worker BEFORE any test file is loaded. We
 * use it to pull in dotenv from the Backend's local config so
 * every API test sees the same DB / JWT / API_URL values the
 * server is using.
 */

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../Backend/.env') });
