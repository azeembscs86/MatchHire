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

## 12b. Dynamic navigation (Frontend integration)

The header in the React frontend reads the menu from
`GET /public/navigation` (the only `optionalAuth` route on the public
namespace). The backend service returns a shape the frontend can map
straight to `<NavLink>` items:

```json
{
  "primary":   [{ "key": "...", "label": "...", "to": "...", "end": true }],
  "actions":   [{ "key": "...", "label": "...", "kind": "auth-signin | auth-signup | logout | link", "to": "..." }],
  "dashboard": { "label": "...", "to": "..." } | null,
  "user":      { "id": ..., "full_name": "...", "role": "..." } | null
}
```

Visibility rules (matches the project spec):

| Role          | Menu additions                                                   |
| ------------- | ---------------------------------------------------------------- |
| Anonymous     | Home, Jobs, Companies, Candidates, For Employers + Sign in/Join |
| Candidate     | + My Profile, Preferences, Favorites + Candidate Dashboard       |
| Employer      | + Company Profile, Job Postings + Company Dashboard              |
| Admin         | + Admin Console + Admin Dashboard                                |

The payload is generated on every request (not cached) because it is
role-aware and very small. To add a new menu entry, edit
`src/services/public.service.js > navigation(user)`. **Do not branch
in the frontend Header** — keep the menu canonically owned by the
backend so the same logic flows to mobile / SSR / future clients.

## 12c. Global job portal flows (new)

### Location detection (Frontend → Backend)

```
Browser (Jobs page)
  └─ useLocation() hook
       ├─ reads matchhire:location from localStorage (manual pick)
       ├─ on first mount, calls GET /public/geolocate
       │     (server-side proxy in front of ipapi.co; visitor IP
       │      never leaves the backend)
       └─ on Use precise location, prompts navigator.geolocation
            (browser asks for permission; user can deny)
```

The Jobs page calls `GET /public/jobs/location-based?country=...&city=...&job_scope=...`. With a candidate bearer token, every record carries `match_score`, `reasons[]`, and `missing[]` so the JobCard badges render in a single round-trip.

### Skill-based matching

`src/services/match.service.js` is the single source of truth. It scores a `(candidate, job)` pair from 0..100 across six components:

| Component | Max | Looks at |
| --- | --- | --- |
| role | 25 | overlap between job title and candidate headline/current title |
| skills | 30 | intersection of `job.skills_tags` and `candidate_skills` |
| experience | 15 | candidate `years_experience` vs `experience_level` band |
| location | 15 | city > country > remote-compatible |
| salary | 10 | overlap between candidate range and job range |
| category | 5 | `job_category` in `preferences.preferred_categories` |

Decisions:
- `score >= 60` → `accepted` (apply allowed)
- `score >= 45` → `below_threshold` (apply allowed; flagged for the employer)
- `score < 45` → `rejected` (apply blocked with a polite missing-skill reason)

### Apply validation

`POST /candidates/applications/:jobId/validate-and-apply` always runs the match first.

- **Rejected**: HTTP 422; no application created; the attempt is recorded in `application_match_results` so admins can see why people were filtered out. The frontend opens a `RejectionModal` listing the missing skills.
- **Accepted / borderline**: application created with `match_score` stored alongside it; `application_match_results` row also persisted; cache invalidations fire.

### Resume upload + parse + confirm

```
POST /candidates/resume/upload      multipart "resume" (max 5MB)
        ↓
POST /candidates/resume/:id/parse   pdf-parse / mammoth + heuristics
        ↓ structured payload          (resume_parsed_data row)
POST /candidates/resume/:id/preview  what the frontend renders for review
        ↓
POST /candidates/resume/:id/confirm  merges into candidate_profiles +
                                     candidate_skills (replace)
```

Files live under `Backend/storage/resumes/<random>.<ext>` (mode 0600). Downloads go through `POST /candidates/resume/:id/download` which returns a short-lived HMAC-signed URL: `GET /api/v1/files/<bucket>/<filename>?exp=<unix>&sig=<hmac>`. The HMAC is keyed to `JWT_SECRET`. Expired / tampered URLs return 403.

### Email verification

```
POST /auth/register/*               creates user in `status='pending'`,
                                    issues SHA-256-hashed token, sends
                                    verification email
        ↓
POST /auth/login                    rejected with code EMAIL_NOT_VERIFIED
        ↓
GET  /auth/verify-email/:token      consumes the token, marks the user
                                    `email_verified_at = NOW()` and flips
                                    status to `active`
        ↓
POST /auth/login                    succeeds, returns access + refresh tokens
POST /auth/resend-verification-email
                                    re-issues the token; never reveals
                                    whether the email exists
```

In dev the verification URL is returned in the API response and printed to the backend log so testing is one click. `EmailService` is the integration point - swap the console-log body for nodemailer/SendGrid/Resend when wiring real SMTP.

### Job scope preference

`preferences.job_scope` (`local | country | global_remote | hybrid`) drives the global vs local toggle on the Jobs page. The location-based query layer interprets it:

- `local` → `WHERE city = candidate.city`
- `country` → `WHERE country = candidate.country`
- `global_remote` → `WHERE is_global_remote = 1 OR (work_mode='remote' AND country IS NULL)`
- `hybrid` (default) → no scope filter; the priority CASE still ranks results

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
- Cache + invalidation: [src/services/cache.service.js](../src/services/cache.service.js) + [src/helpers/cacheKey.helper.js](../src/helpers/cacheKey.helper.js)
- Queues (BullMQ): [src/queues/](../src/queues)
- ElasticSearch config + indexers: [src/config/elasticsearch.js](../src/config/elasticsearch.js), [src/indexers/](../src/indexers)
- Search service + analytics: [src/services/search.service.js](../src/services/search.service.js), [src/services/searchAnalytics.service.js](../src/services/searchAnalytics.service.js)
- Auth flow: [src/services/auth.service.js](../src/services/auth.service.js)
- Migration runner: [src/database/migrate.js](../src/database/migrate.js)
- Seeders: [src/database/seed.js](../src/database/seed.js)
- OpenAPI entrypoint: [src/docs/swagger.js](../src/docs/swagger.js)
- Component schemas: [src/docs/schemas/](../src/docs/schemas)

---

## 26. Redis caching strategy

The MatchHire backend treats Redis as a **performance optimisation, not a hard dependency** — every Redis-aware call short-circuits when the client is offline. The four workloads are:

1. **Application caching** (job feeds, location feeds, search results, dashboard stats, meta lookups)
2. **Match-score memoisation** (per `(candidate, job)` pair)
3. **Trending jobs** (sorted sets weighted by activity)
4. **Background work queues** (BullMQ)
5. **Session metadata** (multi-device session listing)

All cache keys come from [`src/helpers/cacheKey.helper.js`](../src/helpers/cacheKey.helper.js); never construct them by hand. Service code talks to [`src/services/cache.service.js`](../src/services/cache.service.js), which thinly wraps the underlying `cache.helper`.

### Key namespace

```
mh:job:list:<hash>            paginated job listing
mh:job:feed:<userId>:<hash>   personalised feed
mh:job:detail:<id>            job detail
mh:job:trending:<scope>       trending sorted set (global / country:Pakistan / city:Karachi)
mh:company:list:<hash>        company listing
mh:company:detail:<id>
mh:candidate:list:<hash>
mh:candidate:detail:<id>
mh:meta:countries / cities:<countryId> / skills:all / categories
mh:match:<candidateId>:<jobId>
mh:search:<index>:<hash>      cached /search/* response
mh:session:<userId>:<sessionId>
mh:session-idx:<userId>
mh:dashboard:<scope>:<id>
```

### TTLs (seconds)

| Domain | TTL | Notes |
| --- | --- | --- |
| `JOB_LIST` | 600 | 10 min |
| `JOB_FEED` | 300 | 5 min (per-user) |
| `JOB_DETAIL` | 900 | 15 min |
| `JOBS_TRENDING` | 1800 | 30 min (sorted set also expires after 7d of inactivity) |
| `COMPANY_LIST` / `COMPANY_DETAIL` | 1800 | 30 min |
| `CANDIDATE_LIST` / `CANDIDATE_DETAIL` | 600 | 10 min |
| `META` (countries / cities / skills / categories) | 3600 | 1 hour |
| `MATCH_SCORE` | 1800 | 30 min, invalidated on profile/skill/preference/job change |
| `SEARCH_RESULT` | 300 | 5 min |
| `SESSION` | 2592000 | mirrors the refresh-token lifetime |
| `DASHBOARD` | 300 | 5 min |

### Invalidation rules

| Event | Patterns blasted |
| --- | --- |
| Job created / updated / deleted / closed | `mh:job:list:*`, `mh:job:feed:*`, `mh:job:detail:<id>`, `mh:search:jobs:*`, `mh:match:*:<jobId>` |
| Company updated / verified | `mh:company:detail:<id>`, `mh:company:list:*`, `mh:search:companies:*` |
| Candidate profile / skills / preferences saved | `mh:candidate:detail:<uid>`, `mh:candidate:list:*`, `mh:match:<uid>:*`, `mh:job:feed:<uid>:*`, `mh:search:candidates:*`, `mh:dashboard:candidate:*` |
| Application status change | `mh:dashboard:candidate:*`, `mh:dashboard:employer:*` |

These rules are codified inside `cache.service.invalidate.*` so the call sites just write `cache.invalidate.candidateProfileChanged(uid)` and trust the helper.

### Match-score memoisation (building block)

The match algorithm is deterministic, so [`match.service.scoreJobCached(job, candidate)`](../src/services/match.service.js) reads `mh:match:<candidateId>:<jobId>` first and caches misses for `TTL.MATCH_SCORE`. Use it in any hot path where you'd otherwise recompute the score. Invalidation lives on `cache.invalidate.candidateProfileChanged(uid)` (clears every match for the candidate) and `cache.invalidate.job(jobId)` (clears every match for that job) — call those from your profile/skills/preference save handlers and your job-edit handlers respectively. The `match` queue (`queues/match.queue.js`) provides async `recompute-for-candidate` / `recompute-for-job` jobs for fanned-out invalidation.

### Trending jobs (building block)

[`services/trending.service.js`](../src/services/trending.service.js) maintains three Redis sorted sets:

```
mh:job:trending:global
mh:job:trending:country:<lowercased-name>
mh:job:trending:city:<lowercased-name>
```

Suggested weights per event (constants exported as `EVENT_WEIGHTS`):

```
view        +1
save        +3
apply       +5
match_shown +0.5
```

The service exposes `bump({ jobId, weight, country, city })`, `bumpEvent({ jobId, event, country, city })`, and `top({ scope, value, limit })`. `top(...)` falls back to "newest published" when the sorted set is empty (or Redis is offline). Wire `bumpEvent` into your job-detail / favorite / apply paths and surface `top` through your preferred endpoint when you're ready to expose trending publicly.

### Sessions (Redis-backed metadata)

`session.service.create({ userId, refreshToken, ip, userAgent, expiresAt })` writes:

```
mh:session:<userId>:<sha256(refreshToken)>    hash field "data" -> JSON
mh:session-idx:<userId>                       hash sessionId -> createdAt
```

This is purely a fast multi-device read path; the canonical source of truth is the `refresh_tokens` MySQL table. If Redis is offline the auth flow keeps working — the session list just returns empty.

### Queues (BullMQ)

[`src/queues/index.js`](../src/queues/index.js) is the thin wrapper. Producer pattern:

```js
const emailQueue = require('./queues/email.queue');
await emailQueue.add('send-verification', { user, token });
```

If Redis isn't ready, `add(...)` runs the queue's inline fallback synchronously, which performs the same work; the user-facing flow never blocks on infra. The four queues:

| Queue | Jobs | Concurrency |
| --- | --- | --- |
| `email` | `send-verification`, `send-application`, `send-generic` | 5 |
| `resume` | `parse-resume`, `reindex-resume` | 2 |
| `notification` | `application-status`, `interview-scheduled`, `new-match`, `job-alert-digest` | 10 |
| `match` | `recompute-for-candidate`, `recompute-for-job` | 3 |

Default options: 3 attempts, exponential backoff (4s), `removeOnComplete` 24h / 1000, `removeOnFail` 7d / 500. Workers register at boot (in `server.js`) when Redis is up; the wrapper logs a single info line per queue.

### Health-checking Redis

`GET /health` reports `redis: "up" | "down (fallback)"`. The admin dashboard's `/admin/health-summary` repeats the same payload so an operator can see degradation without SSHing into a box.

---

## 27. ElasticSearch integration

ElasticSearch handles the search hot path (fuzzy job/candidate/skill search, autocomplete, weighted relevance). It is **always optional**: every search endpoint falls back to the existing MySQL repositories when ES is unreachable.

### Indices

```
${ELASTICSEARCH_INDEX_PREFIX}_jobs        canonical job index
${ELASTICSEARCH_INDEX_PREFIX}_candidates  public candidate index
${ELASTICSEARCH_INDEX_PREFIX}_resumes     parsed resume payloads
```

Prefix defaults to `matchhire`. Use a different prefix per environment to share a single cluster.

`config/elasticsearch.js > ensureIndices()` is idempotent: it creates each index with the proper mapping if it doesn't already exist. The mappings live in the same file (`JOB_MAPPING`, `CANDIDATE_MAPPING`, `RESUME_MAPPING`). Key choices:

- **Edge-ngram analyzer** (`autocomplete`) on `title`, `company_name`, `headline` for skill / role / company suggestions.
- **English standard analyzer** on body fields (`description`, `responsibilities`, `summary`, `skills_text`).
- **Keyword sub-fields** (`title.keyword`, `company_name.keyword`) for exact-match aggregations.
- **`geo_point`** field reserved on jobs for distance scoring in a future iteration.

### Search service

[`src/services/search.service.js`](../src/services/search.service.js) builds queries from the request filters:

- `keyword` → `multi_match` across `title^4 / title.autocomplete^3 / skills_text^3 / skills_tags^2 / company_name^2 / company_name.autocomplete / responsibilities / requirements / description`, with `fuzziness: "AUTO"`.
- `role` → `match` on title with explicit boost.
- `skills` (comma-separated or array) → `terms` filter on `skills_tags`.
- Geo/filter fields (`country`, `city`, `job_type`, `work_mode`, `experience_level`, `is_remote`, `is_global_remote`, `company_id`, `category`) → `term` filters.
- Salary range → `range` clauses with overlap semantics.
- Sort defaults to relevance, with `latest` / `salary_high` / `featured` overrides.

When ES is unavailable, the service calls the MySQL repositories (`jobRepo.listPublic`, `candidateRepo.listPublicCandidates`, `companyRepo.listPublic`) so the SPA still gets results. Cached responses live under `mh:search:<index>:<hash>` for 5 minutes.

### Endpoints

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| GET | `/search/jobs` | optional | Job search (ES + MySQL fallback) |
| GET | `/search/candidates` | optional | Candidate search (ES + MySQL fallback) |
| GET | `/search/companies` | none | Company search (MySQL only - small set) |
| GET | `/search/skills/autocomplete` | none | Edge-ngram skill suggestions |
| POST | `/search/analytics` | optional | Click / conversion / no-result ping |
| POST | `/index/jobs/reindex` | admin | Bulk reindex |
| POST | `/index/candidates/reindex` | admin | Bulk reindex |
| POST | `/index/resumes/reindex` | admin | Bulk reindex |

### Incremental indexing (building block)

The indexers in [`src/indexers/`](../src/indexers) expose `indexJob(id)` / `removeJob(id)` / `indexCandidate(uid)` / `removeCandidate(uid)` / `indexResume(rid)` / `removeResume(rid)`. They're idempotent and best-effort: when ES is unavailable they log a warning and return so callers never need a try/catch.

Wire these into your write paths whenever you're ready. A typical pattern looks like:

```js
const jobIndexer = require('../indexers/job.indexer');
// inside employer.service.updateJob, after the MySQL UPDATE has committed:
jobIndexer.indexJob(jobId).catch(() => {});
```

The bulk `reindexAll()` is what `POST /api/v1/index/<thing>/reindex` runs — useful after a backfill, a schema change, or when ES has been added to a deployment for the first time.

### Search analytics

[`src/services/searchAnalytics.service.js`](../src/services/searchAnalytics.service.js) appends to `search_events`. The endpoint never throws so the SPA never blocks. Admin helpers (`topKeywords`, `noResultKeywords`, `conversionRate`) back the admin dashboard's "search performance" panel.

### Health-checking ElasticSearch

`GET /health` reports `elasticsearch: "up" | "down (fallback)"`. The same probe inside `config/elasticsearch.js` runs at boot and any time the search service is called.

### Running ElasticSearch locally

The fastest path is the included `docker-compose.yml`:

```bash
docker compose up -d elasticsearch
# (optionally) docker compose --profile full up -d kibana
```

Then export `ELASTICSEARCH_NODE=http://localhost:9200` in your `.env.local`, boot the backend (`npm run dev`), and call `POST /index/jobs/reindex` as an admin to populate the index. Without Docker the API runs identically — every search call just goes through MySQL.

## 28. Smart matching, AI recommendations, Home & Jobs pages

The `/api/v1/home` + `/api/v1/jobs` surface added in May 2026 layers an
auth-aware "smart" feed on top of the existing public listings without
touching them.

### File map

| File | Responsibility |
| --- | --- |
| `src/services/match.service.js` | Deterministic 0..100 scoring (skills, role, experience, location, salary, category). Apply-time validation. |
| `src/services/jobMatch.service.js` | High-level coordinator: ranks a batch of jobs for one candidate, returns `matchPercentage`, `matchedSkills`, `missingSkills`, `matchReasons`, `aiRecommendationLabel`, `aiSummary` on every row. Applies the 40% threshold. |
| `src/services/ai.service.js` | Rule-based copy generator (label, match summary, missing-skill suggestion, career + profile improvement, recommended job titles). Provider-pluggable for OpenAI later. |
| `src/services/home.service.js` | Aggregates the homepage payload (hero, categories, top companies, latest, recommended, latestMatched, AI suggestions, CTAs). Caches the **guest** payload for 15 min. |
| `src/services/profileMatch.service.js` | Drives `POST /candidates/profile-match`. Completion %, missing fields, recommended skills (sampled from real job demand), AI suggestions. |
| `src/controllers/home.controller.js` | HTTP boundary for `/home`, `/jobs`, `/jobs/recommended`, `/jobs/:id`. All use `optionalAuth`. |
| `src/routes/home.routes.js` | Mounts those routes at `/api/v1`. JSDoc `@swagger` blocks render under the new **Home** tag. |
| `src/validators/home.validator.js` | Joi schemas for the new GET endpoints. |

### Scoring rubric (single source of truth)

`match.service.scoreJob(job, candidate)` returns `{ score, reasons[], gaps[], missing[], decision }` where:

| Component | Max | Trigger |
| --- | --- | --- |
| skills_match | 30 | Skill overlap between job `skills_tags` and candidate skills, normalised by required count. |
| role_match | 25 | Keyword overlap between job title and candidate's current_title / headline. |
| experience | 15 | Candidate clears the job's experience band. |
| location_match | 15 | city > country > remote-compatible. |
| salary_match | 10 | Candidate's expected range overlaps the job's. |
| category_match | 5 | Job's category is in the candidate's preferred_categories. |

`scoreJob` is the only place these weights live; `jobMatch.service` and the controllers consume the output verbatim. The product-spec percentages (skills 50%, category 15%, experience 15%, location 10%, type 10%) are derived from these component caps relative to the achievable total.

### Threshold rules

| Audience | Min match | Source | Override |
| --- | --- | --- | --- |
| Logged-in candidate | 40% | `jobMatch.LOGGED_IN_THRESHOLD` | `?threshold=N&include_below_threshold=true` |
| Guest | none | controller short-circuits to the public list | n/a |

### AI provider plug

`ai.service.summariseMatch()` and friends are sync today and read entirely from rule-based code. To wire OpenAI in:

1. Set `AI_PROVIDER=openai` + `AI_API_KEY=…` in the env.
2. Implement the network call inside `summariseMatch()` behind the `isRemote()` guard.
3. Always compute the local fallback first; return remote text on success, local on any error. This keeps the user-facing flow unbreakable.

### How to add a new profession / skill category later

1. Add the new category to `EXTRA_CATEGORIES` in `seed.expand.js` and rerun `npm run seed:expand` (or use Admin → categories UI in production).
2. Add the new skills to `EXTRA_SKILLS[<category>]` in the same file. Slugs are derived; `INSERT IGNORE` handles existing rows.
3. (Optional) Add corresponding profession entries to the candidate / job templates so the seeder produces realistic demo rows for the new category.
4. To improve AI title suggestions, add lowercased skill keys + their suggested titles to `TITLE_MAP` in `ai.service.js`.

### Frontend integration

| Component | Backend call |
| --- | --- |
| `pages/Home.jsx` | `homeApi.home()` |
| `pages/Jobs.jsx` | `homeApi.jobs({ ...filters })` |
| Recommended rail | inline `payload.recommendedJobs` from `/home`; `homeApi.recommended()` is also exposed for one-off rails |
| Profile widget | `candidatesApi.profileMatch()` |

All endpoints use `optionalAuth`, so the shared axios client automatically attaches the bearer token when present — no separate code paths between guest and authenticated callers.

### Testing matrix

```bash
# Guest path — latest jobs, no match% on cards
curl 'http://localhost:3500/api/v1/jobs?limit=5'

# Candidate path — only > 40% matches, ranked by match% desc
TOKEN=...
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:3500/api/v1/jobs?limit=10'

# Recommended (candidate-only)
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:3500/api/v1/jobs/recommended?limit=8'

# Job detail with match decoration
curl -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/jobs/12

# Profile diagnostic
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/profile-match
```

The Swagger UI under `/api-docs` ships interactive examples for every new endpoint under the **Home** tag.

## 29. Remember Me, Show/Hide Password, Forgot Password (May 2026)

### Remember Me + token storage strategy

`POST /auth/login` accepts an optional `rememberMe` boolean (default `false`). The flag drives two coupled decisions:

| `rememberMe` | Backend: refresh-token TTL                       | Frontend: storage backend     |
|---|---|---|
| `false` (default) | `JWT_REFRESH_EXPIRES_IN` (env, typically `7d`)   | `sessionStorage` — clears when the tab/window closes |
| `true`            | `90 days` (`REFRESH_REMEMBER_DAYS` in service)   | `localStorage` — survives browser restarts |

The backend also writes `users.remember_me_enabled` so the next login defaults the checkbox to whatever the user picked last time. The frontend reads `tokens.isRemembered()` from `Frontend/src/api/client.js` to drive the same default before the user submits.

On app reload (`AuthContext > hydrate`):
1. The `tokens` helper reads from localStorage first, then sessionStorage — whichever has the access token.
2. `/auth/me` is called to validate the session.
3. If the access token has expired, the axios interceptor in `client.js` transparently calls `/auth/refresh-token` once and replays the failed request. If refresh also fails, `matchhire:auth:logout` is dispatched and AuthContext clears state.

Tokens never live in both stores at once — `tokens.set({ rememberMe })` writes to the chosen store and wipes the opposite one. Plain passwords are never persisted anywhere.

### Forgot Password flow

```
SPA  ─POST /auth/forgot-password { email }─►  Backend
                                              ├─ invalidate prior reset tokens for this user
                                              ├─ generate 32-byte hex token (plaintext)
                                              ├─ store SHA-256 hash in password_reset_tokens
                                              ├─ 15-min TTL
                                              └─ Gmail SMTP: send reset email
SPA  ◄── identical generic envelope regardless of whether email matched

User clicks link → /reset-password/:token

SPA  ─POST /auth/verify-reset-token { token }─►  Backend (read-only check)
SPA  ◄── { valid: true }    or  { reason: invalid|used|expired }

SPA  ─POST /auth/reset-password { token, password }─►  Backend
                                                       ├─ consume token (used_at = NOW())
                                                       ├─ bcrypt(password, cost=10)
                                                       ├─ stamp password_changed_at
                                                       ├─ revoke ALL refresh tokens for the user
                                                       └─ Gmail SMTP: confirmation email
SPA  ◄── 200 OK → tokens.clear() → redirect home with "Sign in with new password" banner
```

Security properties:
- **No user enumeration** — `/forgot-password` returns the same envelope for matched and unmatched emails.
- **Single-use tokens** — replaying a consumed token returns `"This reset link has already been used"`.
- **Token rotation** — new `/forgot-password` request invalidates prior tokens for the same user.
- **15-minute TTL** — short enough to limit replay risk, long enough to read on phone and switch to laptop.
- **Out-of-band notification** — every password change sends a confirmation email so the legitimate owner sees account takeover attempts immediately.
- **All-device sign-out** — successful reset revokes every refresh token for the user (`tokens.revokeAllForUser`).
- **Token hashing** — only the SHA-256 hash is stored. The plaintext exists only in transit (email body) and in the URL the user is currently looking at.
- **Rate limiting** — `authLimiter` is applied to all of `/forgot-password`, `/verify-reset-token`, `/reset-password`.

### Show / Hide Password

`Frontend/src/components/PasswordInput.jsx` is a reusable wrapper around a native password input with an integrated eye-toggle button. Used on:
- Sign-in tab + Sign-up tab of `AuthModal.jsx`
- `/reset-password/:token` page (both new + confirm fields)

Accessibility: the toggle has `aria-label="Show password" / "Hide password"` that flips with state, and `aria-pressed` so screen readers announce the toggle state.

### New routes summary

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Now accepts `rememberMe: boolean` |
| POST | `/auth/forgot-password` | Sends real reset email via Gmail SMTP; dev echoes `reset_url` + `reset_token` on Data |
| POST | `/auth/verify-reset-token` | **New**: read-only token validity check |
| POST | `/auth/reset-password` | Now sends out-of-band confirmation email + stamps `password_changed_at` |
| GET | `/forgot-password` (SPA) | `Frontend/src/pages/ForgotPassword.jsx` |
| GET | `/reset-password/:token` (SPA) | `Frontend/src/pages/ResetPassword.jsx` |

### Required environment variables

```env
# Already present from earlier work
JWT_SECRET=...
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d        # used when rememberMe=false; ignored when true (becomes 90d)

# Frontend URL the reset email links to (env-driven so dev/staging/prod don't bleed)
FRONTEND_BASE_URL=http://localhost:5173

# Gmail SMTP (already wired in services/mail/mail.service.js)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-char-app-password   # NEVER your account password
MAIL_FROM="MatchHire <your-gmail@gmail.com>"
MAIL_SUPPORT_EMAIL=support@matchhire.com
```

### Testing recipe

```bash
# 1. apply migration 028 (adds password_changed_at, remember_me_enabled)
cd Backend && npm run migrate
npm run dev

# 2. login WITHOUT rememberMe — refresh TTL should be env-default (7d)
curl -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

# 3. login WITH rememberMe — refresh TTL should jump to 90 days
curl -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD","rememberMe":true}'

# 4. forgot-password — same envelope regardless of email existence
curl -X POST http://localhost:3500/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL"}'        # real → reset_url returned in dev
curl -X POST http://localhost:3500/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody-xyz@example.com"}'   # unknown → reset_url null, same message

# 5. verify-reset-token + reset-password (use TOKEN from step 4)
curl -X POST http://localhost:3500/api/v1/auth/verify-reset-token \
  -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN_FROM_DEV_RESPONSE"}'
curl -X POST http://localhost:3500/api/v1/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN_FROM_DEV_RESPONSE","password":"NewPassword@123"}'

# 6. replay the same token — should fail with "already used"
curl -X POST http://localhost:3500/api/v1/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN_FROM_STEP_4","password":"Whatever@123"}'
```

**Frontend manual tests** (with `cd Frontend && npm run dev` running on http://localhost:5173):

| Scenario | Steps | Expected |
|---|---|---|
| Remember Me OFF | Sign in without ticking the box, close the tab, reopen the SPA | Logged out — `sessionStorage` was cleared |
| Remember Me ON | Sign in with the box ticked, close the browser, reopen | Still signed in — `localStorage` survived |
| Forgot Password | Click "Forgot password?" → enter email → check dev console for reset URL | URL renders inside the success card in dev |
| Reset Password | Open the dev URL, set a new password (must clear weak/mismatch hints), submit | Redirected home, sign in with new password |
| Replay reset URL | Click the same URL twice | Second click shows "Link not usable" with reason `used` |
| Show / Hide password | Type password, click the eye | Field reveals/hides; `aria-pressed` flips |

## 30. Skills catalogue + candidate SkillsPicker (May 2026)

The Skills & Expertise field on the candidate profile was upgraded from a free-text input to a proper multi-select picker backed by the existing `skills` + `candidate_skills` tables plus a small dedicated surface.

### Backend surface

| Verb | Path | Notes |
|---|---|---|
| GET | `/skills?search=&limit=` | Fuzzy catalogue search (prefix ranks higher than substring). Empty query returns top alphabetical. |
| GET | `/skills/categories` | Catalogue grouped by category — each entry is `{ category, count, skills[] }`. |
| GET | `/skills/categories?meta=1` | Flat `{ category, count }` list (cheap, used by sidebars). |
| POST | `/candidates/skills` | **Enhanced**: accepts `mode: "set" \| "add"` and entries as either `{ skill_id, ... }` (catalogue) or `{ name, ... }` (free-text custom — auto-created). |
| POST | `/candidates/skills/list` | Read-only convenience: just the auth'd candidate's current skill set. |
| DELETE | `/candidates/skills/:skill_id` | Single-skill removal. |
| POST | `/candidates/skills/:skill_id/remove` | POST alias of the DELETE (project's POST-only convention). |
| GET | `/public/candidates/:id/skills` | Public read for browsing candidate profiles. |

### Validation rules (enforced at the service layer)

- `MIN_SKILLS_REQUIRED = 3` — enforced **only** on `mode: "set"`. The `mode: "add"` path can start from zero so users aren't trapped.
- `MAX_SKILLS_ALLOWED = 30` — enforced on every write.
- `MAX_SKILL_NAME_LEN = 80` — enforced when creating a free-text custom skill.
- Duplicates — caught both client-side (the picker de-dupes by `skill_id` and lowercased name) and at the DB level (`UNIQUE(candidate_user_id, skill_id)` on `candidate_skills`).
- Joi `xor` on the entry shape rejects payloads that send both `skill_id` and `name` together.

### Free-text custom skills

`POST /candidates/skills` with an entry like `{ name: "Strapi CMS", proficiency: "intermediate" }` will:

1. Case-insensitively look up `Strapi CMS` in `skills.name`.
2. If found, link the existing row.
3. If not found, `INSERT IGNORE` a new row with `category = "User Submitted"` so an admin can re-categorise later. The unique slug means re-running the same custom name is idempotent.

This keeps the catalogue self-improving — users surface skills the seed data missed — without spamming duplicates.

### Seeder

`npm run seed:skills` is an additive seeder that tops up the catalogue with the new product-spec categories:

- Frontend Development, Backend Development, Mobile App Development
- UI/UX Design, QA & Testing, DevOps & Cloud, Database
- Project Management, Content Writing, Business Operations

Re-running is safe (INSERT IGNORE on the unique slug). Existing rows are not modified — a previously-categorised "React.js" under "Technology & Software" is left alone so old data isn't disturbed.

### Frontend

- `Frontend/src/api/skills.js` — API wrappers (`search`, `categories`, `myList`, `save`, `remove`, `forCandidate`).
- `Frontend/src/components/SkillsPicker.jsx` — controlled multi-select component:
  - Debounced (250 ms) autocomplete fetches from `/skills?search=`.
  - Type-and-press-Enter or click to add a suggestion.
  - "+ Add custom" row appears when no exact match.
  - "Browse by category" panel lists every category with one-click bulk add.
  - Selected skills render as chips; custom ones have a small `custom` badge.
  - Backspace from an empty input removes the last chip.
  - Inline counter + min/max + name-length feedback.
- `Frontend/src/pages/Profile.jsx` — uses `SkillsPicker` with `minSkills={3} maxSkills={30}`. Skills are saved separately from the rest of the profile (`Save skills` button under the picker).

### Testing recipe

```bash
# 1. Apply migrations + seed
cd Backend
npm run migrate
npm run seed:skills      # tops up new categories

# 2. Boot the API
npm run dev

# 3. Catalogue search
curl 'http://localhost:3500/api/v1/skills?search=react&limit=5'
curl 'http://localhost:3500/api/v1/skills/categories' | head -c 2000

# 4. Sign in + save skills (replace TOKEN)
TOKEN=...
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mode":"set","skills":[{"skill_id":12},{"skill_id":14},{"name":"Strapi CMS"}]}' \
  http://localhost:3500/api/v1/candidates/skills

# 5. List, then DELETE one
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/skills/list
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/skills/12

# 6. Public view of any candidate's skills (replace 42 with a real id)
curl http://localhost:3500/api/v1/public/candidates/42/skills
```

**Frontend manual test** (`cd Frontend && npm run dev`):
1. Sign in → `/profile` → scroll to **Skills & expertise**.
2. Type "react" → suggestions appear → click "React.js".
3. Click **Browse by category** → expand groups → bulk-add a few.
4. Type "Strapi CMS" (not in catalogue) → `+ Add "Strapi CMS" as a custom skill` row appears → click it.
5. Save skills → reload → custom skill now shows with its assigned id (no longer marked `custom`).

## 31. Profile image, completion score, Review Profile page (May 2026)

The Candidate Profile module gained three coordinated improvements:

### 1. Profile image upload

| Verb | Path | Auth | Description |
|---|---|---|---|
| POST | `/candidates/profile-image` | candidate | Multipart upload, field `image`. JPG/PNG/WEBP up to 2MB. Replaces any prior image (soft-deleted on disk). |
| DELETE | `/candidates/profile-image` | candidate | Clears the image and resets `users.avatar_url`. |

**Storage path**: `Backend/storage/profile-images/<random-hex>.<ext>`, served via the existing signed-URL route (`/api/v1/files/profile-images/<filename>?exp=...&sig=...`). The raw path is never exposed; URLs expire after 7 days but are regenerated on every read.

**Defence in depth**:
- multer rejects > 2MB at the wire (HTTP 413)
- multer `fileFilter` rejects non-image MIME at the header level (HTTP 415)
- service-layer re-checks MIME, extension whitelist (`.jpg/.jpeg/.png/.webp`), AND a magic-number sniff so a renamed executable can't sneak through
- multer's native errors are translated to 413/415 by `withErrorTranslation` in `upload.middleware.js`, so the global 500 handler never sees them

**Database**:
- `candidate_profiles.profile_image VARCHAR(500)` — relative storage path (added in migration 029)
- `users.avatar_url` — mirrored signed URL so existing surfaces (header, dashboard nav, navigation API) light up automatically

### 2. Profile completion score

`recomputeProfileStrength` in `candidate.repository` was rewritten to the product-spec rubric. Each section is partially credited (e.g. basic_info: 2 of 3 sub-fields = 10/15) so the bar moves smoothly:

| Section | Weight | Credited when |
|---|---:|---|
| profile_image | 10% | `candidate_profiles.profile_image` set |
| basic_info | 15% | full_name + headline + current_title (one point each) |
| contact_info | 10% | phone + location + country (one point each) |
| skills_expertise | 15% | ≥ 3 candidate_skills rows |
| work_experience | 15% | current_title set AND years_experience > 0 |
| education | 10% | `candidate_profiles.languages` set OR parsed-resume education JSON non-empty |
| resume_upload | 10% | any resumes row exists OR resume_url set |
| job_preferences | 10% | preferences.desired_titles + preferred_locations |
| social_links | 5% | linkedin_url OR portfolio_url OR github_url |

`computeCompletionBreakdown(user_id)` returns:
```js
{
  score: 77,
  totals: { earned: 77, max: 100 },
  sections: [
    { key, label, weight, earned, percent, complete, hint /* string when !complete */ }
  ]
}
```

Two endpoints surface this:

| Verb | Path | Notes |
|---|---|---|
| GET | `/candidates/profile-completion` | Just the breakdown — used by the dashboard card. |
| GET | `/candidates/review-profile` | Composite — completion + user + profile + image URL + skills + preferences + resume + parsed-resume preview + flat `missing[]` list. |

**Note on REST verbs**: these two are GET on authenticated endpoints — a small, explicit deviation from the project's POST-only-when-authed convention, matching the product spec verbatim. The route still sits behind `requireAuth + requireCandidate` so authorisation isn't relaxed.

**Note on education**: the schema doesn't have a dedicated education table. The score uses `candidate_profiles.languages` and the parsed-resume `education` JSON as proxies. When you add a real education table later, update the `education` section in `computeCompletionBreakdown`.

### 3. Review Profile page

- Route: `/profile/review` (candidate-only, behind `<ProtectedRoute roles={['candidate']} />`)
- Page: `Frontend/src/pages/ReviewProfile.jsx`
- Reuses `ProfileCompletionCard` and renders a top-to-bottom read-only preview of every section the candidate has filled.
- Empty sections render an actionable hint inline (`<EmptyHint>`) rather than disappearing — so the candidate sees what's missing without leaving the page.
- The `"Preview public profile"` button on `Profile.jsx` was renamed to `"Review profile →"` and now navigates here.

### Frontend wiring

- `Frontend/src/api/candidates.js` — new helpers: `profileCompletion()`, `reviewProfile()`, `uploadProfileImage(file)`, `deleteProfileImage()`.
- `Frontend/src/components/ProfileImageUpload.jsx` — drop-in image control. Local preview via `URL.createObjectURL()` before upload. Client-side type/size validation matches backend. Default-avatar (initials) fallback.
- `Frontend/src/components/ProfileCompletionCard.jsx` — progress bar + per-section breakdown + missing-section hints + "Edit profile" / "Review profile" actions. Drops into both `Profile.jsx` (compact) and `DashboardCandidate.jsx` (compact).

### Testing recipe

```bash
# 1. Apply the migration
cd Backend && npm run migrate

# 2. Boot the API
npm run dev

# 3. Log in (any candidate)
TOKEN=$(curl -s -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"azeem.akram78@gmail.com","password":"@@Super253##"}' \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{console.log(JSON.parse(s).Data?.access_token)})")

# 4. Completion BEFORE image
curl -X GET -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/profile-completion

# 5. Upload an image (build a tiny PNG inline)
node -e "require('fs').writeFileSync('/tmp/pic.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108020000009078adff0000000c4944415478da636060f80f0001010100c7e98c5b0000000049454e44ae426082','hex'))"
curl -X POST -H "Authorization: Bearer $TOKEN" -F "image=@/tmp/pic.png" http://localhost:3500/api/v1/candidates/profile-image

# 6. Completion AFTER image (should be +10%)
curl -X GET -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/profile-completion

# 7. Composite read used by the Review page
curl -X GET -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/review-profile

# 8. Validation: TXT → 415, 3MB JPG → 413
echo "hello" > /tmp/not-image.txt
curl -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" -F "image=@/tmp/not-image.txt" http://localhost:3500/api/v1/candidates/profile-image

# 9. Remove the image
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/profile-image
```

**Frontend manual tests** (`cd Frontend && npm run dev`):
1. Sign in → `/profile` → click the avatar circle → pick a JPG/PNG/WEBP.
2. Preview appears immediately, then the server URL replaces it. The dashboard nav avatar in `/dashboard/candidate` reflects the new image too.
3. Click the small `Remove` link under the avatar → falls back to initials.
4. Save the profile form → notice the completion percent moves in real time as `personal_information`, `about`, `social_links` get filled.
5. Click **Preview public profile** → lands on `/profile/review`. Empty sections show the actionable hint, not a blank space.

---

## 31. Profile builder — extended fields + work experience (May 2026)

This release brings the candidate Profile page in line with the
business design spec by adding the fields that were missing,
normalising work history into its own table, and introducing an
explicit Draft vs Publish lifecycle.

### Migrations

| # | Migration | What it does |
| --- | --- | --- |
| 030 | `030_extend_profile_targets.js` | Adds three columns to `candidate_profiles`: `desired_role` (VARCHAR), `work_preference` ENUM(remote/hybrid/onsite), `relocation_scope` ENUM(anywhere/region/remote_only). Idempotent. |
| 031 | `031_create_candidate_experiences.js` | New normalised table `candidate_experiences` for multi-row work history. Cascades on user delete. Idempotent. |

The legacy `candidate_profiles.open_to_remote` boolean is kept for
backward compatibility — `services/candidate.service.js > updateProfile`
derives it from `relocation_scope` when the new column is sent
without the old one.

### New endpoints

| Method | Path | Validator | Purpose |
| --- | --- | --- | --- |
| POST | `/candidates/experiences/list` | — | List the candidate's work history (sorted: current → recent end → recent start) |
| POST | `/candidates/experiences` | `experienceCreate` | Append one new role. Hard cap: 30 rows per candidate |
| POST | `/candidates/experiences/:id` | `experienceUpdate` | Patch an existing row (partial OK) |
| DELETE | `/candidates/experiences/:id` | `experienceIdParam` | Remove a row |
| POST | `/candidates/experiences/:id/remove` | `experienceIdParam` | POST alias for the DELETE above |
| POST | `/candidates/profile/publish-state` | — | `{ publish: boolean }` — flips `is_public` without sending the whole form |

Existing `/candidates/profile/update` accepts three new fields:
`desired_role`, `work_preference`, `relocation_scope`. The `summary`
field now requires **60–2000 characters** (Joi `min(60).max(2000)`)
to match the frontend bio counter and avoid empty bios slipping
through.

### Profile completion — re-tuned weights

```
profile_image          10%   (unchanged)
personal_information   20%   ← was basic_info 15 + contact_info 10
about                  10%   ← new section; partial credit at 30 chars, full at 60
skills                 15%   (unchanged)
work_experience        20%   ← was 15; reads from candidate_experiences,
                              falls back to parsed-resume JSON when empty
resume_upload          10%   (unchanged)
job_preferences        10%   ← now based on desired_role + work_preference
                              + availability + expected_salary_min (any 3 of 4)
social_links            5%   (unchanged)
────────────────────────────
Total                 100%
```

`Backend/src/repositories/candidate.repository.js >
computeCompletionBreakdown` is the single source of truth. Every
profile/skill/experience write calls `recomputeProfileStrength`,
which calls this function and persists the score to
`candidate_profiles.profile_strength`.

### Draft vs Publish

| Action on UI | API call | Effect on `is_public` |
| --- | --- | --- |
| Save Draft | `updateProfile(...)` then `setPublishState(false)` | 0 |
| Save & Publish | `updateProfile(...)` then `setPublishState(true)` | 1 |

`is_public=0` profiles are hidden from public listings
(`listPublicCandidates`), the matching engine, and the top-candidates
rail — but the owner still sees them normally on `/profile` and
`/profile/review`. No new column was added; the existing
`candidate_profiles.is_public` carries the lifecycle.

### Manual test plan

```bash
# 0. Migrate
cd Backend && npm run migrate

# 1. Add a current role
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"company":"Verkada","title":"Senior Frontend","start_date":"2022-03-01","is_current":true,"description":"Led the migration to Next.js 14."}' \
  http://localhost:3500/api/v1/candidates/experiences

# 2. List them
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/experiences/list

# 3. Profile completion should now show work_experience at 60% (1 entry = 0.6 fill)
curl -X GET -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/profile-completion

# 4. Update profile with the new fields
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"desired_role":"Staff Frontend","work_preference":"remote","relocation_scope":"anywhere"}' \
  http://localhost:3500/api/v1/candidates/profile/update

# 5. Save as draft (hide from search)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"publish":false}' http://localhost:3500/api/v1/candidates/profile/publish-state

# 6. Bio too short — should return 422
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"summary":"too short"}' http://localhost:3500/api/v1/candidates/profile/update
```

**Frontend manual tests** (`cd Frontend && npm run dev`):
1. `/profile` shows the 5 numbered cards with all new fields (Phone, Open-to-relocate tri-state, Desired role, Work preference).
2. Bio textarea shows the live counter and warns below 60 chars.
3. Work Experience card supports add / edit / delete + "current role" toggle. End-date field disables when "I currently work here" is ticked.
4. Sidebar shows a **Draft / Published** pill that updates as soon as you click Save Draft or Save & Publish.
5. Completion bar moves correctly: image (10%), Personal info (20%), About (10%), Skills (15%), Work exp (20%), Resume (10%), Looking-for (10%), Social (5%).

## 32. Profile image cross-origin display fix (May 2026)

The May 2026 release of §31 stored a **relative** signed URL
(`/api/v1/files/profile-images/<hex>.jpg?exp=…&sig=…`) on
`users.avatar_url`. That URL works fine when the SPA is served from
the same origin as the API, but Vite in dev serves the SPA on
`:5173` while the API runs on `:3500` — so the browser resolved the
relative path against the SPA origin and returned 404 from Vite.

### Fix summary

1. **New env**: `API_PUBLIC_URL` (defaults to `http://localhost:${PORT}` in dev). Required in staging/prod where the API has a real domain.
2. **New static mount**: `app.use('/uploads/profile-images', express.static(...))` in `app.js`. Profile images are public profile data, so they're served directly — no HMAC signing on every render.
   - `Cross-Origin-Resource-Policy: cross-origin` so `<img>` on a different origin can render the file
   - `Cache-Control: public, max-age=86400, immutable` — files are content-addressed (crypto-random filenames) so cache forever is safe
3. **`profileImage.service.publicUrlFor(storagePath)`**: builds an absolute URL anchored on `apiPublicUrl`. Both `users.avatar_url` and the `image_url` returned from the upload endpoint now use this. `signedUrlFor` is kept as a thin alias for any older import.
4. **`storage.signUrl` also now returns absolute URLs** so resume download links work cross-origin too (same root bug, harder to hit because resumes are downloaded via a new-tab `<a>` click, but fixed for consistency).
5. **Backfill**: existing rows had the legacy relative URL. A one-shot SQL rebuild from `candidate_profiles.profile_image`:
   ```sql
   UPDATE users u
   JOIN candidate_profiles cp ON cp.user_id = u.id
   SET u.avatar_url = CONCAT('http://localhost:3500/uploads/', cp.profile_image)
   WHERE cp.profile_image IS NOT NULL
     AND (u.avatar_url IS NULL OR u.avatar_url LIKE '%/api/v1/files/profile-images/%');
   ```
6. **Frontend hardening**:
   - `ProfileImageUpload.jsx` now renders a real `<img>` (was CSS `background`), with `onError` falling back to the initials avatar — no broken-image placeholder, ever.
   - Cache-busting `?v=<ts>` appended after every successful upload so the SAME-filename-replace edge case still refreshes the in-browser image (the static server's `immutable` header would otherwise hold the stale copy).
   - Real upload progress bar via axios `onUploadProgress`.
   - Drag-and-drop support on the avatar circle.
   - `DashboardCandidate.jsx`'s sidebar avatar likewise switched from `background: url(...)` to `<img onError={...}>`.

### Resume vs. profile image — when to sign vs serve publicly

| Bucket | Visibility | Serving |
|---|---|---|
| `profile-images` | Public profile data — recruiters / other candidates see it | `express.static` mount, no signing |
| `resumes` | Sensitive — only the candidate + employers they applied to should see it | Signed HMAC URL via `/api/v1/files/resumes/...?exp=…&sig=…` |

If you add a new bucket, decide which category it falls in. If it's sensitive, route it through `storage.signUrl`; if it's inherently public, add a static mount in `app.js`.

### Testing recipe

```bash
# 1. Server boot (auto-creates the bucket on first upload)
cd Backend && npm run dev

# 2. Direct fetch — should be 200 + Cross-Origin-Resource-Policy: cross-origin
curl -sI http://localhost:3500/uploads/profile-images/<some-file>.jpg

# 3. From a Vite-style origin (simulating the SPA)
curl -sI -H 'Origin: http://localhost:5173' \
  http://localhost:3500/uploads/profile-images/<some-file>.jpg | \
  grep -iE 'access-control|cross-origin-resource-policy|cache-control'
```

Expected:
- HTTP 200
- `Cross-Origin-Resource-Policy: cross-origin`
- `Access-Control-Allow-Origin: http://localhost:5173`
- `Cache-Control: public, max-age=86400, immutable`

## 33. Candidate Onboarding Wizard (Phase 1.7)

A guided 7-step first-run experience that walks newly-registered candidates through profile setup without exposing the full `/profile` editor on day one.

### Architecture in one paragraph

The wizard's **per-step data** is saved through the **existing** endpoints (`/profile/update`, `/skills`, `/experiences/*`, `/preferences`, `/resume/*`) — nothing new there. The **only** new surface is a tiny "where am I in the wizard?" state tracker so users can close the tab and resume. Two columns on `candidate_profiles` + three endpoints + one frontend page.

### Database (migration 033)

| Column | Type | Purpose |
|---|---|---|
| `onboarding_step` | TINYINT UNSIGNED, default 0 | Current step index, 0..6 |
| `onboarding_completed_at` | DATETIME NULL | Set ONCE when user clicks Complete on step 6 |

Both columns are nullable / have safe defaults — existing rows untouched.

### Backend surface (all `POST /candidates/onboarding/*`)

| Verb | Path | Body | Returns |
|---|---|---|---|
| POST | `/state` | (none) | `{ current_step, total_steps, is_completed, completed_at, profile_strength, completion }` |
| POST | `/advance` | `{ step: 0..6, complete?: boolean }` | Updated state |
| POST | `/reset` | (none) | State with `step=0, completed_at=null` |

All three behind `requireAuth + requireCandidate`. Joi-validated on `advance`. Audit-trailed via the standard request log.

### Step catalogue (lockstep — backend service constants match frontend)

| Index | Label | Required | Reuses |
|---:|---|:---:|---|
| 0 | Basic Information | ✅ | `ProfileImageUpload` + form inputs |
| 1 | Resume Upload | optional | `ResumeUploadCard` (existing parse + confirm flow) |
| 2 | Skills & Expertise | ✅ | `SkillsPicker` (catalogue + custom, 3..30) |
| 3 | Work Experience | optional | `WorkExperienceCard` (CRUD + `MonthYearPicker`) |
| 4 | Education | optional | Free-text textarea → `candidate_profiles.education` |
| 5 | Job Preferences | optional | Inline subset of `/preferences` page |
| 6 | Review & Complete | — | `ReviewPanel` summary + "Complete profile" CTA |

### Frontend behavior

- **Route**: `/onboarding` (candidate-only, guarded by `<ProtectedRoute roles={['candidate']}/>`)
- **Sidebar**: 7 step indicators with ✓/●/○ states; clickable for already-visited steps; auto-jumps via `POST /onboarding/advance`
- **Per-step validation**: mirrors the Joi schema for that step (e.g. min 3 skills on step 2 surfaces inline)
- **Footer actions**: `← Back`, `Skip this step` (optional steps only), `Save & exit` (banks progress + redirects to dashboard), `Save & next →`, `Complete profile ✓` (final step)
- **Toast feedback**: `Saved`, `Skipped — you can come back`, `Progress saved — pick up here anytime`, `Profile complete!`
- **Banner on the candidate dashboard**: gradient "Continue your setup — Step X of 7" with a deep link back to `/onboarding`. Hides automatically once `onboarding_completed_at` is set.

### Sample candidate data

The existing seeders (`seed.industries.js`, `seed.expand.js`) already populate ~270 candidates with profiles. **Their `onboarding_step` defaults to 0** (the migration default), so on first login any seeded candidate sees the Continue-setup banner. To pre-mark seeded candidates as already-onboarded for demo purposes:

```sql
UPDATE candidate_profiles
   SET onboarding_step = 6,
       onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
 WHERE profile_strength >= 60;
```

Run this once after `npm run seed:industries` if you want the demo accounts to skip the wizard banner.

### Testing recipe

```bash
# 1. Apply migration
cd Backend && npm run migrate

# 2. Boot
npm run dev

# 3. Log in as a candidate (the demo user works)
TOKEN=$(curl -s -X POST http://localhost:3500/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"azeem.akram78@gmail.com","password":"@@Super253##"}' \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{console.log(JSON.parse(s).Data?.access_token)})")

# 4. Read state
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/candidates/onboarding/state | jq

# 5. Advance to step 3
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"step":3}' \
  http://localhost:3500/api/v1/candidates/onboarding/advance | jq

# 6. Mark complete
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"step":6,"complete":true}' \
  http://localhost:3500/api/v1/candidates/onboarding/advance | jq

# 7. Reset and start over (useful in dev)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/candidates/onboarding/reset | jq
```

**Frontend manual test** (`cd Frontend && npm run dev`):
1. Sign in as a candidate → `/dashboard/candidate` → click the coral "Resume onboarding →" banner.
2. Walk through each step. Step 0 has inline validation (try saving with full_name empty).
3. Step 2: try Save & next with 0 skills — backend returns 422, banner shows the error.
4. Step 6: click Complete profile → toast → redirected to `/dashboard/candidate`, banner is gone.
5. Open `/onboarding` again directly — it now lands on step 6 (already complete).

### Out of scope (deliberately)

- **Auto-redirect after first login**: the wizard is reachable via the dashboard banner; we don't auto-redirect new users. Adding `if (!onboarding.is_completed) navigate('/onboarding')` in `AuthContext` is a 2-line change if you want stronger nudging.
- **Email "complete your profile" reminders**: trivial follow-up using the existing `email.queue` + a cron worker.
- **Company / Admin onboarding wizards**: not built — current scope is candidate-only per the spec.

## 34. Resume management (May 2026)

The resume upload + parse + confirm pipeline already existed (see §
on Resume Parsing). This section adds five candidate-facing management
actions that were missing: **set-primary, soft-delete, get-detail,
update-parsed-data, reject-parsed-data**. The result is a complete
"list / view / edit / promote / delete" surface alongside the
existing upload flow.

### Migration

`034_add_resume_rejection_reason.js` adds one column:

| Column | Type | Purpose |
|---|---|---|
| `resumes.rejection_reason` | VARCHAR(500) NULL | Free-text note set by `/reject` action; kept for audit + surfaced inline in the management list |

Idempotent — guarded on `information_schema.columns`.

### Backend surface

All endpoints sit under the existing `/candidates/resume/*` path (singular per project convention — the spec's `/candidate/resumes/*` plural shape is documented here as the intent; the singular URL is what shipped to keep the surface consistent with the existing upload/parse/confirm/download routes).

| Verb | Path | Purpose |
|---|---|---|
| POST | `/candidates/resume/:id/detail` | `{ resume, parsed }` in one round-trip |
| POST | `/candidates/resume/:id/set-primary` | Atomic swap: clears all `is_primary`, then sets this one |
| POST | `/candidates/resume/:id/delete` | Soft-delete; auto-promotes next-newest if primary was deleted |
| POST | `/candidates/resume/:id/parsed-data` | Save manual edits to parsed preview **without** applying to profile |
| POST | `/candidates/resume/:id/reject` | Record `rejection_reason`, flip `parse_status='failed'`; keeps file on disk |

Every action behind `requireAuth + requireCandidate`, with an extra service-layer ownership check (`loadOwnedResume`) — candidates cannot see or touch each other's resumes.

### How the new actions relate to the existing ones

```
upload  →  parse  ↘
                    review-and-edit-in-memory  →  confirm (apply to profile)
                  ↗                              ↘
        re-parse                                   reject (keep file, mark failed)

list / detail / signedUrl / set-primary / delete / parsed-data   ← orthogonal to the pipeline
```

`/confirm` is what the spec calls "Apply to profile" — same operation, the existing name is kept.

### Frontend

`Frontend/src/components/ResumeUploadCard.jsx` gained:

- A **Resume Management list** between the upload button and the review panel — one row per uploaded resume with: filename, parse-status pill, primary badge, size + uploaded date, `rejection_reason` inline when present, and per-row actions: **Set primary · Edit parsed · Download · Delete**
- A **Reject parsed data** button on the review panel (with optional reason prompt)
- A **Save preview only** button that persists manual edits to `resume_parsed_data` without applying to the candidate profile — for the "let me come back and apply later" case

The button labelling matches the spec verbatim:
- **Accept & update profile** (was "Apply to profile →")
- **Reject parsed data**
- **Save preview only** (new — covers the spec's "keep resume uploaded without updating profile" case)

Frontend API wrapper (`Frontend/src/api/candidates.js > resume.*`) gained matching methods: `detail`, `setPrimary`, `delete`, `updateParsed`, `reject`.

### Owner-check behavior

Cross-user access returns **403 Forbidden** before any file I/O. The ownership gate is centralised in `loadOwnedResume(user_id, resume_id)` inside `resume.service.js`, so it runs identically for every action.

### Primary-resume invariants

- After every action, **exactly one** resume row per candidate has `is_primary = 1` (provided they have ≥ 1 non-deleted resume)
- `setPrimary` runs as a transaction so the UI never observes 0 or 2 primaries during the swap
- If the user deletes their primary resume, the **next-newest non-deleted** resume is auto-promoted in the same request

### Live smoke test (verified)

```
A. Upload PDF           → resume_id 3
B. Parse                → "Jane Doe" / "jane@example.com" extracted
C. GET detail           → resume + parsed in one call
D. Update parsed-data   → "Azeem Akram (edited)" + skills [React, Node.js, MySQL] persisted
E. Set primary          → atomic swap; 1 of 4 primary
F. Reject               → parse_status='failed', rejection_reason stored
G. Soft-delete          → row dropped from list, file renamed `.deleted-<ts>`
```

### Testing recipe

```bash
# 1. Apply migration
cd Backend && npm run migrate

# 2. Boot
npm run dev

# 3. Get a token + try every action (replace TOKEN and ID)
TOKEN=...; ID=3
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/resume/$ID/detail
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/resume/$ID/set-primary
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"full_name":"Edited Name","skills":["React","Node"]}' \
  http://localhost:3500/api/v1/candidates/resume/$ID/parsed-data
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Outdated version"}' \
  http://localhost:3500/api/v1/candidates/resume/$ID/reject
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3500/api/v1/candidates/resume/$ID/delete
```

Browse the new endpoints interactively at **`http://localhost:3500/api-docs`** under the **Candidates** tag (filter on "resume").


## 35. Saved-for-later jobs (May 2026)

Apply-intent surface that complements `favorites`. Two parallel signals:

| Signal | Table | Semantics | Expiry |
| --- | --- | --- | --- |
| Favourite | `favorites` | "I like this role" | Never |
| Saved for later | `saved_jobs` | "I plan to apply to this role" | Auto-drops when the job's `application_deadline` passes |

The two surfaces are kept separate per product spec — the candidate dashboard renders them as different sections with different actions.

### Migration

`Backend/src/database/migrations/035_create_saved_jobs.js` creates the `saved_jobs` table with `UNIQUE (candidate_user_id, job_id)`, `expires_at` (denormalised snapshot of `jobs.application_deadline` at save-time), `status ENUM('active','archived')` (today only `active` is written; admin tooling can flip rows later), plus CASCADE FKs to `users` + `jobs`. Idempotent via `information_schema` guard.

### Why `expires_at` is denormalised server-side

We snapshot the deadline at save-time rather than recomputing on read. Two reasons:

1. **Tamper-proof window** — a client-supplied deadline could extend the apply window arbitrarily. The service reads `jobs.application_deadline` from the trusted row and writes that.
2. **Intent integrity** — if the employer later moves the deadline, the candidate's "I saved this NOW" intent stays bound to the deadline that existed at save-time.

If the existing deadline is already in the past at save-time, the service refuses with a 400 instead of silently inserting a row that immediately expires.

### Backend surface

All routes are POST per the project rule, mounted at `/candidates/saved-jobs/*`:

| Route | Description |
| --- | --- |
| `POST /candidates/saved-jobs/list` | Paginated list, expired rows filtered by default. Body `{ page?, limit?, include_expired? }`. |
| `POST /candidates/saved-jobs/:jobId/save` | Idempotent save. `expires_at` is derived server-side. Re-saving touches `updated_at`. 400 if past deadline. |
| `POST /candidates/saved-jobs/:jobId/remove` | Hard delete by composite key. 404 if not saved. |
| `POST /candidates/saved-jobs/:jobId/eligibility` | **Dry-run** match check — does NOT create an application. Returns `{ can_apply, decision, match_score, missing, gaps, message }`. Always 200. |

The eligibility endpoint reuses `match.service.validateApplication()` so the verdict stays in lockstep with the actual `validate-and-apply` write path. The SPA's apply modal hits this before posting so the Apply button can be gated with a tailored message.

### Frontend

- `Frontend/src/api/candidates.js > savedJobs.*` — `list`, `save`, `remove`, `eligibility`.
- `Frontend/src/context/SavedJobsContext.jsx` — sibling of `FavoritesContext`; owns the set of saved job ids, hydrated on auth changes, optimistic toggle.
- `Frontend/src/components/JobCard.jsx` — bookmark icon (⌘) stacked under the heart (♥); heart = like, bookmark = plan-to-apply.
- `Frontend/src/pages/SavedJobs.jsx` — `/saved-jobs` route. Layout mirrors `Favorites.jsx`. Each card shows the deadline-derived expiry label ("Expires in 4d", "Expires tomorrow" rendered coral) and runs the eligibility dry-run before submitting.
- `Frontend/src/pages/DashboardCandidate.jsx` — sidebar now distinguishes `♥ Favourites` from `⌘ Saved for Later`.

### Live smoke test (verified)

```
1. Login as candidate                                          → access_token
2. GET /public/jobs?limit=5                                    → 5 jobs
3. POST /candidates/saved-jobs/228/save                        → 201 Job saved
4. POST /candidates/saved-jobs/228/save (idempotent)           → 201 (no 409)
5. POST /candidates/saved-jobs/list                            → 3 items (after 3 saves)
6. POST /candidates/saved-jobs/228/eligibility                 → 200 { can_apply:false, match_score:25, missing:[…] }
7. POST /candidates/saved-jobs/228/remove                      → 200 Saved job removed
8. POST /candidates/saved-jobs/228/remove (already gone)       → 404 Saved job not found
9. POST /candidates/saved-jobs/list (after cleanup)            → records: 0

Repository-level expiry filter:
  insert row with expires_at = yesterday
  → list (default)         → 0 rows  (expired filtered out)
  → list (include_expired) → 1 row
  → exists()               → false
```

### Testing recipe

```bash
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"azeembscs16@gmail.com","password":"@@Super253##"}' \
  http://localhost:3500/api/v1/auth/login | jq -r .Data.access_token)

JOB_ID=228

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/candidates/saved-jobs/$JOB_ID/save
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"page":1,"limit":10}' \
  http://localhost:3500/api/v1/candidates/saved-jobs/list
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/candidates/saved-jobs/$JOB_ID/eligibility
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3500/api/v1/candidates/saved-jobs/$JOB_ID/remove
```

Swagger: open `http://localhost:3500/api-docs` and filter the **Candidates** tag on "saved-jobs".

### Why no match-score cache table

Match scoring is computed in sub-millisecond by `match.service.scoreJob`. Caching it in a `job_match_scores` table introduces an invalidation problem (recompute on profile edit / skills change / preferences change / new job, etc.) for no measurable win. The dashboard re-scores on each list call; if listing becomes a hot path, denormalise inside `applications.match_score` (already done for the apply-time path).
