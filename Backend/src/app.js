'use strict';

/**
 * Express application
 * -------------------
 * Wires together all middleware, routes, and documentation surfaces. Held
 * intentionally pure of business logic - everything domain-specific lives in
 * the controllers, services, repositories, and middlewares.
 *
 * Mounted surfaces:
 *   GET  /health            - liveness probe + dependency status (DB/Redis)
 *   GET  /api-docs          - Swagger UI (interactive)
 *   GET  /api-docs.json     - Raw OpenAPI 3.0 spec
 *   *    /api/v1/*          - Versioned API routes (see src/routes/index.js)
 *
 * Third-party packages used here:
 *   - express        HTTP framework
 *   - helmet         secure HTTP headers
 *   - cors           cross-origin resource sharing
 *   - compression    gzip compression for responses
 *   - morgan         HTTP request logging (piped into winston)
 *   - swagger-ui-express  renders the OpenAPI spec as interactive docs
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const logger = require('./utils/logger');
const swaggerSpec = require('./docs/swagger');
const response = require('./utils/response.helper');
const { defaultLimiter } = require('./middlewares/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const routes = require('./routes');
const db = require('./config/database');
const redis = require('./config/redis');

const app = express();

// Behind a proxy/load balancer Express needs to trust X-Forwarded-* for IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security + cross-origin handling. Helmet sets sensible defaults; CORS is
// configurable via CORS_ORIGIN (comma-separated list or "*").
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
  credentials: true,
}));
app.use(compression());

// Body parsers (1MB cap is generous for JSON-only API; raise for file upload).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Per-request HTTP log line; piped into winston so the format is consistent.
app.use(morgan(config.isProduction ? 'combined' : 'dev', {
  stream: { write: (m) => logger.info(m.trim()) },
}));

/**
 * Liveness probe used by load balancers and the `/admin/health-summary`
 * endpoint. Returns the same envelope as every other API.
 */
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  return response.success(res, {
    api: 'up',
    database: dbOk ? 'up' : 'down',
    redis: redis.isReady() ? 'up' : 'down (fallback)',
    uptime_seconds: Math.floor(process.uptime()),
    env: config.nodeEnv,
  }, 'OK');
});

// Swagger UI + raw spec. `persistAuthorization` keeps the bearer token across
// page reloads inside the browser - handy when iterating during development.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 1,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
  customSiteTitle: 'MatchHire API Docs',
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

/**
 * Public static mount for profile images.
 * ---------------------------------------
 * Profile images are inherently public (recruiters / other candidates
 * see them on every profile page) so we skip the HMAC signing
 * machinery and serve them directly with cache headers. The bucket
 * is ONLY `profile-images` — sensitive buckets like `resumes`
 * continue to require a signed URL through `/api/v1/files/...`.
 *
 *   Cache-Control: public, max-age=86400, immutable
 *   Cross-Origin-Resource-Policy: cross-origin   (so the SPA on a
 *                                                 different origin can
 *                                                 render the <img>)
 *
 * Files are stored under `Backend/storage/profile-images/<hex>.<ext>`
 * with crypto-random filenames so there's no enumerable path. The
 * extension whitelist + magic-number sniff happen on upload
 * (profileImage.service) so what lands on disk is always a real
 * JPG / PNG / WEBP.
 */
const path = require('node:path');
const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
app.use(
  '/uploads/profile-images',
  express.static(path.join(STORAGE_ROOT, 'profile-images'), {
    maxAge: '1d',
    immutable: true,
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// Versioned API surface. The default rate-limiter is applied at the top of
// the prefix so abusive clients are throttled before hitting any route.
app.use(config.apiPrefix, defaultLimiter, routes);

// 404 + centralised error handler must be registered last.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
