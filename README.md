# MatchHire

A curated career marketplace for senior talent and the companies smart
enough to hire them.

This repository now hosts the **full stack** for MatchHire: a React
SPA in `Frontend/` talking to a Node.js + Express + MySQL + Redis API
in `Backend/`. The original static HTML prototype has been converted
into the React app, then wired live to the API — no hard-coded
fixtures remain on any page.

```
.
├── Backend/           Node.js + Express + MySQL + Redis API
│   ├── README.md      backend overview
│   └── docs/
│       └── DEVELOPER_GUIDE.md   architecture, conventions, how-tos
├── Frontend/          React SPA (Vite + React Router + axios)
│   └── README.md      frontend overview
├── docs/              project-level reference docs (HTML/PDF originals)
└── README.md          (this file)
```

## Quick start

You need Node.js 18+, MySQL 8, and (optionally) Redis 6+.

```bash
# 1. install once - root + Backend + Frontend dependencies
npm run install:all

# 2. configure
cp Backend/.env.example  Backend/.env.local       # set DB + JWT + Redis
cp Frontend/.env.example Frontend/.env.local      # defaults to localhost:3500

# 3. seed the database
npm run migrate
npm run seed

# 4. boot everything in one terminal
npm run dev
```

`npm run dev` uses [`concurrently`](https://www.npmjs.com/package/concurrently)
to run the Backend and Frontend dev servers side-by-side. Logs are
prefixed `be` (cyan) and `fe` (magenta). If either crashes, both are
killed so you don't end up with a half-started stack.

**No manual restart needed:**

- Backend uses **nodemon** (`Backend/nodemon.json` watches `src/`,
  `.env`, `.env.local`, `.env.production`, `.env.example` for `.js`,
  `.json`, `.env` changes). Save a controller / service / route / config
  / env file and the server reloads automatically.
- Frontend uses **Vite HMR**. Component / page / CSS / `.env.local`
  edits push live into the browser without a full reload.

Useful URLs once it's up:

| URL | What |
| --- | --- |
| `http://localhost:5173`              | The React app |
| `http://localhost:3500/health`       | Liveness probe + dependency status |
| `http://localhost:3500/api-docs`     | Swagger UI (interactive) |
| `http://localhost:3500/api-docs.json` | Raw OpenAPI 3.0 spec |
| `http://localhost:3500/api/v1`       | Versioned API root |

The Header reads the menu from `GET /public/navigation`, so links
appear/disappear based on the signed-in role. Sign in with one of the
demo accounts from `Backend/README.md > Demo accounts` (password
`Password@123` for all).

### Need just one side?

```bash
npm run dev:backend     # Backend only (nodemon)
npm run dev:frontend    # Frontend only (Vite HMR)
```

## Tech stack

### Backend
| Layer | Choice |
| --- | --- |
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | MySQL 8 (`mysql2`, parameterised queries) |
| Cache | Redis 6+ via `ioredis`, with automatic MySQL fallback |
| Auth | JWT (access + rotated refresh), `bcryptjs` |
| Validation | Joi |
| Docs | OpenAPI 3.0 served by `swagger-ui-express` |
| Security | helmet, cors, express-rate-limit |
| Logging | winston + morgan |

### Frontend
| Layer | Choice |
| --- | --- |
| Build tool | Vite 5 |
| UI library | React 18 |
| Routing | react-router-dom v6 |
| HTTP | axios (centralised client w/ bearer + refresh interceptor) |
| State | React Context (Auth / AuthModal / Favorites) |
| Styling | Hand-written CSS — design system tokens preserved 1:1 |

## What's in the box (global job portal)

- **Location-based job discovery** — the Jobs page resolves the
  visitor's location (stored preference → browser geolocation →
  IP fallback via the backend's `/public/geolocate` proxy) and calls
  `GET /public/jobs/location-based`. Results are ranked by
  city > country > global remote.
- **Skill-based matching** — every job carries a `match_score`
  (0..100), `reasons[]`, and `missing[]` when fetched with a candidate
  bearer token. The same algorithm powers `POST /candidates/jobs/match`
  for the recommendations rail.
- **Match-validated applications** — `POST /candidates/applications/:jobId/validate-and-apply`
  scores the candidate first. Hard mismatches are rejected with a
  polite, specific reason (`"Your profile is missing key skills for
  this role: react, typescript."`); good matches create the
  application with `match_score` stored alongside it.
- **Resume upload + parse + auto-fill** — PDF/DOCX/TXT, max 5MB,
  parsed with `pdf-parse`/`mammoth` + heuristic extractors. The
  candidate reviews every field on the Profile page before it merges
  into the profile and skills. Files are stored under
  `Backend/storage/resumes/`; downloads use short-lived HMAC-signed
  URLs.
- **Email verification** — registration creates a `pending` user and
  emails a verification link (console-logged + returned in dev for
  one-click testing). Login is blocked until the user clicks the
  link. Resend is rate-limited and intentionally vague (never reveals
  whether the email exists).
- **Global / local toggle + scope preference** — `preferences.job_scope`
  (`local | country | global_remote | hybrid`) controls the Jobs feed.

## How they connect

- The frontend talks **only** to the backend, never to a third party
  directly.
- All requests/responses use the MatchHire envelope:

  ```json
  { "Response": { "responseCode": 1, "status": "Success", "message": "..." },
    "Data":     { ... } }
  ```

- Authenticated APIs are **POST-only** (project rule). Pagination/
  filters travel in the request body. Public list/detail endpoints
  remain GET with query-string filters.
- Auth: `POST /auth/login` → frontend stores `access_token` and
  `refresh_token` in `localStorage` and attaches `Authorization:
  Bearer ...` on every subsequent request.
- Navigation is dynamic: `GET /public/navigation` returns the menu
  appropriate for the caller's role. The Frontend's header is a
  rendered view of that payload — there is no role branching in the
  Frontend's link list.
- Caching: read-heavy public endpoints are cached in Redis with
  domain-specific TTLs. Mutations in the service layer invalidate the
  matching cache keys/patterns. If Redis is offline, every cache call
  short-circuits and the API serves directly from MySQL.

## Documentation map

- [Backend/README.md](Backend/README.md) — install, configure, run,
  full route table.
- [Backend/docs/DEVELOPER_GUIDE.md](Backend/docs/DEVELOPER_GUIDE.md) —
  architecture, request lifecycle, auth flow, RBAC, response envelope,
  Redis cache strategy + invalidation rules, validation, error
  handling, Swagger usage, how to add APIs/tables/services/validators,
  coding/naming/git standards, troubleshooting.
- [Frontend/README.md](Frontend/README.md) — folder layout, API
  client, AuthContext, ProtectedRoute, environment, scripts.
- `/api-docs` (when the backend is running) — interactive Swagger UI
  with request/response examples for every endpoint.

## Deployment notes

### Local

- Start the backend first (`npm run dev` in `Backend/`).
- Then the frontend (`npm run dev` in `Frontend/`).
- Both have hot reload.

### Staging / production

- Set `NODE_ENV=production` for the backend (loads `.env.production`).
- Replace every `__SET_PROD_*__` placeholder before deploy.
- Run `npm run migrate` against the production DB during release.
- Build the frontend with `npm run build`; serve `Frontend/dist/`
  behind your CDN or an nginx static block.
- Set `VITE_API_BASE_URL` to the public API URL at build time.
- Reverse proxies (NGINX / ALB / CloudFront) should preserve
  `X-Forwarded-For`; the backend already trusts the first proxy hop.
- Tighten `CORS_ORIGIN` on the backend to the frontend's hostname(s).
- Redis is recommended in production but the API runs without it.

## Demo accounts (after `cd Backend && npm run seed`)

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

## License

MIT
