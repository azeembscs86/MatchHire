# MatchHire Backend - Developer Guide

A practical, opinionated reference for engineers working on the MatchHire Job Portal backend. Read this *before* changing the code. It explains how the layers fit together, the project rules we enforce, and the conventions that keep the codebase consistent as it grows.

---

## 1. Project overview

MatchHire is a job-portal product with three primary audiences:

- **Candidates** browse jobs, apply, save favorites, manage their profile.
- **Employers** post jobs, review applicants, schedule interviews.
- **Admins / super admins** moderate users, verify companies, and inspect platform stats.

This repository contains the REST backend that powers all of those flows for the frontend at [Frontend/](../../Frontend). It is a standalone Node.js service.

---

## 2. Backend architecture

A classic layered architecture. Each layer has one job and the dependencies flow downward only.

```
HTTP request
   |
   v
[ Route ]  - defines URL, method, middleware chain, Swagger annotation
   |
   v
[ Middleware ]  - auth, role, validation, rate limit
   |
   v
[ Controller ]  - request/response only (no SQL, no domain rules)
   |
   v
[ Service ]  - business logic, cross-repo orchestration, cache invalidation
   |
   v
[ Repository ]  - MySQL queries (parameterised, no business logic)
   |
   v
[ MySQL / Redis ]
```

**Hard rules**

- Controllers never import a repository directly. They go through a service.
- Services never call `res.json(...)`. They throw `AppError` and return data.
- Repositories never import a service. They return rows.
- The cache helper is the only place that talks to Redis.

---

## 3. Folder structure

```
Backend/
├── docs/
│   └── DEVELOPER_GUIDE.md            you are here
├── src/
│   ├── app.js                        Express app wiring (middleware + routes + docs)
│   ├── server.js                     Process entrypoint (DB ping, Redis init, signals)
│   ├── config/
│   │   ├── env.js                    Loads .env.${NODE_ENV} into a typed config
│   │   ├── database.js               MySQL pool + query helpers
│   │   └── redis.js                  Redis client + readiness flag
│   ├── cache/
│   │   └── cache.helper.js           getCache / setCache / deleteByPattern / Keys + Patterns
│   ├── constants/
│   │   ├── responseCodes.js
│   │   └── roles.js
│   ├── controllers/                  HTTP boundary
│   ├── services/                     Business logic
│   ├── repositories/                 MySQL queries only
│   ├── routes/                       URL + middleware chain + @swagger JSDoc
│   ├── middlewares/                  auth, role, validate, error, rateLimit
│   ├── validators/                   Joi schemas
│   ├── docs/                         Swagger entrypoint + reusable schemas
│   │   ├── swagger.js
│   │   └── schemas/
│   │       ├── common.schema.js
│   │       ├── auth.schema.js
│   │       ├── candidate.schema.js
│   │       ├── employer.schema.js
│   │       ├── admin.schema.js
│   │       └── public.schema.js
│   ├── database/
│   │   ├── migrate.js                migration runner (up / rollback)
│   │   ├── seed.js                   demo data
│   │   └── migrations/               17 migrations (idempotent CREATE TABLE)
│   └── utils/
│       ├── response.helper.js
│       ├── logger.js                 winston
│       ├── pagination.js
│       ├── asyncHandler.js
│       └── AppError.js
├── .env.example / .env.local / .env.production
├── .eslintrc.json
├── .gitignore
├── package.json
└── README.md
```

---

## 4. Request lifecycle

For an authenticated example: `POST /api/v1/employers/jobs/list`.

1. Express receives the request.
2. Global middleware runs: `helmet` -> `cors` -> `compression` -> body parsers -> `morgan` HTTP log.
3. The default rate limiter (`defaultLimiter`) at `/api/v1` applies.
4. Router-level middleware runs: `requireAuth` (decode JWT, attach `req.user`) -> `requireEmployer` (role gate).
5. Per-route middleware runs: `validate(jobListFilters)` (replaces `req.body` with the cleaned/typed value).
6. The controller (`employer.controller.listMyJobs`) reads `req.user.id` and `req.body` and calls the service.
7. The service (`employer.service.listMyJobs`) looks up the employer's company, then asks the repository for paginated jobs.
8. The repository runs the SQL with `?` placeholders and returns rows + a total.
9. The controller wraps the rows in `response.list(...)` and Express sends the JSON envelope back.
10. Any error thrown along the way bubbles into `errorHandler` and exits via the standard error envelope.

---

## 5. Authentication flow

```
register / login  --->  { user, access_token, refresh_token, expires_in }
                         |
                         | Authorization: Bearer <access_token>
                         v
   (every authenticated POST endpoint)

(access expired)
                         |
                         v
POST /auth/refresh-token { refresh_token }  --->  new access + new refresh
                                                (old refresh is revoked,
                                                 replaced_by_id is set)
```

- **Access token**: short-lived JWT (default 7d in local, 1d in production). Carried in `Authorization: Bearer ...`. Never stored server-side.
- **Refresh token**: opaque random hex. SHA-256 hash stored in `refresh_tokens`. Rotated on every refresh. Logout revokes the supplied token. `change-password` revokes **all** refresh tokens for the user.
- **Password storage**: bcryptjs cost 10. Hash stored on `users.password_hash`.
- **Password reset**: random hex token, SHA-256 hash stored in `password_reset_tokens`, expires in 1 hour, single-use. After reset, all refresh tokens for the user are revoked.

---

## 6. Role-based access

`roles.js` defines four roles:

| Role | Access |
| --- | --- |
| `candidate` | `/api/v1/candidates/*` |
| `employer` | `/api/v1/employers/*` |
| `admin` | `/api/v1/admin/*` |
| `super_admin` | `/api/v1/admin/*` (and any future super-admin endpoints) |

The role middleware runs **after** `requireAuth`. Layer them on the route or on the router:

```js
router.use(requireAuth, requireEmployer);   // every route below this is employer-only
```

---

## 7. API response standard

Every success response:

```json
{
  "Response": { "responseCode": 1, "status": "Success", "message": "..." },
  "Data": { }
}
```

Every error response:

```json
{
  "Response": { "responseCode": 0, "status": "Error", "message": "..." },
  "Data": null
}
```

Validation failures (Joi):

```json
{
  "Response": { "responseCode": 0, "status": "Validation Error", "message": "Invalid request data" },
  "Errors": [ { "field": "email", "message": "email must be a valid email", "type": "string.email" } ]
}
```

Paginated list payload:

```json
{
  "Response": { "responseCode": 1, "status": "Success", "message": "Jobs Returned Successfully" },
  "Data": {
    "records": [...],
    "pagination": { "page": 1, "limit": 10, "total": 100, "totalPages": 10 }
  }
}
```

Controllers must use the helpers in [src/utils/response.helper.js](../src/utils/response.helper.js). Never `res.json(...)` directly.

---

## 8. POST-only authenticated APIs

**Project rule:** every authenticated endpoint is `POST`. Public list/detail endpoints can stay `GET`.

Why:

- One mental model for the frontend - "if you need a token, it is POST".
- Filters and pagination are always in the request body (one schema per endpoint).
- Browser cache, CDN, and proxy caches are never tempted to memoise an authenticated response.

What this means in practice:

- A "read" endpoint like `/auth/me` is still `POST /auth/me` (body may be empty).
- Listing endpoints encode filters in JSON body: `POST /candidates/applications/list` with `{ "page": 1, "limit": 10, "status": "shortlisted" }`.
- Mutating endpoints that previously felt like `PUT` or `PATCH` are now `POST` on a verb-style URL: `POST /employers/jobs/:jobId/update`, `POST /employers/jobs/:jobId/close`, `POST /admin/users/:id/status`.

Public listing/detail endpoints (which **anyone** can hit) remain `GET`.

---

## 9. MySQL database

Connection: `mysql2/promise` pool initialised in [src/config/database.js](../src/config/database.js). Helpers:

| Helper | Use when |
| --- | --- |
| `db.query(sql, params)` | `SELECT` (especially with LIMIT/OFFSET) - uses `pool.query` so MySQL 8 prepared-statement bugs do not bite |
| `db.queryOne(sql, params)` | First row or null |
| `db.execute(sql, params)` | Prepared statement for `INSERT`/`UPDATE`/`DELETE` |
| `db.transaction(handler)` | Wraps `BEGIN`/`COMMIT`/`ROLLBACK` |

### Tables

| # | Table | What it stores |
| --- | --- | --- |
| 1 | `roles` | reference: candidate / employer / admin / super_admin |
| 2 | `users` | core user account; role + status + bcrypt password hash |
| 3 | `companies` | employer companies; slug-based public profile + verification status |
| 4 | `job_categories` | reference: job category taxonomy |
| 5 | `skills` | reference: skill taxonomy |
| 6 | `jobs` | job postings; FK to company, category, posting user |
| 7 | `candidate_profiles` | extended candidate info (1:1 to user) |
| 8 | `candidate_skills` | M:N candidate <-> skill (with proficiency, years) |
| 9 | `employer_profiles` | extended employer info; ties user to a company |
| 10 | `applications` | candidate <-> job application (unique pair, status pipeline) |
| 11 | `favorites` | candidate -> saved job |
| 12 | `preferences` | candidate job preferences (titles, locations, salary, notify) |
| 13 | `notifications` | per-user notification feed |
| 14 | `interviews` | scheduled interview against an application |
| 15 | `admin_audit_logs` | every mutating admin action |
| 16 | `password_reset_tokens` | single-use, hashed |
| 17 | `refresh_tokens` | hashed, rotated, revocable |

### Foreign keys + indexes

Every relationship has an FK with explicit `ON DELETE` / `ON UPDATE` (`CASCADE` or `SET NULL`). All commonly filtered columns are indexed. `users.email`, `companies.slug`, `skills.slug`, `job_categories.slug`, `refresh_tokens.token_hash`, and `password_reset_tokens.token_hash` are unique.

---

## 10. Redis caching strategy

Redis is **optional**. The cache helpers in [src/cache/cache.helper.js](../src/cache/cache.helper.js) short-circuit when Redis is unavailable, so the API stays functional on Redis-less environments.

### Helpers

```js
cache.getCache(key)                          // returns parsed value or null
cache.setCache(key, value, ttlSeconds)       // JSON-serialises, sets TTL
cache.deleteCache(...keys)                   // DEL N keys
cache.deleteByPattern(pattern)               // SCAN + DEL (matches cache.Patterns.*)
cache.rememberCache(key, ttl, loader)        // read-through helper
```

### Key namespace (see `cache.Keys`)

```
jobs:list:<query-string>           TTL 10m
jobs:detail:<id>                   TTL 15m
companies:list:<query-string>      TTL 30m
companies:detail:<id>              TTL 30m
candidates:list:<query-string>     TTL 10m
candidates:detail:<id>             TTL 10m
candidates:top                     TTL 10m
meta:categories                    TTL 60m
meta:skills                        TTL 60m
dashboard:<scope>:<id>             TTL  5m
```

### Cache invalidation

The service layer owns invalidation. The rules:

| Event | Keys invalidated |
| --- | --- |
| Job created / updated / deleted / closed | `jobs:detail:<id>`, `jobs:list:*`, `dashboard:employer:*` |
| Company updated / verified | `companies:detail:<id>`, `companies:list:*` |
| Candidate profile or skills updated | `candidates:detail:<id>`, `candidates:list:*`, `candidates:top` |
| Application status changes (apply, shortlist, reject, interview) | `dashboard:candidate:*`, `dashboard:employer:*` |

Use `cache.Patterns.*` rather than hand-crafting `*` strings.

---

## 11. Validation approach

All input is validated with **Joi** in [src/validators/](../src/validators). The flow:

1. Each route attaches `validate(schema, 'body' | 'query' | 'params')`.
2. The middleware runs the schema with `abortEarly: false`, `stripUnknown: true`, `convert: true`.
3. On success, `req[target]` is **replaced** by the cleaned + coerced value so the controller sees safe data.
4. On failure, the standard validation envelope is returned (HTTP 422):
   ```json
   {
     "Response": { "responseCode": 0, "status": "Validation Error", "message": "Invalid request data" },
     "Errors": [ { "field": "email", "message": "...", "type": "..." } ]
   }
   ```

Defaults set on Joi schemas (e.g. `Joi.number().default(10)`) flow into the controller body automatically.

---

## 12. Error handling

- Operational failures: `throw new AppError('Job not found', 404)` from the service.
- Centralised handler ([src/middlewares/error.middleware.js](../src/middlewares/error.middleware.js)) converts:
  - `AppError` -> exact statusCode + message
  - `ER_DUP_ENTRY` -> 409 with "Resource already exists"
  - `ER_NO_REFERENCED_ROW_2` / `ER_ROW_IS_REFERENCED_2` -> 400
  - JWT errors -> 401
  - Anything else -> 500 with a generic message; full stack logged
- Unmatched routes return 404 in the standard envelope.

---

## 13. Swagger usage

The OpenAPI 3.0 spec is generated at startup by [src/docs/swagger.js](../src/docs/swagger.js).

- **Components** (reusable schemas + responses) live in [src/docs/schemas/](../src/docs/schemas).
- **Path definitions** are JSDoc `@swagger` blocks above each route in `src/routes/*.js`.
- The merged spec is mounted at:

| URL | What |
| --- | --- |
| `/api-docs` | Swagger UI |
| `/api-docs.json` | Raw OpenAPI 3.0 spec |
| `npm run docs` | Prints the spec to stdout (handy for piping into other tools) |

**To authorize in Swagger UI**: hit `POST /auth/login`, copy `access_token`, click the green **Authorize** button at the top right of `/api-docs`, paste the token, and every locked endpoint becomes runnable.

---

## 14. How to add a new API

Five-step recipe. Pick "list applications" as a model.

1. **Migration (if needed)** - add a file under `src/database/migrations/`. Use `CREATE TABLE IF NOT EXISTS`. Run `npm run migrate`.
2. **Repository** - add a function in `src/repositories/<domain>.repository.js`. Use parameterised SQL only. Return raw rows + counts.
3. **Service** - add a function in `src/services/<domain>.service.js`. Apply business rules (ownership checks, cache invalidation). Throw `AppError` on operational failures.
4. **Validator** - add or extend a Joi schema in `src/validators/<domain>.validator.js`. Remember: authenticated routes validate **body**, public routes validate **query/params**.
5. **Controller + route** - controller reads from `req.body`/`req.params` and calls the service. The route file binds validators + middleware + adds a `@swagger` JSDoc block.

**Authenticated routes must be POST.** Static path segments (like `/list`) must be declared *before* dynamic segments (`/:id`) inside the same router or Express will capture the literal as the param.

### Example skeleton

```js
// src/repositories/foo.repository.js
async function listForUser(user_id, { page, limit }) {
  const offset = (page - 1) * limit;
  const rows = await db.query(
    `SELECT id, name FROM foo WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [user_id, Number(limit), Number(offset)]
  );
  const { total } = await db.queryOne(`SELECT COUNT(*) total FROM foo WHERE user_id = ?`, [user_id]);
  return { rows, total: Number(total) };
}

// src/services/foo.service.js
async function listForUser(user_id, paging) {
  const { rows, total } = await fooRepo.listForUser(user_id, paging);
  return { records: rows, pagination: buildPagination(paging.page, paging.limit, total) };
}

// src/validators/foo.validator.js
const listFilters = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

// src/controllers/foo.controller.js
exports.listMine = async (req, res) => {
  const data = await fooService.listForUser(req.user.id, req.body);
  return response.list(res, data.records, data.pagination, 'Foo returned');
};

// src/routes/foo.routes.js
/**
 * @swagger
 * /foo/list:
 *   post:
 *     tags: [Foo]
 *     summary: List the authenticated user's foo records
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ListFiltersBody' }
 *           example: { page: 1, limit: 10 }
 *     responses:
 *       '200': { $ref: '#/components/responses/PaginatedList' }
 */
router.post('/list', validate(v.listFilters), asyncHandler(controller.listMine));
```

---

## 15. How to add a new database table

1. Create `src/database/migrations/0XX_create_<table>.js`. Use `CREATE TABLE IF NOT EXISTS` and a matching `DROP TABLE IF EXISTS` in `down`.
2. Use `utf8mb4` + `utf8mb4_unicode_ci`. Always include `created_at` / `updated_at` defaults.
3. Define FK + index + uniqueness as part of the migration.
4. Run `npm run migrate` locally. To verify, `npm run migrate:rollback` then `npm run migrate` again.

---

## 16. How to add a new service / repository / validator

- **Service**: only logic. May import multiple repositories and the cache helper. Never imports `express`, `req`, or `res`. Throw `AppError` for expected failures.
- **Repository**: only SQL. Returns plain JS objects/arrays. Never imports a service. Never builds business decisions ("the job is closed").
- **Validator**: pure Joi schema. Use `.default(...)` to let omitted fields fall through. Use `.unknown(false)` to reject extra keys on list/filter bodies.

---

## 17. How to add Swagger docs for a new route

1. Pick a tag from `Auth | Public | Candidates | Employers | Admin` (or add a new one in `swagger.js -> definition.tags`).
2. Add a `@swagger` block immediately above the route handler in `src/routes/<x>.routes.js`. Required:
   - `tags`
   - `summary` (one-line)
   - `security` (`[]` for public, `[{ bearerAuth: [] }]` for authenticated)
   - `requestBody` (for POST) with a `$ref` to a schema component
   - `responses` referencing reusable components from `src/docs/schemas/common.schema.js`
3. If you need a new request/response schema, add it to the matching domain file under `src/docs/schemas/`.
4. Restart the server. `/api-docs` reflects the changes immediately - no manual JSON to maintain.

---

## 18. How to test APIs

```bash
# 1. Boot
npm run dev

# 2. Login as the seeded admin
curl -s -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@matchhire.com","password":"Password@123"}'

# 3. Use the returned access_token
TOKEN=...
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/admin/dashboard/stats | jq
```

The Swagger UI at `/api-docs` is the easiest exploratory tool: authorise once, then every endpoint becomes runnable in the browser with prefilled examples.

Demo accounts (after `npm run seed`), password `Password@123`:

- `superadmin@matchhire.com`, `admin@matchhire.com`
- `alice@acme.com`, `bob@northwind.com`, `cara@globex.com` (employers)
- `david@candidate.com`, `emma@candidate.com`, `farhan@candidate.com`, `grace@candidate.com`

---

## 19. Local setup

```bash
cd Backend
npm install
cp .env.example .env.local       # then edit DB + JWT + Redis values
npm run migrate
npm run seed
npm run dev
```

Useful URLs once the server boots:

- API: `http://localhost:3500/api/v1`
- Health: `http://localhost:3500/health`
- Swagger UI: `http://localhost:3500/api-docs`
- OpenAPI JSON: `http://localhost:3500/api-docs.json`

---

## 20. Production deployment

1. Set `NODE_ENV=production`. The loader reads `.env.production`.
2. Replace every `__SET_PROD_*__` placeholder in `.env.production` (or inject the equivalents from your secret manager).
3. Use a long random `JWT_SECRET` / `JWT_REFRESH_SECRET` (e.g. `openssl rand -hex 64`).
4. Run `npm ci` (locked install).
5. Run `npm run migrate` against the production database during release.
6. Run the service with a process manager (`pm2`, `systemd`, `Docker` + restart policy).
7. Log shipping: stdout is JSON in production - forward to Datadog / CloudWatch / Loki.
8. Reverse proxy (NGINX / ALB) must preserve `X-Forwarded-For`; the app already trusts the first proxy hop.
9. Tighten `CORS_ORIGIN` to the frontend domain(s).
10. Redis is recommended (better latency, lower DB load) but not required - the API gracefully degrades to direct MySQL reads if Redis is offline.

---

## 21. Coding standards

- `'use strict'` at the top of every file.
- One responsibility per file. If a controller starts orchestrating, push the logic into the service.
- Use `async/await`. Wrap controllers in `asyncHandler`. Never leave a promise unawaited.
- Parameterise every SQL query. **Never** template user input into SQL.
- Return early on validation/ownership failures - keep happy paths un-indented.
- Comments explain *why* (constraint, invariant, workaround). Code explains *what*.
- Run `npm run lint` before pushing.

---

## 22. Naming conventions

- **Files**: `kebab-case.js` for routes, `camelCase.js` is also acceptable. Repositories end in `.repository.js`, services in `.service.js`, validators in `.validator.js`.
- **Tables**: `snake_case` plural (`candidate_skills`, not `CandidateSkill`).
- **Columns**: `snake_case` singular. Foreign keys end in `_id`.
- **Functions**: `camelCase`, verb-first (`listMyJobs`, `recomputeProfileStrength`).
- **Cache keys**: `domain:scope:id` (e.g. `jobs:detail:42`). Use `cache.Keys` / `cache.Patterns` helpers.
- **JWT claims**: `sub` (user id), `role`, `email`, `full_name`.
- **Constants**: `UPPER_SNAKE_CASE` (see `responseCodes.js`, `roles.js`).

---

## 23. Git commit standards

Subject line: imperative mood, present tense, <= 72 chars. Examples:

- `Add Swagger API documentation and developer guide`
- `Fix LIMIT/OFFSET bug on MySQL 8 prepared statements`
- `Refactor authenticated endpoints to POST-only`

Body (optional, wrap at 80 cols): describe *why*, link tickets, mention any migration that has to run on deploy.

Branch naming: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`. PR titles should match the merge commit subject.

---

## 24. Common troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Incorrect arguments to mysqld_stmt_execute` | mysql2 prepared statement + LIMIT/OFFSET | Use `db.query(...)` (we already do); make sure params are `Number(...)` |
| `Expression #N of ORDER BY clause is not in SELECT list` | MySQL 8 strict mode + `SELECT DISTINCT` | Add the ORDER BY column to the SELECT list |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL not running, or wrong port | Check MAMP/Docker, `lsof -i:3306`, update `DB_PORT` in `.env.local` |
| `Redis error - operating in fallback mode` | Redis not running | The API works; start Redis with `brew services start redis` or `docker run -p 6379:6379 redis:7` |
| 422 with `field: jobId, message: jobId must be a number` on a `/list` endpoint | Static path declared after a dynamic param | Reorder so `/foo/list` appears **before** `/foo/:id` in the router |
| 401 immediately after refresh | Refresh token already revoked or rotated | Re-login. Refresh tokens are single-use; the second consumer loses |
| Swagger UI shows zero paths | New route file not picked up | Ensure the file is under `src/routes/*.js` and contains a `@swagger` block; restart |
| `ER_DUP_ENTRY` on register | Email already in use | The error handler converts this to 409 - the frontend should treat it as "already registered" |
| `JsonWebTokenError: invalid signature` | `JWT_SECRET` changed mid-session | All existing tokens become invalid - log users back in |
| `Email already in use` on seed re-run | `users.email` is unique | Seeder is idempotent (`ON DUPLICATE KEY UPDATE`); if you see this, you ran a non-seeder INSERT |

---

## 25. Where to look next

- Routes + Swagger annotations: [src/routes/](../src/routes)
- Services (business logic): [src/services/](../src/services)
- Repositories (SQL): [src/repositories/](../src/repositories)
- Cache + invalidation: [src/cache/cache.helper.js](../src/cache/cache.helper.js)
- Auth flow: [src/services/auth.service.js](../src/services/auth.service.js)
- Migration runner: [src/database/migrate.js](../src/database/migrate.js)
- Seeders: [src/database/seed.js](../src/database/seed.js)
- OpenAPI entrypoint: [src/docs/swagger.js](../src/docs/swagger.js)
- Component schemas: [src/docs/schemas/](../src/docs/schemas)
