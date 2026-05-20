'use strict';

/**
 * Swagger / OpenAPI entrypoint
 * ----------------------------
 * Builds the OpenAPI 3.0 document for the MatchHire API.
 *
 * Pipeline:
 *   1. Merge the per-domain schema bundles from `src/docs/schemas/*.schema.js`
 *      into `components.schemas`, `components.responses`, and
 *      `components.examples`.
 *   2. Scan every `src/routes/*.js` file for JSDoc blocks that contain
 *      `@swagger` and parse the YAML body into the `paths` object.
 *
 * The scanner is intentionally tiny and dependency-light - no
 * `swagger-jsdoc` (which dragged in deprecated `inflight`, `lodash.get`,
 * `lodash.isequal`, old `glob`, and triggered DEP0169 `url.parse()` at
 * runtime). We use only `node:fs`, `node:path`, and `js-yaml`.
 *
 * The final spec is mounted at `/api-docs` by `app.js` and served raw on
 * `/api-docs.json`.  Run as `node src/docs/swagger.js` to dump the spec
 * to stdout.
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const config = require('../config/env');

const commonSchema = require('./schemas/common.schema');
const authSchema = require('./schemas/auth.schema');
const candidateSchema = require('./schemas/candidate.schema');
const employerSchema = require('./schemas/employer.schema');
const adminSchema = require('./schemas/admin.schema');
const publicSchema = require('./schemas/public.schema');

/**
 * Merge the `{schemas, responses, examples}` blocks exported by each
 * domain schema file into a single components object.
 */
function mergeComponents(parts) {
  const out = { schemas: {}, responses: {}, examples: {} };
  for (const part of parts) {
    if (!part) continue;
    Object.assign(out.schemas, part.schemas || {});
    Object.assign(out.responses, part.responses || {});
    Object.assign(out.examples, part.examples || {});
  }
  return out;
}

const components = mergeComponents([
  commonSchema, authSchema, candidateSchema, employerSchema, adminSchema, publicSchema,
]);

/**
 * Extract all `@swagger` JSDoc blocks from a single source file.
 * Returns an array of YAML strings (one per JSDoc block).
 *
 * Recognises the conventional layout:
 *   /**
 *    * @swagger
 *    * /some/path:
 *    *   post:
 *    *     ...
 *    *\/
 */
function extractSwaggerBlocks(source) {
  const blocks = [];
  const jsdoc = /\/\*\*([\s\S]*?)\*\//g;
  let match;
  while ((match = jsdoc.exec(source)) !== null) {
    const raw = match[1];
    if (!raw.includes('@swagger')) continue;
    // Strip the JSDoc leader (`* `) from each line, then capture only
    // the content AFTER the first `@swagger` keyword. Authors may
    // include prose above the tag (for human readers); we don't want
    // that prose ending up in the YAML parser.
    const stripped = raw
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, ''))
      .join('\n');
    const idx = stripped.indexOf('@swagger');
    if (idx < 0) continue;
    const yamlBody = stripped.slice(idx + '@swagger'.length).trim();
    if (yamlBody) blocks.push(yamlBody);
  }
  return blocks;
}

/**
 * Scan every `*.js` file in the routes directory and parse the YAML
 * inside each `@swagger` block. Each parsed object is shaped like an
 * OpenAPI `paths` fragment and merged into the final `paths` object.
 */
function collectPaths() {
  const routesDir = path.resolve(__dirname, '..', 'routes');
  const paths = {};
  if (!fs.existsSync(routesDir)) return paths;

  const files = fs.readdirSync(routesDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(routesDir, f));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const blocks = extractSwaggerBlocks(source);
    for (const block of blocks) {
      let parsed;
      try {
        parsed = yaml.load(block, { filename: file });
      } catch (err) {
        const rel = path.relative(process.cwd(), file);
        throw new Error(`Failed to parse @swagger block in ${rel}: ${err.message}`);
      }
      if (!parsed || typeof parsed !== 'object') continue;
      for (const [pathName, ops] of Object.entries(parsed)) {
        paths[pathName] = { ...(paths[pathName] || {}), ...ops };
      }
    }
  }
  return paths;
}

/** Static OpenAPI 3.0 root: metadata, servers, security, tags, components. */
const baseDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'MatchHire Job Portal API',
    version: '1.0.0',
    description: [
      'Production-ready REST API for the MatchHire job portal.',
      '',
      '## Conventions',
      '- **Every response** uses the same envelope: `{ "Response": {...}, "Data": {...} }`.',
      '- **Authenticated APIs are POST-only** (project rule). Pagination/filters live in the request body.',
      '- **Public APIs remain GET** with query-string filters.',
      '- `responseCode: 1` = success, `responseCode: 0` = failure.',
      '- Validation failures return `Errors: []` instead of `Data`.',
      '',
      '## Authentication',
      'Login via `POST /auth/login`, then click **Authorize** and paste the `access_token`.',
      'Refresh with `POST /auth/refresh-token` when the access token expires.',
    ].join('\n'),
    contact: { name: 'MatchHire Engineering' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: `http://localhost:${config.port}${config.apiPrefix}`, description: 'Local development' },
    {
      url: `{scheme}://{host}${config.apiPrefix}`,
      description: 'Custom',
      variables: {
        scheme: { default: 'https', enum: ['https', 'http'] },
        host: { default: 'api.matchhire.example.com' },
      },
    },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication and account flows' },
    { name: 'Public', description: 'Unauthenticated read-only endpoints (cached)' },
    { name: 'Home', description: 'Auth-aware homepage + smart job feed (GET; personalised when signed in)' },
    { name: 'Candidates', description: 'Authenticated candidate endpoints (all POST)' },
    { name: 'Employers', description: 'Authenticated employer endpoints (all POST)' },
    { name: 'Admin', description: 'Admin / super_admin moderation endpoints (all POST)' },
    { name: 'Mail', description: 'Gmail SMTP test surface (send-test, send-otp, send-welcome, verify)' },
    { name: 'Skills', description: 'Skill catalogue (public reads) and candidate skill management' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `access_token` returned by `/auth/login`.',
      },
    },
    schemas: components.schemas,
    responses: components.responses,
    examples: components.examples,
  },
  security: [{ bearerAuth: [] }],
};

/** Final, fully assembled OpenAPI 3.0 spec. */
const swaggerSpec = {
  ...baseDefinition,
  paths: collectPaths(),
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(swaggerSpec, null, 2));
}

module.exports = swaggerSpec;
