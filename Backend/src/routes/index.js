'use strict';

/**
 * Versioned route registry
 * ------------------------
 * Mounted by `app.js` under `${API_PREFIX}` (default `/api/v1`).
 *
 *   /auth        - public + authenticated auth flows (all POST)
 *   /candidates  - candidate-only, authenticated (all POST)
 *   /employers   - employer-only, authenticated (all POST)
 *   /public      - read-only public surface (GET)
 *   /admin       - admin/super_admin only (all POST)
 *   /files       - HMAC-signed file downloads
 *   /search      - ElasticSearch-backed search (with MySQL fallback)
 *   /index       - admin bulk reindex endpoints
 */

const router = require('express').Router();
const authRoutes = require('./auth.routes');
const candidateRoutes = require('./candidate.routes');
const employerRoutes = require('./employer.routes');
const publicRoutes = require('./public.routes');
const adminRoutes = require('./admin.routes');
const fileRoutes = require('./files.routes');
const searchRoutes = require('./search.routes');
const reindexRoutes = require('./index.routes');
const homeRoutes = require('./home.routes');
const mailRoutes = require('./mail.routes');
const skillRoutes = require('./skill.routes');

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/employers', employerRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/files', fileRoutes);
router.use('/search', searchRoutes);
router.use('/index', reindexRoutes);
router.use('/mail', mailRoutes);
router.use('/skills', skillRoutes);
// Auth-aware home + smart-jobs feed (`/home`, `/jobs`, `/jobs/:id`,
// `/jobs/recommended`). Uses optionalAuth so guests and candidates hit
// the same URLs but receive personalised payloads when signed in.
router.use('/', homeRoutes);

module.exports = router;
