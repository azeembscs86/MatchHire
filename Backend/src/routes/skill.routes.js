'use strict';

/**
 * Skill routes (public catalogue surface)
 * ---------------------------------------
 * Mounted at `/api/v1/skills`. Unauthenticated reads — the catalogue
 * is reference data and used by both the candidate SkillsPicker and
 * the job-search filters.
 *
 *   GET /skills              fuzzy search (?search=&limit=)
 *   GET /skills/categories   grouped catalogue (or flat list with ?meta=1)
 *
 * The candidate-by-id public read lives under /public-style
 * `/candidates/:id/skills` (mounted from this file too so the entire
 * skill surface is in one place).
 */

const router = require('express').Router();
const controller = require('../controllers/skill.controller');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @swagger
 * /skills:
 *   get:
 *     tags: [Skills]
 *     summary: Search the skill catalogue
 *     description: |
 *       Fuzzy-search the active skill catalogue. Returns up to `limit`
 *       rows (default 20). Empty `search` returns the first N
 *       alphabetical skills — handy as a "before the user types"
 *       default in the picker.
 *     security: []
 *     parameters:
 *       - { name: search, in: query, schema: { type: string }, description: free-text query }
 *       - { name: limit,  in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       '200':
 *         description: Matching skills
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Skills returned' }
 *               Data:
 *                 records:
 *                   - { id: 12, name: 'React.js',   slug: 'react-js',   category: 'Frontend Development' }
 *                   - { id: 47, name: 'React Native', slug: 'react-native', category: 'Mobile App Development' }
 */
router.get('/', asyncHandler(controller.search));

/**
 * @swagger
 * /skills/categories:
 *   get:
 *     tags: [Skills]
 *     summary: Skill catalogue grouped by category
 *     description: |
 *       By default returns each category with its skills nested
 *       (used by the picker's "Browse by category" panel). Pass
 *       `?meta=1` to get only the category name + count list, which
 *       is cheaper for sidebar navigation.
 *     security: []
 *     parameters:
 *       - { name: meta, in: query, schema: { type: integer, enum: [0, 1] }, description: "1 = flat name+count list only" }
 *     responses:
 *       '200':
 *         description: Categories
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessEnvelope' }
 *             example:
 *               Response: { responseCode: 1, status: 'Success', message: 'Skill categories returned' }
 *               Data:
 *                 records:
 *                   - category: 'Frontend Development'
 *                     count: 8
 *                     skills:
 *                       - { id: 12, name: 'React.js',     slug: 'react-js' }
 *                       - { id: 13, name: 'Next.js',      slug: 'next-js' }
 *                       - { id: 14, name: 'TypeScript',   slug: 'typescript' }
 */
router.get('/categories', asyncHandler(controller.categories));

module.exports = router;
