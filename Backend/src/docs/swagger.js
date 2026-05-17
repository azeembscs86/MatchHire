'use strict';

/**
 * Swagger / OpenAPI entrypoint
 * ----------------------------
 * Builds the OpenAPI 3.0 document for the MatchHire API by:
 *
 *  1. Merging the domain schemas in `src/docs/schemas/*.schema.js` into the
 *     `components.schemas`, `components.responses`, and `components.examples`
 *     buckets.
 *  2. Scanning every route file under `src/routes/` for `@swagger` JSDoc
 *     blocks (via `swagger-jsdoc`) and merging the resulting paths.
 *
 * The final spec is mounted at `/api-docs` by `app.js` and is also served
 * raw on `/api-docs.json` for tooling.
 *
 * Run as `node src/docs/swagger.js` to print the generated spec to stdout.
 */

const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const config = require('../config/env');

const commonSchema = require('./schemas/common.schema');
const authSchema = require('./schemas/auth.schema');
const candidateSchema = require('./schemas/candidate.schema');
const employerSchema = require('./schemas/employer.schema');
const adminSchema = require('./schemas/admin.schema');
const publicSchema = require('./schemas/public.schema');

/** Merge `{schemas, responses, examples}` blocks from each domain schema. */
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

/** Static OpenAPI definition: metadata, servers, security, tags, components. */
const definition = {
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
    { url: `{scheme}://{host}${config.apiPrefix}`, description: 'Custom', variables: {
      scheme: { default: 'https', enum: ['https', 'http'] },
      host: { default: 'api.matchhire.example.com' },
    } },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication and account flows' },
    { name: 'Public', description: 'Unauthenticated read-only endpoints (cached)' },
    { name: 'Candidates', description: 'Authenticated candidate endpoints (all POST)' },
    { name: 'Employers', description: 'Authenticated employer endpoints (all POST)' },
    { name: 'Admin', description: 'Admin / super_admin moderation endpoints (all POST)' },
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

/** Glob-style list of files swagger-jsdoc scans for `@swagger` blocks. */
const apis = [
  path.resolve(__dirname, '..', 'routes', '*.js'),
];

const swaggerSpec = swaggerJSDoc({ definition, apis });

if (require.main === module) {
  process.stdout.write(JSON.stringify(swaggerSpec, null, 2));
}

module.exports = swaggerSpec;
