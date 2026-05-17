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
 */

const router = require('express').Router();
const authRoutes = require('./auth.routes');
const candidateRoutes = require('./candidate.routes');
const employerRoutes = require('./employer.routes');
const publicRoutes = require('./public.routes');
const adminRoutes = require('./admin.routes');
const fileRoutes = require('./files.routes');

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/employers', employerRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/files', fileRoutes);

module.exports = router;
