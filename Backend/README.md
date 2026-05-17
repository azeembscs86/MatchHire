# MatchHire Job Portal - Backend API

Production-ready REST API for the MatchHire job portal. Built with Node.js, Express, MySQL, and Redis.

> **New developer?** Start with [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md). It covers architecture, request lifecycle, conventions, and how to add new APIs/tables/services.

## Overview

The backend powers the MatchHire frontend with full functionality for candidates, employers, and admins:

- JWT authentication with access + refresh token rotation
- Role-based access control (`candidate`, `employer`, `admin`, `super_admin`)
- Full CRUD for jobs, companies, candidates, applications, interviews, favorites
- Public read-only endpoints with Redis caching and graceful MySQL fallback
- Admin dashboard, company verification workflow, and audit logging
- Joi validation, centralised error handling, rate limiting, Helmet, CORS
- **Interactive Swagger / OpenAPI 3.0 docs at [`/api-docs`](http://localhost:3500/api-docs)**

A single consistent response envelope is used across every endpoint (see [Response Envelope](#response-envelope) below).

## Backend standards (at a glance)

| Standard | Rule |
| --- | --- |
| **Authenticated APIs** | POST-only. Pagination/filters live in the request body. |
| **Public APIs** | GET only (no authentication, results cached in Redis). |
| **Response envelope** | Always `{ Response: {...}, Data: {...} }`. Validation failures use `Errors: []`. |
| **Response codes** | `responseCode: 1` = success, `responseCode: 0` = failure. |
| **API versioning** | All routes mounted under `/api/v1`. |
| **Validation** | Joi schemas; failures return HTTP 422 with the validation envelope. |
| **Errors** | Operational errors throw `AppError`; the central handler maps to status + envelope. |
| **SQL** | Always parameterised with `?`. Repositories own all SQL. |
| **Cache** | Redis with TTLs in `cache.helper.js`. The service layer invalidates on writes. |
| **Documentation** | OpenAPI 3.0 via JSDoc on each route; reusable schemas under `src/docs/schemas/`. |

The full ruleset and rationale lives in [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4
- **Database**: MySQL 8 (`mysql2` driver, parameterised queries)
- **Cache**: Redis (`ioredis`) with automatic MySQL fallback when Redis is unavailable
- **Auth**: JWT (access + refresh), `bcryptjs` hashing
- **Validation**: Joi
- **Docs**: `swagger-jsdoc` + `swagger-ui-express`
- **Security**: helmet, cors, express-rate-limit
- **Logging**: winston + morgan

## Folder Structure

```
Backend/
├── docs/
│   └── DEVELOPER_GUIDE.md           how to work in this codebase
├── src/
│   ├── app.js                       Express wiring (middleware + routes + docs)
│   ├── server.js                    Process entrypoint
│   ├── config/                      env / database / redis
│   ├── cache/                       Redis helpers with MySQL fallback
│   ├── constants/                   responseCodes, roles
│   ├── controllers/                 HTTP boundary (no SQL, no business logic)
│   ├── services/                    business logic + cache invalidation
│   ├── repositories/                MySQL queries only
│   ├── routes/                      URL + middleware chain + @swagger JSDoc
│   ├── middlewares/                 auth, role, validate, error, rateLimit
│   ├── validators/                  Joi schemas
│   ├── docs/                        Swagger entrypoint + reusable schemas
│   │   ├── swagger.js
│   │   └── schemas/
│   │       ├── common.schema.js
│   │       ├── auth.schema.js
│   │       ├── candidate.schema.js
│   │       ├── employer.schema.js
│   │       ├── admin.schema.js
│   │       └── public.schema.js
│   ├── database/
│   │   ├── migrations/              17 idempotent migrations
│   │   ├── migrate.js               up / rollback runner
│   │   └── seed.js                  demo data
│   └── utils/
│       ├── response.helper.js
│       ├── logger.js
│       ├── pagination.js
│       ├── asyncHandler.js
│       └── AppError.js
├── .env.example / .env.local / .env.production
├── .eslintrc.json
├── .gitignore
└── package.json
```

## Response envelope

**Success**
```json
{
  "Response": { "responseCode": 1, "status": "Success", "message": "Data Returned Successfully" },
  "Data": { }
}
```

**Error**
```json
{
  "Response": { "responseCode": 0, "status": "Error", "message": "Something went wrong" },
  "Data": null
}
```

**Validation Error**
```json
{
  "Response": { "responseCode": 0, "status": "Validation Error", "message": "Invalid request data" },
  "Errors": [ { "field": "email", "message": "email is required", "type": "any.required" } ]
}
```

**Paginated List**
```json
{
  "Response": { "responseCode": 1, "status": "Success", "message": "Jobs Returned Successfully" },
  "Data": {
    "records": [],
    "pagination": { "page": 1, "limit": 10, "total": 100, "totalPages": 10 }
  }
}
```

Controllers always go through helpers in [src/utils/response.helper.js](src/utils/response.helper.js). Do not return raw JSON.

## Swagger / API Documentation

Interactive docs and the raw OpenAPI 3.0 spec are served by the API itself:

| URL | What it serves |
| --- | --- |
| `http://localhost:3500/api-docs` | Swagger UI - tag-grouped, runnable in browser |
| `http://localhost:3500/api-docs.json` | Raw OpenAPI 3.0 JSON (for Postman, codegen, CI tooling) |
| `npm run docs` | Prints the spec to stdout |

**How to use Swagger UI**

1. Open `/api-docs` in the browser.
2. Call `POST /auth/login` (in the Auth tag) with seeded credentials.
3. Copy `access_token` from the response.
4. Click the green **Authorize** button at the top of the page.
5. Paste `Bearer <access_token>` and hit Authorize.
6. Every protected endpoint becomes runnable.

The spec is generated at startup from the JSDoc `@swagger` blocks above each route in `src/routes/*.js` and the reusable components under `src/docs/schemas/*.schema.js`. There is no hand-maintained JSON to keep in sync. See [docs/DEVELOPER_GUIDE.md > How to add Swagger docs for a route](docs/DEVELOPER_GUIDE.md#17-how-to-add-swagger-docs-for-a-new-route) for the conventions.

## Local Setup

### Prerequisites

- Node.js 18 or newer
- MySQL 8 running locally (or Docker / MAMP)
- Redis 6+ (optional - the API works without it via fallback)

### Install

```bash
cd Backend
npm install
```

### Configure environment

```bash
cp .env.example .env.local
# edit .env.local - set DB_USER, DB_PASSWORD, JWT_SECRET, REDIS_* if needed
```

The loader reads `.env.${NODE_ENV}` first (default `local`) then `.env`. Variables already set in the shell win.

### MySQL setup

The migrator creates the database automatically. If your MySQL user cannot `CREATE DATABASE`:

```sql
CREATE DATABASE matchhire CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Redis setup (optional)

```bash
brew services start redis                    # macOS
docker run -d -p 6379:6379 redis:7            # any platform
```

If Redis is unreachable on startup the API logs a warning and continues - every cache call short-circuits to the database.

### Run migrations + seeders

```bash
npm run migrate
npm run seed
npm run migrate:rollback   # rollback latest batch if needed
```

### Start the server

```bash
npm run dev     # nodemon
# or
npm start
```

Default URLs:

- API base: `http://localhost:3500/api/v1`
- **Swagger UI: `http://localhost:3500/api-docs`**
- OpenAPI JSON: `http://localhost:3500/api-docs.json`
- Health: `http://localhost:3500/health`

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 3500 | HTTP port |
| `NODE_ENV` | local | Selects `.env.${NODE_ENV}` |
| `API_PREFIX` | /api/v1 | Route prefix |
| `CORS_ORIGIN` | * | Comma-separated origins or `*` |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | localhost / 3306 / matchhire / root / "" | MySQL connection |
| `DB_CONNECTION_LIMIT` | 10 | Pool size |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | required / 7d | Access token |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` | required / 30d | Refresh token |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | localhost / 6379 / "" / 0 | Redis connection |
| `REDIS_KEY_PREFIX` | matchhire: | Prefix for all keys |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | 900000 / 300 | Default limiter |
| `LOG_LEVEL` | info | winston log level |

## API Route Map

All routes are versioned under `/api/v1`. The Swagger UI at `/api-docs` is the authoritative interactive reference; the table below is for quick scanning.

### Auth - `/api/v1/auth` (all POST)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/register/candidate` | Public | Creates user + candidate profile, returns tokens |
| POST | `/register/employer` | Public | Creates user + company + employer profile |
| POST | `/login` | Public | Returns access + refresh tokens |
| POST | `/logout` | Public | Revokes the supplied refresh token |
| POST | `/refresh-token` | Public | Rotates token pair |
| POST | `/forgot-password` | Public | Issues a one-hour reset token |
| POST | `/reset-password` | Public | Exchanges token for new password |
| POST | `/change-password` | Required | Revokes all refresh tokens on success |
| POST | `/me` | Required | Returns user + role-specific profile |

### Public - `/api/v1/public` (GET, cached)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/jobs` | Filters: keyword, category, location, job_type, experience_level, salary_min, salary_max, remote, company_id, is_featured, page, limit, sort |
| GET | `/jobs/search` | Alias of `/jobs` |
| GET | `/jobs/:id` | Job detail (cached 15m) |
| GET | `/companies` | List with filters (cached 30m) |
| GET | `/companies/:id` | Company + recent open jobs |
| GET | `/candidates` | Public candidates list |
| GET | `/candidates/:id` | Public candidate profile + skills |
| GET | `/categories` | Job categories (cached 1h) |
| GET | `/skills` | Skill taxonomy (cached 1h) |
| GET | `/top-candidates` | Home page block |
| GET | `/featured-companies` | Home page block |
| GET | `/featured-jobs` | Home page block |

### Candidates - `/api/v1/candidates` (role: `candidate`, all POST)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/profile` | (none) - returns profile + skills + preferences |
| POST | `/profile/update` | CandidateProfileUpdate |
| POST | `/skills` | `{ skills: [{ skill_id, proficiency, years_experience }] }` |
| POST | `/preferences` | CandidatePreferencesUpdate |
| POST | `/recommended-jobs` | `{ limit }` |
| POST | `/favorites/:jobId/add` | (none) |
| POST | `/favorites/:jobId/remove` | (none) |
| POST | `/favorites/list` | `{ page, limit }` |
| POST | `/applications/list` | `{ page, limit, status? }` |
| POST | `/applications/:jobId` | `{ cover_letter?, expected_salary?, resume_url? }` |
| POST | `/dashboard/stats` | (none) |

### Employers - `/api/v1/employers` (role: `employer`, all POST)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/company-profile` | (none) |
| POST | `/company-profile/update` | CompanyUpdateRequest |
| POST | `/jobs` | JobCreateRequest |
| POST | `/jobs/list` | `{ page, limit, status? }` |
| POST | `/jobs/:jobId/update` | JobUpdateRequest |
| POST | `/jobs/:jobId/delete` | (none) |
| POST | `/jobs/:jobId/close` | (none) |
| POST | `/jobs/:jobId/applicants` | `{ page, limit, status? }` |
| POST | `/applications/:applicationId/shortlist` | (none) |
| POST | `/applications/:applicationId/reject` | `{ reason? }` |
| POST | `/interviews` | InterviewCreateRequest |
| POST | `/dashboard/stats` | (none) |

### Admin - `/api/v1/admin` (role: `admin` or `super_admin`, all POST)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/dashboard/stats` | (none) |
| POST | `/users` | `{ keyword?, role?, status?, page, limit }` |
| POST | `/users/:id/status` | `{ status, reason? }` |
| POST | `/companies/pending` | `{ page, limit }` |
| POST | `/companies/:id/verify` | `{ verification_status, reason? }` |
| POST | `/jobs` | `{ keyword?, status?, page, limit }` |
| POST | `/jobs/:id/status` | `{ status?, admin_status?, reason? }` |
| POST | `/reports` | (none) |
| POST | `/audit-logs` | `{ page, limit }` |
| POST | `/health-summary` | (none) |

## Authentication Flow

1. **Register or login** via `/auth/register/candidate`, `/auth/register/employer`, or `/auth/login`. The response contains `access_token` and `refresh_token`.
2. **Authorize** subsequent requests with `Authorization: Bearer <access_token>`.
3. When the access token expires, call **`POST /auth/refresh-token`** with the refresh token. The old refresh token is revoked, a new pair is issued.
4. `POST /auth/logout` revokes the supplied refresh token. `POST /auth/change-password` revokes **all** refresh tokens for the user.

Refresh tokens are stored hashed (SHA-256). Passwords are hashed with bcryptjs cost 10.

## Caching

Redis is used for read-heavy public endpoints and dashboards. If Redis is unavailable, every cache call short-circuits and the API serves directly from MySQL.

- Helpers: `cache.getCache`, `cache.setCache`, `cache.deleteCache`, `cache.deleteByPattern`, `cache.rememberCache` in [src/cache/cache.helper.js](src/cache/cache.helper.js).
- Keys are namespaced (`jobs:list:*`, `companies:detail:42`, ...) via `cache.Keys` / `cache.Patterns`.
- TTLs: jobs list 10m, job detail 15m, companies list 30m, candidates list 10m, dashboard stats 5m, categories/skills 60m.
- Invalidation runs from the service layer on every job/company/candidate/application change. See [docs/DEVELOPER_GUIDE.md > Cache invalidation](docs/DEVELOPER_GUIDE.md#cache-invalidation).

## Demo accounts (after `npm run seed`)

Password for every seeded account: **`Password@123`**

| Role | Email |
| --- | --- |
| super_admin | `superadmin@matchhire.com` |
| admin | `admin@matchhire.com` |
| employer (Acme) | `alice@acme.com` |
| employer (Northwind) | `bob@northwind.com` |
| employer (Globex) | `cara@globex.com` |
| candidate | `david@candidate.com` |
| candidate | `emma@candidate.com` |
| candidate | `farhan@candidate.com` |
| candidate | `grace@candidate.com` |

## Quick API smoke test

```bash
# health
curl http://localhost:3500/health

# login (returns access_token + refresh_token)
curl -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"david@candidate.com","password":"Password@123"}'

# authenticated POST: list applications with filters in the body
TOKEN=...   # paste the access_token
curl -X POST http://localhost:3500/api/v1/candidates/applications/list \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"page":1,"limit":10,"status":"shortlisted"}'

# public GET still works as before
curl 'http://localhost:3500/api/v1/public/jobs?keyword=engineer&remote=true'
```

The same flows are available in Swagger UI - much faster to explore there.

## Deployment notes

- Set `NODE_ENV=production`. The loader reads `.env.production`.
- Replace every `__SET_PROD_*__` placeholder with a real secret before deploying.
- Use a long random `JWT_SECRET` / `JWT_REFRESH_SECRET` (`openssl rand -hex 64`).
- Run `npm run migrate` against the production database during release.
- Helmet, default rate limiting, and JSON logging are on. Tune `RATE_LIMIT_MAX` / `CORS_ORIGIN` per environment.
- Reverse proxies should preserve `X-Forwarded-For`; the app already trusts the first proxy hop.
- Redis is recommended but not required - the API runs in fallback mode if it is down.

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | nodemon, watches `src/` |
| `npm start` | Production start |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:rollback` | Roll back the most recent batch |
| `npm run seed` | Insert demo data |
| `npm run docs` | Print the OpenAPI 3.0 spec to stdout |
| `npm run lint` | ESLint |
| `npm test` | Jest |

## Further reading

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) - architecture, conventions, how-tos, troubleshooting
- [`/api-docs`](http://localhost:3500/api-docs) - interactive Swagger UI
- [src/docs/schemas/](src/docs/schemas) - reusable OpenAPI components
- [src/routes/](src/routes) - per-route `@swagger` annotations

## License

MIT
