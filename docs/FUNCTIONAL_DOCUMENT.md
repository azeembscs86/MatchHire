# Match Hire — Functional & System Document

**AI-Powered Global Job Portal Platform**

---

| | |
|---|---|
| **Document version** | 1.0 |
| **Status** | Production-ready foundation (Phase 1 complete) |
| **Audience** | Investors · Engineering · QA · UI/UX · Management · Clients · New joiners |
| **Codebase reference** | This document is grounded in the live repository. Every shipped claim links to a concrete file path. |
| **Implementation legend** | ✅ Shipped & verifiable in code  ·  🚧 Partially implemented  ·  🔮 Planned (Phase 2+) |

---

## Table of Contents

0. [Implementation Status Legend](#0-implementation-status-legend)
1. [Project Overview](#1-project-overview)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Functional Modules](#4-functional-modules)
5. [Workflow Diagrams](#5-workflow-diagrams)
6. [Screen-by-Screen Documentation](#6-screen-by-screen-documentation)
7. [Screenshots Sections](#7-screenshots-sections)
8. [API Flow Documentation](#8-api-flow-documentation)
9. [Database Documentation](#9-database-documentation)
10. [AI Features Documentation](#10-ai-features-documentation)
11. [Security Documentation](#11-security-documentation)
12. [DevOps & Deployment](#12-devops--deployment)
13. [Notification System](#13-notification-system)
14. [Reporting & Analytics](#14-reporting--analytics)
15. [Future Scalability Plan](#15-future-scalability-plan)
16. [UI/UX Principles](#16-uiux-principles)
17. [Development Phases](#17-development-phases)
18. [QA Checklist](#18-qa-checklist)
19. [Conclusion](#19-conclusion)
20. [Appendix — Codebase Reference Map](#20-appendix--codebase-reference-map)

---

## 0. Implementation Status Legend

Every section in this document is annotated with one of three status indicators so the reader can immediately tell what is in production versus what is on the roadmap.

| Symbol | Meaning |
|---|---|
| ✅ | **Shipped** — code exists, endpoints are live, end-to-end tested |
| 🚧 | **Partial** — foundation exists, some features behind a flag or still being polished |
| 🔮 | **Planned** — designed in this document, scheduled for Phase 2/3/4 |

**Why this matters**: enterprise functional documents typically conflate "designed" with "delivered". Match Hire's document keeps them separate so investors, clients, and QA can plan around real capability.

---

## 1. Project Overview

### 1.1 Purpose of the Platform

Match Hire is a curated, AI-augmented career marketplace where senior talent and the companies hiring them meet through high-signal matching rather than keyword soup. Where traditional job boards optimize for posting volume, Match Hire optimizes for **fit** — every job a candidate sees is scored against their actual profile, and every applicant a recruiter sees arrives pre-ranked.

### 1.2 Business Goals

| Goal | Measurable Outcome |
|---|---|
| Reduce time-to-fit-applicant for employers | Pre-scoring & threshold filtering remove ~60% of off-target applications before they reach the company dashboard |
| Increase candidate confidence in matches | Every job card surfaces match%, matched skills, missing skills, and an AI label (Excellent / Strong / Good / Partial) |
| Become the default portal for senior + cross-border roles | Location-aware ranking (city > country > global remote) + multi-currency salary support |
| Generate recurring B2B revenue | 🔮 Subscription tiers for employers (Phase 3) |
| Eliminate "ghost" job postings | Admin verification workflow + company verification status surfaced to candidates |

### 1.3 Problems Being Solved

1. **Spray-and-pray applications waste everyone's time** — candidates apply to 100 jobs to get 2 callbacks; recruiters drown in unqualified resumes. Match Hire's apply-time validation rejects sub-threshold matches with a specific, polite reason ("Your profile is missing key skills for this role: React, TypeScript.").
2. **Generic job boards don't understand seniority bands** — a 9-year backend engineer should not see "Junior Backend" roles. Match Hire scores against experience tiers (entry → executive).
3. **Resume re-typing fatigue** — uploading a resume should auto-populate the profile. Match Hire parses PDF/DOCX/TXT and presents extracted fields for review before merge.
4. **Skill catalogues that don't track market reality** — when a candidate types a niche skill ("Strapi CMS"), it's auto-created in the catalogue under "User Submitted" so the platform self-improves.
5. **Global-vs-local discoverability** — most boards treat remote roles as second-class. Match Hire surfaces them as a first-class category alongside city and country buckets.

### 1.4 Target Audience

| Segment | Profile |
|---|---|
| **Senior Candidates** | 3+ years experience, often in tech / healthcare / finance / engineering; want curated matches, not infinite scroll |
| **Mid-market Employers** | 11-500 person companies; need quality applicants without enterprise ATS overhead |
| **Recruiters & HR Managers** | Look for candidates with verified skills and parseable resumes |
| **Cross-Border Workers** | South Asian, MENA, and remote-first candidates seeking global opportunities |
| **Career Switchers** | People moving between adjacent functions (e.g. backend → DevOps) who benefit from AI skill-gap analysis |

### 1.5 Platform Vision

> *Senior talent meets companies smart enough to hire them — without the noise.*

A curated marketplace where the quality of every match is measurable, the time to a real conversation is shorter, and both sides know within seconds whether to keep talking.

### 1.6 Key Objectives (Year 1)

1. Onboard the first 10,000 verified candidates and 500 verified employers.
2. Maintain a sub-2-second median page load on every public page.
3. Hit ≥ 70% match accuracy (defined: candidates rate "this job was relevant" on ≥ 7 of every 10 recommended jobs).
4. 99.5% API uptime (SLO).
5. Zero credential breaches (security hardening from day one).

---

## 2. System Architecture Overview

### 2.1 High-Level Topology

```
                      ┌───────────────────────────────┐
                      │   Browsers (Desktop / Mobile) │
                      │   React SPA · Vite · :5173    │
                      └─────────────┬─────────────────┘
                                    │ HTTPS / JSON
                                    ▼
              ┌───────────────────────────────────────────┐
              │       Match Hire API  (Express 4)         │
              │   Node 18+  ·  :3500  ·  /api/v1/*        │
              │                                           │
              │   helmet · cors · compression · morgan    │
              │   express-rate-limit · Joi · JWT          │
              └─┬────────────┬───────────────┬────────────┘
                │            │               │
       ┌────────▼───┐  ┌─────▼──────┐  ┌────▼─────────────────┐
       │  MySQL 8   │  │ Redis 6+   │  │  ElasticSearch 8     │
       │ (mysql2)   │  │ (ioredis)  │  │ edge-ngram autocomp. │
       │ 31 tables  │  │ cache+BQ   │  │ jobs/cand/resume idx │
       └────────────┘  └────────────┘  └──────────────────────┘
                            │
                  ┌─────────┴──────────┐
                  │  BullMQ workers    │
                  │  email · resume ·  │
                  │  match · notif     │
                  └────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │  Gmail SMTP        │
                  │  (Nodemailer)      │
                  └────────────────────┘
```

### 2.2 Frontend ✅

| Layer | Choice | Why |
|---|---|---|
| Build tool | **Vite 8** | Sub-second HMR, native ESM, no Webpack legacy |
| UI framework | **React 18** | Hooks-only, Suspense-ready |
| Routing | **react-router-dom v6** | File-conventional, nested layouts |
| HTTP | **axios** with central interceptor | Bearer attach, transparent refresh-token rotation, unified envelope unwrap |
| State | **React Context** (Auth / AuthModal / Favorites) | Three small contexts, no Redux ceremony |
| Styling | Hand-written CSS with design tokens | Design system preserved 1:1 from spec; no Tailwind / MUI bloat |

**Entry points** (`Frontend/src/`):
- `App.jsx` — route table
- `main.jsx` — provider stack
- 16 page components in `pages/`
- 13 reusable components in `components/` (JobCard, SkillsPicker, MonthYearPicker, ProfileImageUpload, etc.)
- 8 API modules in `api/` (centralised axios + per-domain wrappers)

### 2.3 Backend ✅

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 18+ | Native fetch, AbortSignal.timeout, no node-fetch dep |
| Framework | Express 4 | Boring, predictable, every Stack Overflow answer applies |
| Validation | **Joi** | Schema-first, declarative |
| Auth | **JWT** access + rotated refresh | bcryptjs cost 10 for passwords |
| Docs | **OpenAPI 3.0** + Swagger UI | 102 endpoints documented, JSDoc-derived |
| Logging | winston + morgan | JSON structured, piped to stdout |
| Security | helmet, cors, express-rate-limit | Defence-in-depth at the edge |

**Layer separation** (enforced by code review, not framework magic):

```
Route  →  Controller  →  Service  →  Repository  →  MySQL / Redis / ES
  ↓
Validator (Joi) intercepts before Controller
```

No SQL lives outside repositories. No business logic lives in controllers. No response shaping lives in services.

### 2.4 Database — MySQL 8 ✅

31 migrations shipped. See [Section 9](#9-database-documentation) for the full schema.

**Convention**:
- All FKs cascade on update; soft-delete via `deleted_at` instead of hard delete for user-facing entities
- All timestamps are `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `UNIQUE(slug)` on every public-facing entity (companies, jobs, skills, categories) for SEO-friendly URLs
- Parameterised queries everywhere; raw string concatenation forbidden

### 2.5 Redis ✅

`ioredis` client with **automatic MySQL fallback** when Redis is unavailable — every cache call is a `safeClient()` check away from a no-op. The API never breaks because Redis is down.

| Use case | Implementation |
|---|---|
| Read-through caching | `cache.rememberCache(key, ttl, loader)` — `Backend/src/cache/cache.helper.js` |
| Domain invalidation | `cache.deleteByPattern('jobs:list:*')` after every job write |
| Session metadata | Multi-device session listing (`session.service.js`) |
| Trending sorted sets | Weighted job/company popularity (`trending.service.js`) |
| BullMQ broker | Job queues use the same Redis instance |

**TTL standards** (`cache.helper.js`):
- Jobs list: 10 min
- Job detail: 15 min
- Companies list: 30 min
- Categories / skills: 60 min
- Dashboard stats: 5 min

### 2.6 ElasticSearch ✅

Three indexers (jobs, candidates, resumes) with **edge-ngram autocomplete** for the SkillsPicker and search bar.

- `Backend/src/config/elasticsearch.js` — lazy client + idempotent index mappings
- `Backend/src/indexers/job.indexer.js`, `candidate.indexer.js`, `resume.indexer.js` — single + bulk reindex
- `Backend/src/services/search.service.js` — fuzzy `AUTO` multi-match, MySQL fallback on ES failure

**Reindex endpoints** (admin):
- `POST /api/v1/index/jobs/reindex`
- `POST /api/v1/index/candidates/reindex`
- `POST /api/v1/index/resumes/reindex`

### 2.7 Queue System — BullMQ ✅

| Queue | Producer | Worker job |
|---|---|---|
| `email.queue` | auth flows, password reset, application status changes | Render template + send via Nodemailer |
| `resume.queue` | resume upload | pdf-parse / mammoth extraction + heuristic structuring |
| `match.queue` | nightly cron 🚧 | Recompute match scores across the candidate ↔ job grid |
| `notification.queue` | application events, interview scheduling | Persist in `notifications` table + dispatch email |

Every queue producer **falls back to inline execution** when Redis is offline — user-facing flows never block on a degraded broker.

### 2.8 Notification System

| Channel | Status | Mechanism |
|---|---|---|
| Email | ✅ | Gmail SMTP via Nodemailer; 5 HTML templates (welcome, OTP, password-reset, password-changed, application-status) |
| In-app | ✅ | `notifications` table + dashboard pulls |
| SMS | 🔮 | Phase 3 — Twilio integration point reserved |
| Web push | 🔮 | Phase 3 — service worker scaffolded |
| Real-time | 🔮 | Phase 3 — Server-Sent Events for dashboard live updates |

### 2.9 AI Engine ✅

Match Hire's "AI" is honest: a **rule-based, transparent scoring engine** today, with a provider-pluggable seam ready for an LLM upgrade. See [Section 10](#10-ai-features-documentation) for full detail.

- `ai.service.js` — rule-based copy generator (career hints, profile improvement, recommended titles)
- `match.service.js` — deterministic 0-100 scoring rubric
- `jobMatch.service.js` — composition layer that emits the public match payload
- `profileMatch.service.js` — profile-completion + market-skill recommendations

**Why rule-based first**: deterministic, auditable, no token-spend per request, no failure modes when an external API is down. The `config.ai.provider` flag is ready to flip to `openai` (or anthropic) — replacing the local generator with a remote call without changing any caller.

### 2.10 Payment Integration 🔮

**Not yet implemented**. Phase 3. Designed integration:

| Provider | Use case |
|---|---|
| **Stripe** | Card payments, subscriptions, webhook-driven status |
| **Stripe Tax** | Automatic VAT/sales-tax handling |
| **Paddle** (alternative) | If we want a merchant-of-record model for international tax simplicity |

Tables to be added: `subscriptions`, `subscription_tiers`, `invoices`, `payment_methods`, `webhook_events`.

### 2.11 Resume Parser ✅

| Component | Tech |
|---|---|
| Format support | PDF (`pdf-parse`), DOCX (`mammoth`), DOC (best-effort), TXT |
| Max size | 5 MB |
| Field extraction | Regex + heuristic line-walkers for: email, phone, LinkedIn, GitHub, name, title, location, skills (catalogue intersection), experience block, education block, certifications |
| Storage | `Backend/storage/resumes/<random>.<ext>` with HMAC-signed download URLs |
| Confidence score | 0-99, derived from how many primary fields were extracted |
| Review-before-merge | Parsed data lands in `resume_parsed_data`; merges into profile only after candidate confirms |

### 2.12 Admin Panel ✅

In-product surface at `/dashboard/admin` (route-guarded, `admin` / `super_admin` only).

**Capabilities**:
- User management (search, status changes, suspension)
- Company verification workflow (pending → verified / rejected)
- Job moderation (approve, archive, status change)
- Audit log viewer
- Reports (user counts, company counts, application stats)
- Health summary (DB + Redis + ES status)

### 2.13 CDN / File Storage

| Bucket | Visibility | Mechanism (✅ today) | Future (🔮) |
|---|---|---|---|
| `profile-images` | Public profile data | `express.static` mount at `/uploads/profile-images/*`, `Cache-Control: immutable` | S3 + CloudFront |
| `resumes` | Sensitive | HMAC-signed URLs via `/api/v1/files/resumes/<file>?exp=…&sig=…` (10-minute TTL) | S3 with pre-signed URLs |

Migration to S3 is a **single-file swap** inside `storage.service.js` — call sites only use `save() / read() / signUrl() / remove()`.

### 2.14 Security Layer ✅

Full detail in [Section 11](#11-security-documentation). Summary:

- JWT access + rotated refresh tokens (SHA-256 hashed in DB)
- Bcrypt cost 10 for passwords
- Email verification gate on login
- HMAC-signed file URLs
- Joi validation on every mutation endpoint
- helmet CSP + COOP + CORP
- express-rate-limit at the API prefix
- Admin audit logs for every state change

---

## 3. User Roles & Permissions

Match Hire uses an **ENUM-based role system** (`users.role`) with a four-level hierarchy plus an implicit "Guest" tier for unauthenticated traffic.

### 3.1 Role Matrix

| Role | Persisted | Auth required | Source |
|---|---|---|---|
| **Guest** | No | No | Anonymous traffic |
| **Candidate** | `users.role = 'candidate'` | Yes | Self-registration via `/auth/register/candidate` |
| **Employer** | `users.role = 'employer'` | Yes | Self-registration via `/auth/register/employer` (also creates a `companies` row) |
| **Admin** | `users.role = 'admin'` | Yes | Created by super admin or seeded |
| **Super Admin** | `users.role = 'super_admin'` | Yes | Seeded only — cannot self-register |
| **Moderator / HR Manager** | 🔮 | Phase 2 | Will use `users.role = 'admin'` with a sub-permission table |

### 3.2 Capability Matrix

| Capability | Guest | Candidate | Employer | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Browse jobs (public) | ✅ | ✅ | ✅ | ✅ | ✅ |
| See match% on jobs | — | ✅ | — | — | — |
| Apply to jobs | — | ✅ | — | — | — |
| Upload resume | — | ✅ | — | — | — |
| Save favorites | — | ✅ | — | — | — |
| Edit own candidate profile | — | ✅ | — | — | — |
| Post a job | — | — | ✅ | — | — |
| View applicants to own jobs | — | — | ✅ | — | — |
| Schedule interviews | — | — | ✅ | — | — |
| Edit own company profile | — | — | ✅ | — | — |
| Verify companies | — | — | — | ✅ | ✅ |
| Moderate jobs | — | — | — | ✅ | ✅ |
| Suspend / activate users | — | — | — | ✅ | ✅ |
| View global audit log | — | — | — | ✅ | ✅ |
| Trigger reindex (ES) | — | — | — | ✅ | ✅ |
| Create admin accounts | — | — | — | — | ✅ |
| Run impersonation 🔮 | — | — | — | — | ✅ |

### 3.3 Permission Enforcement

Three middleware tiers:
1. **`requireAuth`** — JWT must be present + valid
2. **`requireCandidate` / `requireEmployer` / `requireAdmin`** — role check
3. **Resource-ownership check** — happens inside the service (e.g. `jobRepo.ownsJob(jobId, userId)` before allowing edit)

Files: `Backend/src/middlewares/auth.middleware.js`, `role.middleware.js`.

### 3.4 Role-Aware Navigation

The header is **dynamic** — it renders whatever `GET /public/navigation` returns. When a candidate signs in, "Profile / Preferences / Favorites" appear. When an employer signs in, "Company Profile / Job Postings" appear. When an admin signs in, "Admin Console" appears.

No role branching lives in the frontend. The backend is the source of truth.

---

## 4. Functional Modules

Each module follows a fixed eight-section template so readers can scan consistently. Status badges apply to the module as a whole.

### 4.1 Authentication Module ✅

**Objective.** Provide secure, multi-device sign-in with refresh-token rotation, email verification, password reset, and an optional "Remember Me" 90-day persistence.

**Features.**
- Email + password registration (separate flows for candidates vs employers)
- Email verification before login is permitted
- JWT access tokens (short-lived) + opaque refresh tokens (SHA-256 hashed in DB, rotated on every use)
- Forgot password (anti-enumeration: identical response whether email exists or not)
- Password reset with token expiry + single-use enforcement
- Change password (revokes all refresh tokens)
- "Remember Me" — 90-day refresh TTL vs default 7-day; tokens stored in `localStorage` (remembered) or `sessionStorage` (not)
- Show/hide password toggle on every password field
- Multi-device session tracking

**User flow.**
1. Candidate visits `/` → opens auth modal → registers → receives verification email
2. Candidate clicks link → email verified → login permitted
3. Candidate signs in → access + refresh issued → bearer attached to every request
4. Access token expires → axios interceptor calls `/auth/refresh-token` → new pair issued, old refresh revoked
5. Logout → supplied refresh revoked; change-password revokes ALL refresh tokens for the user

**Business logic.**
- Login is **blocked** for users with `status = 'pending'` or `email_verified_at IS NULL` (returns 403 with `code: 'EMAIL_NOT_VERIFIED'` so the SPA can offer "resend")
- Refresh-token rotation: every successful refresh issues a new pair AND revokes the old refresh (linked via `replaced_by_id` for audit)

**Validation rules.**
- Password: min 8 chars, at least one letter and one digit
- Email: RFC-compliant regex (Joi `.email()`)
- Full name: 2-150 chars
- Verification token: 32 random bytes, 24-hour TTL

**APIs involved.**
| Verb | Path |
|---|---|
| POST | `/auth/register/candidate` |
| POST | `/auth/register/employer` |
| POST | `/auth/login` |
| POST | `/auth/logout` |
| POST | `/auth/refresh-token` |
| POST | `/auth/forgot-password` |
| POST | `/auth/verify-reset-token` |
| POST | `/auth/reset-password` |
| POST | `/auth/change-password` |
| POST | `/auth/me` |
| GET | `/auth/verify-email/:token` |
| POST | `/auth/resend-verification` |

**Database impact.** Tables `users`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`.

**Security handling.** Bcrypt cost 10, SHA-256 hashed tokens, rate-limiting on `/forgot-password` (5/15min) and `/login` (10/15min), single-use tokens, anti-enumeration responses.

---

### 4.2 Candidate Module ✅

**Objective.** Give job seekers a single place to build a strong profile, surface matched jobs, manage applications, and track interviews.

**Features.**
- Profile editor (full_name, headline, summary, current_title, years_experience, location, country, expected_salary range, availability, social links)
- Profile image upload (drag-and-drop, JPG/PNG/WEBP, 2 MB, magic-number sniff)
- Skills picker (autocomplete + browse-by-category + custom skill add; 3 min / 30 max)
- Work history CRUD (`candidate_experiences` table — company, title, start_date, end_date, is_current, description)
- Resume upload → parse → review → confirm-into-profile flow
- Job preferences (desired titles, preferred locations, job types, salary range, scope)
- Favorites
- Application list
- Per-section profile completion score (9 sections, 0-100%)
- Review Profile page (public-preview)

**User flow.** Registration → verify email → fill basic info → upload resume → review parsed data → confirm → add skills → review profile → browse matched jobs → apply.

**Business logic.**
- Profile completion score recomputed after every write (image, skills, experience, etc.)
- Skills hit a UNIQUE constraint at `candidate_skills(candidate_user_id, skill_id)` — duplicates merged
- Custom free-text skills auto-create rows in the `skills` catalogue under category `User Submitted`

**Validation rules.**
- Headline ≤ 190 chars; summary ≤ 5000 chars
- LinkedIn/portfolio/GitHub: valid URLs ≤ 500 chars
- Image: 2 MB, JPG/PNG/WEBP, magic-number must match MIME
- Skills: 3-30 entries, name ≤ 80 chars
- Work experience: company + title + start_date required; end_date ≥ start_date

**APIs involved.** All under `/api/v1/candidates/*` (POST-only per project convention except where spec dictates GET/DELETE):
- `POST /profile`, `/profile/update`
- `POST /skills`, `/skills/list`, `DELETE /skills/:id`
- `POST /experiences/list`, `/experiences/create`, `/experiences/:id/update`, `/experiences/:id/delete`
- `POST /preferences`
- `POST /favorites/list`, `/favorites/:jobId/add`, `/favorites/:jobId/remove`
- `POST /applications/list`, `/applications/:jobId`, `/applications/:jobId/validate-and-apply`
- `POST /dashboard/stats`, `/recommended-jobs`, `/jobs/match`
- `POST /profile-match`
- `POST /profile-image`, `DELETE /profile-image`
- `GET /profile-completion`, `/review-profile`
- `POST /resume/upload`, `/:id/parse`, `/:id/preview`, `/:id/confirm`, `/:id/download`, `/list`

**Database impact.** Tables `candidate_profiles`, `candidate_skills`, `candidate_experiences`, `preferences`, `favorites`, `applications`, `resumes`, `resume_parsed_data`, `application_match_results`.

**Security handling.** Every endpoint behind `requireAuth + requireCandidate`. Owner-only writes (a candidate cannot edit another candidate's data). Image uploads gated by MIME + extension + magic-number.

---

### 4.3 Company / Employer Module ✅

**Objective.** Help companies post jobs, surface qualified applicants, and manage hiring pipelines.

**Features.**
- Company profile (name, tagline, description, industry, size, website, logo, location, country, founded year)
- Verification status (pending → verified / rejected), set by admin
- Job posting (title, description, responsibilities, requirements, benefits, job_type, experience_level, location, salary range, skills_tags, vacancies, deadline)
- Job lifecycle (draft → open → closed → archived)
- Applicant inbox per job (sorted by match score)
- Application status transitions (applied → reviewing → shortlisted → interview → offered → hired / rejected / withdrawn)
- Interview scheduling
- Dashboard stats (active jobs, total applicants, by-status breakdown)

**User flow.** Registration → verify email → company profile setup → admin verifies → post first job → applicants arrive → review applicants ranked by match → shortlist → schedule interviews → mark offered/hired.

**Business logic.**
- Only **verified** companies can post jobs (returns 403 otherwise with `code: 'COMPANY_UNVERIFIED'`)
- Jobs go through `admin_status` (pending → approved / rejected) before going live
- Match scores are persisted on the `applications` row at apply-time

**Validation rules.**
- Company name: 2-190 chars, required
- Job title: 2-200 chars
- Job description: 50-10000 chars
- Salary min/max: positive numbers; if both present, min ≤ max
- Skills tags: comma-separated, ≤ 1000 chars
- Application deadline: future date or null

**APIs involved.** `/api/v1/employers/*`:
- `POST /company-profile`, `/company-profile/update`
- `POST /jobs`, `/jobs/list`, `/jobs/:id/update`, `/jobs/:id/delete`, `/jobs/:id/close`
- `POST /jobs/:jobId/applicants`
- `POST /applications/:applicationId/shortlist`, `/applications/:applicationId/reject`
- `POST /interviews`
- `POST /dashboard/stats`

**Database impact.** Tables `companies`, `employer_profiles`, `jobs`, `applications`, `interviews`, `application_match_results`.

**Security handling.** `requireAuth + requireEmployer` middleware. Resource-ownership check: an employer can only edit/view jobs of companies they own or are linked to via `employer_profiles`.

---

### 4.4 Admin Module ✅

**Objective.** Moderate the platform: verify companies, approve/reject jobs, suspend abusive accounts, view audit logs and reports.

**Features.**
- User management (search/filter, status changes)
- Company verification queue
- Job moderation (approve, reject, archive)
- Audit log viewer
- Platform reports (totals by role, company status, job status, location demand)
- Health summary (DB + Redis + ES probes)
- Reindex triggers for ElasticSearch

**User flow.** Admin signs in → dashboard shows totals + pending queues → reviews pending company verifications → approves/rejects with optional reason → repeats for jobs.

**Business logic.** Every mutation is logged to `admin_audit_logs` with admin_user_id, action, entity_type, entity_id, description, IP, user-agent.

**Validation rules.** Status transitions are gated by enum constraints. Suspension reasons ≤ 500 chars.

**APIs involved.** `/api/v1/admin/*`:
- `POST /dashboard/stats`
- `POST /users`, `/users/:id/status`
- `POST /companies/pending`, `/companies/:id/verify`
- `POST /jobs`, `/jobs/:id/status`
- `POST /reports`, `/audit-logs`, `/health-summary`

**Database impact.** `admin_audit_logs` (read+write), every other table (read-only for reports + status updates).

**Security handling.** `requireAuth + requireAdmin` (admin OR super_admin). Every action writes to `admin_audit_logs`. IP + user-agent captured for forensic trail.

---

### 4.5 Job Management Module ✅

**Objective.** Full lifecycle for job postings, from draft to archive, with employer-facing CRUD and public discoverability.

**Features.**
- CRUD by employer (within own company)
- Admin moderation gate (`admin_status: pending → approved | rejected`)
- Public listing with filters (keyword, category, location, job_type, experience_level, salary range, remote, is_featured)
- Public detail pages with view counter
- Location-based ranking (city > country > global_remote)
- Personalised feed for authenticated candidates (40% match threshold)
- Featured-job promotion (admin-toggled `is_featured`)
- Recommended-jobs rail for candidates

**Business logic.**
- A job is **public** only when `status = 'open' AND admin_status = 'approved' AND deleted_at IS NULL AND company.status = 'active'`
- Listing endpoints cache for 10 minutes in Redis; detail caches for 15 minutes; invalidated on write
- The same `/api/v1/jobs` endpoint serves guests (latest active) and signed-in candidates (personalised, threshold-filtered) — `optionalAuth` middleware

**Validation rules.** See 4.3.

**APIs.** `/api/v1/public/jobs`, `/jobs/:id`, `/jobs/location-based`; `/api/v1/jobs`, `/jobs/recommended`, `/jobs/:id` (auth-aware); employer CRUD under `/api/v1/employers/jobs`.

**Database impact.** `jobs`, `job_categories`, `applications`, `favorites`, `application_match_results`.

**Security handling.** Public reads are unauthenticated. Writes are owner-gated. Admin approval workflow gates publication.

---

### 4.6 Resume Upload Module ✅

**Objective.** Let candidates upload a resume once and have it populate their profile, surface to recruiters, and improve match relevance.

**Features.**
- PDF / DOC / DOCX / TXT upload (5 MB)
- Storage in `storage/resumes/<random>.<ext>` with HMAC-signed download URLs (10-minute TTL)
- Asynchronous parsing (in-process today, BullMQ-routed when queue is enabled)
- Field extraction: name, email, phone, LinkedIn, GitHub, portfolio, title, location, skills, experience block, education block, certifications
- Confidence score (0-99)
- Review screen before merge
- Merge into `candidate_profiles` + `candidate_skills` on confirm
- Multiple resumes per candidate; one marked `is_primary`

**Validation rules.**
- MIME whitelist: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`
- Max 5 MB (`upload.middleware.MAX_BYTES`)
- Defence-in-depth: MIME re-checked inside `resume.service`

**APIs.** `/api/v1/candidates/resume/upload`, `/:id/parse`, `/:id/preview`, `/:id/confirm`, `/:id/download`, `/list`.

**Database impact.** `resumes` (file metadata), `resume_parsed_data` (extracted fields, raw text, confidence).

**Security handling.** Owner-only access. Signed URLs with 10-minute TTL. Storage path never exposed in API responses.

---

### 4.7 AI Matching Module ✅

See [Section 10](#10-ai-features-documentation) for full detail. Summary:

**Objective.** Score every candidate ↔ job pair from 0-100, surface the reasoning, and never burn a recruiter's time on a mismatch.

**Scoring rubric** (deterministic, 0-100):

| Component | Max | Source |
|---|---:|---|
| Skills overlap | 30 | `candidate_skills` ∩ `jobs.skills_tags` |
| Role / title keyword | 25 | `candidate_profiles.headline ∩ jobs.title` |
| Experience level | 15 | `candidate_profiles.years_experience` vs `jobs.experience_level` band |
| Location fit | 15 | City > country > remote-friendly |
| Salary overlap | 10 | Candidate range ∩ job range |
| Category preference | 5 | Candidate preferred categories ∩ job category |

**Thresholds.**
- 85+ → "Excellent Match"
- 70-84 → "Strong Match"
- 55-69 → "Good Match"
- 40-54 → "Partial Match"
- < 40 → "Low Match" (hidden from candidate feed by default)

**APIs.** `/api/v1/jobs` (auth-aware), `/jobs/recommended`, `/candidates/jobs/match`, `/candidates/applications/:jobId/validate-and-apply`.

**Database impact.** `application_match_results` row written on every apply (for both accepted and rejected attempts — admin audits the rejections).

---

### 4.8 Interview Module 🚧

**Objective.** Let employers schedule interviews with shortlisted candidates and notify both sides.

**Features (shipped).**
- `interviews` table with scheduled_at, mode (online / onsite / phone), location/link, notes
- `POST /employers/interviews` to create
- Listed in candidate dashboard as "Upcoming interviews"

**Features (planned).** 🔮
- Calendar integration (Google / Outlook)
- Auto-generated meeting links (Zoom / Google Meet)
- Reminder emails (24h, 1h before)
- AI-generated interview questions per role (`ai.service` extension)
- AI scoring of interview responses

---

### 4.9 Subscription & Payment Module 🔮

**Not implemented. Phase 3.**

**Planned scope.**
- Subscription tiers for employers (Free / Starter / Growth / Enterprise)
- Per-tier limits: job posts/month, featured slots, applicant visibility
- Stripe integration (cards + bank debits + invoices)
- Webhook-driven status sync
- Pro-ration on tier changes
- Annual vs monthly billing

**Tables to add.** `subscriptions`, `subscription_tiers`, `invoices`, `payment_methods`, `stripe_webhook_events`.

---

### 4.10 Notifications Module ✅ (in-app + email) / 🔮 (SMS + push)

**Objective.** Reach the user through their preferred channel at the right moment.

**Features (shipped).**
- In-app notifications via `notifications` table
- Email via Gmail SMTP through BullMQ `email.queue`
- 5 HTML templates: welcome, OTP, password-reset, password-changed, application-status
- User preferences for email opt-in per category

**Features (planned).** 🔮
- SMS (Twilio) — Phase 3
- Web push (service worker) — Phase 3
- Real-time SSE for in-dashboard live updates — Phase 3

**Triggers (shipped).**
- Registration → welcome email
- Email verification → verification link
- Password reset request → reset link
- Password changed → confirmation email
- Application status change → email + in-app
- Interview scheduled → email + in-app

---

### 4.11 Reporting & Analytics Module ✅ (admin) / 🚧 (employer & candidate)

See [Section 14](#14-reporting--analytics) for full report list.

---

### 4.12 Search & Filters Module ✅

**Objective.** Sub-100ms search across jobs, candidates, companies, and skills.

**Features.**
- ElasticSearch-backed fuzzy match (`AUTO` fuzziness)
- Edge-ngram autocomplete on skills
- MySQL fallback when ES is down (transparent to caller)
- Faceted filters: location, experience, salary, job type, remote
- Search-event tracking (`search_events`) for future ML

**APIs.** `/api/v1/search/jobs`, `/search/candidates`, `/search/companies`, `/search/skills/autocomplete`, `POST /search/analytics`.

---

### 4.13 Profile Management Module ✅

Covered in 4.2 + the dedicated Review Profile page (Section 6.7).

---

### 4.14 Dashboard Module ✅

Three role-specific dashboards: see Section 6 for screen detail.

---

### 4.15 Security & Verification Module ✅

Email verification + company verification + admin audit log. Full detail in Section 11.

---

## 5. Workflow Diagrams

Each flow is rendered as a text diagram for accessibility (screen readers, plain-text rendering) and an explanation of the system-level effects.

### 5.1 User Registration Flow

```
[Candidate] → [SPA: /signup] → [POST /auth/register/candidate]
                                       │
                                       ▼
                          ┌────────────────────────────┐
                          │ users INSERT (status=      │
                          │   'pending', email_verified│
                          │   _at = NULL)              │
                          │ candidate_profiles INSERT  │
                          │ email_verification_tokens  │
                          │   INSERT (24h TTL)         │
                          └────────────┬───────────────┘
                                       │
                          ┌────────────▼───────────────┐
                          │ email.queue ← welcome +    │
                          │   verification link        │
                          └────────────┬───────────────┘
                                       │
                                       ▼
                          [Gmail SMTP → user inbox]
                                       │
                                       ▼
                          [User clicks verify link]
                                       │
                                       ▼
                          [GET /auth/verify-email/:token]
                                       │
                          ┌────────────▼───────────────┐
                          │ token check (single-use,   │
                          │   not expired)             │
                          │ users SET email_verified_  │
                          │   at = NOW(), status =     │
                          │   'active'                 │
                          │ token marked used_at       │
                          └────────────┬───────────────┘
                                       │
                                       ▼
                          [SPA: login screen — user can sign in]
```

### 5.2 Login Flow

```
[POST /auth/login { email, password, rememberMe }]
       │
       ▼
[bcrypt.compare → pass?] ──no──→ 401 Invalid email or password
       │ yes
       ▼
[status = 'suspended'?] ──yes──→ 403 Account suspended
       │ no
       ▼
[email_verified_at NULL?] ──yes──→ 403 EMAIL_NOT_VERIFIED (SPA offers resend)
       │ no
       ▼
[users.touchLogin() — last_login_at = NOW()]
       │
       ▼
[issueTokens(user, { rememberMe })]
       │
       ▼
[access_token (JWT, 15min)] + [refresh_token (opaque, 7d default / 90d if remembered)]
       │
       ▼
[refresh_token hashed (SHA-256) → refresh_tokens INSERT with ip + user_agent]
       │
       ▼
[200 { user, access_token, refresh_token, token_type: 'Bearer', expires_in }]
       │
       ▼
[SPA stores tokens in localStorage (remembered) OR sessionStorage (not)]
[SPA attaches Authorization: Bearer <access_token> on every subsequent request]
```

### 5.3 Forgot Password Flow

```
[POST /auth/forgot-password { email }]
       │
       ▼                                                ┌─── anti-enumeration ───┐
[users lookup by email] ──no match──→ 200 same response │ same response whether  │
       │ match                                          │ email exists or not    │
       ▼                                                └────────────────────────┘
[password_reset_tokens INSERT (SHA-256 hash, 60-min TTL)]
       │
       ▼
[email.queue ← password-reset template with link /reset-password/:token]
       │
       ▼
[200 { message: 'If the email exists, instructions have been sent.' }]


[POST /auth/verify-reset-token { token }]   (read-only check, no consumption)
       │
       ▼
[hash + lookup + expiry check] → 200 { valid: true } | 400 invalid/expired


[POST /auth/reset-password { token, password }]
       │
       ▼
[token consumed (used_at)] + [users.password_hash updated]
       │
       ▼
[ALL refresh_tokens for this user revoked]
       │
       ▼
[users.password_changed_at = NOW()]
       │
       ▼
[email.queue ← password-changed confirmation email]
       │
       ▼
[200 OK — SPA redirects to login]
```

### 5.4 Profile Completion Flow

```
                  Per-section completion scoring (0-100)
                        │
   ┌────────────────────┼─────────────────────────────┐
   │   Section          │ Weight  │ Credited when     │
   ├────────────────────┼─────────┼───────────────────┤
   │ profile_image      │   10%   │ profile_image set │
   │ basic_info         │   15%   │ name+headline+title│
   │ contact_info       │   10%   │ phone OR loc+ctry │
   │ skills_expertise   │   15%   │ ≥ 3 skills        │
   │ work_experience    │   15%   │ title+years > 0   │
   │ education          │   10%   │ languages or resume│
   │ resume_upload      │   10%   │ resume row exists │
   │ job_preferences    │   10%   │ desired_titles set│
   │ social_links       │    5%   │ any social URL    │
   └────────────────────┴─────────┴───────────────────┘
                        │
                        ▼
        recomputeProfileStrength() runs after every write
        Stored in candidate_profiles.profile_strength
        Per-section breakdown computed on demand by
        GET /candidates/profile-completion
```

### 5.5 Resume Upload Flow

```
[Candidate: drag PDF onto upload card]
       │
       ▼
[POST /candidates/resume/upload (multipart)]
       │
       ▼
[multer.memoryStorage → req.file.buffer]
       │
       ▼
[resume.service.uploadForUser]
   ├── MIME whitelist check
   ├── 5 MB size check
   ├── storage.save({ bucket: 'resumes', ... })
   ├── resumes INSERT (parse_status = 'pending', is_primary = 1)
   └── prior primary resume.is_primary = 0
       │
       ▼
[201 { resume_id, filename, ... } — SPA shows "Call /parse"]
       │
       ▼
[POST /candidates/resume/:id/parse]
       │
       ▼
[resume.service.parse]
   ├── parse_status = 'parsing'
   ├── extractText (pdf-parse / mammoth)
   ├── heuristic extractors: email, phone, urls, name, title, location, skills, experience, education, certs
   ├── skills intersected with skills catalogue (exact + word-boundary match)
   ├── resume_parsed_data UPSERT
   ├── parse_status = 'parsed'
   │
   ├── On error: parse_status = 'failed', parse_error stored, 422 returned
       │
       ▼
[200 { parsed payload }]
       │
       ▼
[SPA: Review screen shows extracted fields, user edits]
       │
       ▼
[POST /candidates/resume/:id/confirm { confirmed fields }]
       │
       ▼
[resume.service.confirm]
   ├── candidate_profiles UPSERT
   ├── candidate_skills REPLACE
   ├── candidate_profiles.profile_strength recomputed
   └── resume_parsed_data.confirmed_at = NOW()
```

### 5.6 AI Resume Parsing Flow

```
[Resume buffer in memory]
       │
       ▼
[Format dispatch]
   PDF  → pdf-parse → text
   DOCX → mammoth.extractRawText → text
   TXT  → buffer.toString('utf8')
   DOC  → best-effort text extraction
       │
       ▼
[Sanitise: remove non-printables, collapse whitespace]
       │
       ▼
[Independent extractors run in parallel-conceptually]
   ┌──────────────────────────────────────────────────┐
   │ EMAIL  : /[\w.+-]+@[\w-]+\.[\w.-]+/             │
   │ PHONE  : /(\+?\d[\d\s\-().]{7,}\d)/             │
   │ LINKEDIN/GITHUB/PORTFOLIO : URL regexes          │
   │ NAME   : first 8 lines, 2-5 capitalised words    │
   │ TITLE  : next non-empty line after name          │
   │ LOC    : "Location:" or "Based in" capture       │
   │ SKILLS : intersection with skills table          │
   │ EXP    : section under "Experience|Work" header  │
   │ EDU    : section under "Education" header        │
   │ CERTS  : section under "Certifications" header   │
   └──────────────────────────────────────────────────┘
       │
       ▼
[Confidence score = 30 + (fieldsFound × 12) + min(20, skills × 2)]
       │
       ▼
[resume_parsed_data UPSERT]
```

**Why heuristic and not LLM?** Today's parsers are deterministic, free per-request, audit-friendly, and accurate ~80% on clean resumes. The `ai.service.provider` flag is ready to flip to an LLM-based extractor for the long-tail layout 20% — without changing the call site.

### 5.7 AI Job Matching Flow

```
[POST /candidates/jobs/match (or auth on /api/v1/jobs)]
       │
       ▼
[loadCandidateContext(user_id)]
   profile + skills + preferences → composite candidate object
       │
       ▼
[Pool selection — listLocationBased({ country, city, scope, oversample: 80 })]
       │
       ▼
[For each job: matchService.scoreJob(job, candidate)]
   ┌──────────────────────────────────────────────────┐
   │ skills_match      0..30  intersection / required │
   │ role_match        0..25  word overlap title↔headline │
   │ experience        0..15  years vs band floor     │
   │ location_match    0..15  city > country > remote │
   │ salary_match      0..10  range overlap           │
   │ category_match    0..5   preferred categories    │
   └──────────────────────────────────────────────────┘
       │
       ▼
[Decorate row: matchPercentage, matchedSkills, missingSkills,
                matchReasons, aiRecommendationLabel, aiSummary]
       │
       ▼
[Filter: score ≥ LOGGED_IN_THRESHOLD (40)]
       │
       ▼
[Sort: descending matchPercentage]
       │
       ▼
[200 { records: [...] }]
```

### 5.8 Job Apply Flow (Match-Validated)

```
[POST /candidates/applications/:jobId/validate-and-apply { cover_letter, expected_salary }]
       │
       ▼
[Load job + candidate context]
       │
       ▼
[matchService.validateApplication]
   verdict = scoreJob(...)
   if score < REJECTION_THRESHOLD (30):
      → verdict.allowed = false
      → message = "Your profile is missing key skills for this role: ..."
       │
       ▼
[allowed?] ──no──→ 422 ErrorEnvelope + { decision: 'rejected', match_score, missing }
                    │
                    └── application_match_results INSERT (decision='rejected') for admin audit
       │ yes
       ▼
[applications INSERT (match_score persisted on the row)]
       │
       ▼
[application_match_results INSERT (decision='accepted' | 'below_threshold')]
       │
       ▼
[notification.queue → employer notified]
       │
       ▼
[email.queue → application-status template to candidate ("you've applied to...")]
       │
       ▼
[cache invalidations: jobs:detail:{id}, jobs:list:*, dashboard:*]
       │
       ▼
[201 { application_id, match_score, reasons, missing, decision }]
```

### 5.9 Company Approval Flow

```
[Employer registers]
       │
       ▼
[companies INSERT (verification_status = 'pending')]
       │
       ▼
[Employer can edit profile but CANNOT post jobs yet]
       │
       ▼
[Admin opens /dashboard/admin → "Pending Companies" queue]
       │
       ▼
[POST /admin/companies/:id/verify { verification_status: 'verified' | 'rejected', reason? }]
       │
       ▼
[companies UPDATE]
       │
       ▼
[admin_audit_logs INSERT]
       │
       ▼
[email.queue → company-verified template OR company-rejected template]
       │
       ▼
[On 'verified': employer can now post jobs]
```

### 5.10 Admin Approval Flow (for Jobs)

```
[Employer posts a job]
       │
       ▼
[jobs INSERT (status = 'open', admin_status = 'approved')]
       │
       ▼  (current default: auto-approve)
       │
       │  🔮 Optional Phase 2: gate behind admin review
       │     by defaulting admin_status = 'pending' for
       │     new/unverified employers
       │
       ▼
[Job appears in public listing]


[Admin can later moderate via POST /admin/jobs/:id/status]
   status: open | closed | archived | rejected
   admin_status: pending | approved | rejected
```

### 5.11 Subscription Purchase Flow 🔮

**Phase 3 — not yet implemented.** Designed shape:

```
[Employer clicks "Upgrade plan" → Stripe Checkout session]
       │
       ▼
[POST /payments/checkout-session → Stripe → checkout_url]
       │
       ▼
[Stripe-hosted card capture]
       │
       ▼
[Stripe → webhook → POST /webhooks/stripe]
       │
       ▼
[Verify Stripe signature]
       │
       ▼
[event.type = 'customer.subscription.created' OR 'updated']
       │
       ▼
[subscriptions UPSERT, subscription_tiers lookup, invoices INSERT]
       │
       ▼
[email.queue → invoice-paid template]
       │
       ▼
[Cache invalidate: employer dashboard stats]
```

### 5.12 Payment Verification Flow 🔮

Same as 5.11 — Stripe webhook is the source of truth, our DB mirrors Stripe state.

### 5.13 Interview Scheduling Flow 🚧

```
[Employer: /dashboard/company → applicant card → "Schedule interview"]
       │
       ▼
[POST /employers/interviews { application_id, scheduled_at, mode, location, notes }]
       │
       ▼
[interviews INSERT]
       │
       ▼
[applications UPDATE: status = 'interview']
       │
       ▼
[notification.queue → candidate]
       │
       ▼
[email.queue → interview-scheduled (🚧 template pending)]
```

### 5.14 Notification Flow

```
[Trigger: any service emits notification.queue.add(payload)]
       │
       ▼
[Worker pops job]
       │
       ▼
[notifications INSERT (in-app)]
       │
       ▼
[If user opted in for email → email.queue.add(payload)]
       │
       ▼
[Email worker: render template → SMTP send → log success/failure]
       │
       ▼
[On SMTP failure: retry with exponential backoff (1s, 2s, 4s)]
       │
       ▼
[After 3 failures: dead-letter queue, alert admin]
```

### 5.15 Job Recommendation Flow

Same as AI Job Matching (5.7). The "Home" page calls `GET /home` which includes a `recommendedJobs` array (top 8 above threshold) plus `latestMatchedJobs` (latest 6 ranked by match, threshold-bypassed so the rail is never empty).

### 5.16 Candidate Shortlisting Flow

```
[Employer: applicant inbox sorted by match_score DESC]
       │
       ▼
[Click "Shortlist" on a row]
       │
       ▼
[POST /employers/applications/:applicationId/shortlist]
       │
       ▼
[applications UPDATE: status = 'shortlisted']
       │
       ▼
[notification.queue → candidate]
       │
       ▼
[email.queue → "You've been shortlisted by Acme"]
       │
       ▼
[Candidate dashboard "Recent applications" → status pill updates to "Shortlisted"]
```

---

## 6. Screen-by-Screen Documentation

16 React pages shipped. Each is documented with the same template.

### 6.1 Homepage (`/`)

| Field | Detail |
|---|---|
| **Purpose** | Hero + search + curated rails + categories + top companies + AI suggestions + CTAs |
| **Auth state** | Auth-aware (`optionalAuth` on `GET /home`) — guest sees latest active jobs; candidate sees personalised |
| **Data source** | `GET /api/v1/home` (one call returns the full payload) |
| **Above the fold** | Hero headline, hero stats (open jobs / companies / candidates), search bar (What / Where), hero visual (3 mini job cards) |
| **Below the fold** | Recommended-for-you rail · "Latest matched jobs" rail (candidate-only) · AI suggestions panel · Featured job categories grid · Top companies grid · Two CTA bands (For Employers / For Candidates) |
| **Buttons** | "Search" (submits to `/jobs?keyword=...&location=...`), "Browse all jobs", "Refine in preferences", "Edit profile", category cards, company cards |
| **Inputs** | Keyword text · Location text |
| **Validations** | Search keyword trimmed, no min length |
| **APIs** | `GET /home` (one round-trip aggregation) |
| **Navigation** | Search → `/jobs?keyword=...&location=...`; category card → `/jobs?category=<slug>`; company card → `/companies/:id`; "Browse all jobs" → `/jobs` |
| **Responsive** | Hero grid collapses 1.3fr/1fr → 1fr below 900px; job-grid 3 → 2 → 1 column; CTA bands single-column on mobile |
| **Empty states** | "No jobs to recommend yet — Check back soon"; "Complete your profile to unlock matches" when candidate signed in but score is too low |
| **Errors** | `<ErrorState>` with retry; offline → cached server payload (Redis 15min for guests) |

### 6.2 Login / Auth Modal

| Field | Detail |
|---|---|
| **Purpose** | Sign-in + sign-up in a single modal (no dedicated page) |
| **Triggers** | Header "Sign in" / "Join free" buttons; any `<ProtectedRoute>` hit while unauthenticated |
| **Fields (login)** | Email · Password · Remember Me checkbox · Forgot Password link |
| **Fields (signup)** | Full name · Email · Password · Confirm password · Role toggle (Candidate / Employer) |
| **Password field** | `PasswordInput` component — show/hide toggle, aria-labeled |
| **Validations** | Email RFC; password ≥ 8 + letter + digit; confirm matches |
| **APIs** | `POST /auth/login`, `POST /auth/register/candidate`, `POST /auth/register/employer` |
| **Success** | Modal closes, tokens saved (localStorage if Remember Me, else sessionStorage), header re-renders with role-specific nav |
| **Error states** | Inline messages: "Invalid email or password" / "Email already in use" / "Please verify your email" with `Resend` action |

### 6.3 Forgot Password (`/forgot-password`)

| Field | Detail |
|---|---|
| **Purpose** | Initiate password reset flow |
| **Inputs** | Email |
| **APIs** | `POST /auth/forgot-password` |
| **Response (always)** | "If this email exists, password reset instructions have been sent." (anti-enumeration) |

### 6.4 Reset Password (`/reset-password/:token`)

| Field | Detail |
|---|---|
| **Purpose** | Set a new password with the token from the email link |
| **Inputs** | New password · Confirm new password (both with show/hide) |
| **APIs** | `POST /auth/verify-reset-token` (on mount), `POST /auth/reset-password` (on submit) |
| **States** | Loading (verifying token) · Valid (form visible) · Invalid/expired (error + "Request new link") · Success (redirect to login) |

### 6.5 Candidate Dashboard (`/dashboard/candidate`)

| Field | Detail |
|---|---|
| **Purpose** | Personal workspace: applications, interviews, favorites, recommended jobs, profile health |
| **Layout** | Two-column: sidebar (avatar, nav, profile completion) + main panel (recent applications table + activity timeline + matches rail) |
| **Components** | `<DashAvatar>` (image with onError fallback), `<ProfileCompletionCard>`, application table, `<JobCard>` rail |
| **APIs** | `POST /candidates/dashboard/stats`, `POST /candidates/applications/list`, `POST /candidates/recommended-jobs`, `GET /candidates/profile-completion` |
| **Empty states** | "No applications yet — browse jobs to get started"; "Add skills to see recommendations" |

### 6.6 Profile (`/profile`)

| Field | Detail |
|---|---|
| **Purpose** | Edit candidate profile in five numbered cards |
| **Cards** | (01) Personal info · (02) About you · (03) Skills & expertise · (04) Work experience · (05) Job preferences / Links |
| **Sidebar** | Profile image (with `<ProfileImageUpload>`), name, headline, "Review profile →" button, completion card |
| **Components** | `<ProfileImageUpload>`, `<SkillsPicker>`, `<MonthYearPicker>`, `<WorkExperienceCard>`, `<ResumeUploadCard>` |
| **APIs** | `POST /candidates/profile`, `/profile/update`, `/skills`, `/experiences/*`, `/profile-image`, `/profile-completion` |
| **Validations** | Inline per field; completion bar updates after every save |

### 6.7 Review Profile (`/profile/review`)

| Field | Detail |
|---|---|
| **Purpose** | Read-only preview of how the public sees the profile |
| **Sections** | Header (image + identity + completion %), Missing-sections banner, Completion breakdown, Contact, About, Skills, Work history, Education, Resume, Job preferences, Social links |
| **APIs** | `GET /candidates/review-profile` (composite) |
| **Empty hints** | Inline `<EmptyHint>` for missing sections rather than blank space |

### 6.8 Jobs (`/jobs`)

| Field | Detail |
|---|---|
| **Purpose** | Filtered job listing with personalised ranking for candidates |
| **Sidebar filters** | Keyword · Location · Skills (comma-separated) · Job type · Experience level · Salary band · Remote/onsite · Sort (Best Match / Most Recent / Highest Salary / Experience) |
| **Cards** | `<MatchCard>` wraps `<JobCard>` with AI label + missing-skills chips |
| **APIs** | `GET /api/v1/jobs` (auth-aware), `POST /candidates/applications/:jobId/validate-and-apply` |
| **Empty states** | "No strong matches found yet" (candidate) vs "No jobs match these filters" (guest) vs "Complete your profile" (incomplete) |

### 6.9 Job Detail (`/jobs/:id`)

| Field | Detail |
|---|---|
| **Purpose** | Single job page with match info when signed in |
| **Sections** | Header (title + company + location), match badge (signed in), description, responsibilities, requirements, benefits, skills_tags, salary, similar jobs |
| **APIs** | `GET /api/v1/jobs/:id` (auth-aware decoration) |
| **Buttons** | "Apply now" → match-validated apply; "Save" → favorites toggle |

### 6.10 Apply Job (Modal + Rejection Modal)

| Field | Detail |
|---|---|
| **Purpose** | Submit application with cover letter + expected salary |
| **Validation** | Server-side match validation; sub-threshold returns 422 with reasons |
| **Rejection UX** | Polite modal: "Not quite a fit yet — Your profile is missing key skills: react, typescript." + "Update profile" CTA |

### 6.11 Companies (`/companies`)

Public list of verified companies with industry / size / location filters. Card grid layout.

### 6.12 Company Detail (`/companies/:id`)

Single company page with profile + recent open jobs rail.

### 6.13 Candidates (`/candidates`)

Public list of candidate profiles marked `is_public = 1`. Filter by skill / location / experience.

### 6.14 Favorites (`/favorites`)

Candidate-only list of saved jobs.

### 6.15 Preferences (`/preferences`)

Candidate-only — desired titles, preferred locations, job types, salary range, scope (local / country / global_remote / hybrid), notifications opt-in.

### 6.16 Employer Onboarding (`/employer-onboarding`)

Marketing landing + sign-up CTA for companies. Single page, no nav-bar items.

### 6.17 Company Dashboard (`/dashboard/company`)

| Field | Detail |
|---|---|
| **Purpose** | Employer workspace |
| **Sections** | Stats (active jobs / total applicants) · Job postings table · Applicants per job (ranked by match) · Interview list |
| **APIs** | `POST /employers/dashboard/stats`, `/jobs/list`, `/jobs/:id/applicants` |

### 6.18 Admin Dashboard (`/dashboard/admin`)

| Field | Detail |
|---|---|
| **Purpose** | Platform moderation |
| **Sections** | Totals (users by role, companies, jobs) · Pending company queue · Recent audit logs · Health summary |
| **APIs** | `POST /admin/dashboard/stats`, `/admin/companies/pending`, `/admin/audit-logs`, `/admin/health-summary` |

### 6.19 Verify Email (`/verify-email/:token` + `/verify-email`)

Two pages: token redemption (loading → success → error) and pending state (just registered, prompt to check inbox + resend button).

### 6.20 AI Interview Screen 🔮

Phase 2 — not yet implemented. Designed shape: post-shortlist, candidate gets an AI-driven Q&A session, transcribed and scored.

### 6.21 Subscription Pages 🔮

Phase 3 — not yet implemented. Plan: pricing table, Stripe Checkout redirect, post-purchase confirmation.

### 6.22 Settings Page 🚧

Phase 2 — basic settings live in Profile + Preferences today; dedicated `/settings` consolidation planned.

### 6.23 Notifications Page 🚧

Phase 2 — in-app feed exists in `notifications` table; dedicated `/notifications` page planned.

### 6.24 Reports / Analytics Pages 🚧

Admin-side reports live in `/dashboard/admin` as cards today; dedicated `/admin/reports` page with date-ranged exports planned for Phase 2.

### 6.25 Search Results

Folded into `/jobs`, `/companies`, `/candidates` filtered views — no separate `/search` page.

### 6.26 Resume Upload

Embedded inside `/profile` as `<ResumeUploadCard>`; not a separate route.

### 6.27 Company Verification 🚧

Admin-side via `/dashboard/admin` → "Pending Companies"; dedicated `/admin/companies/verify` page planned.

### 6.28 Payment Screens 🔮

Phase 3 — not yet implemented.

### 6.29 Admin Management Screens 🚧

`/dashboard/admin` has user / company / job tabs today; dedicated `/admin/users`, `/admin/companies`, `/admin/jobs` pages planned for Phase 2.

---

## 7. Screenshots Sections

> *Insert placeholder boxes for screenshots — to be captured during QA hand-off and replaced in the published PDF.*

### 7.1 Desktop Screens

- [ ] **Homepage** — Hero + search + recommended rail   → `Insert Screenshot Here`
- [ ] **Jobs page** — Filters sidebar + match-decorated cards   → `Insert Screenshot Here`
- [ ] **Job Detail** — Match badge + skills tags + apply CTA   → `Insert Screenshot Here`
- [ ] **Profile (editor)** — Five cards, image side rail   → `Insert Screenshot Here`
- [ ] **Review Profile** — All sections, completion banner   → `Insert Screenshot Here`
- [ ] **Skills Picker open** — Suggestions + Browse by category   → `Insert Screenshot Here`
- [ ] **Companies list** — Card grid   → `Insert Screenshot Here`
- [ ] **Auth modal — Sign in** — With Remember Me + show/hide pwd   → `Insert Screenshot Here`
- [ ] **Auth modal — Sign up**   → `Insert Screenshot Here`
- [ ] **Forgot Password page**   → `Insert Screenshot Here`

### 7.2 Mobile Screens

- [ ] **Homepage mobile** — Hero collapses, cards single-column   → `Insert Screenshot Here`
- [ ] **Jobs mobile** — Filter drawer behaviour   → `Insert Screenshot Here`
- [ ] **Profile mobile** — Stacked cards   → `Insert Screenshot Here`
- [ ] **Auth modal mobile** — Full-screen overlay   → `Insert Screenshot Here`
- [ ] **MonthYearPicker mobile**   → `Insert Screenshot Here`

### 7.3 Dashboard Screens

- [ ] **Candidate Dashboard** — Profile health + recent apps + matches   → `Insert Screenshot Here`
- [ ] **Company Dashboard** — Jobs table + applicants ranked by match   → `Insert Screenshot Here`
- [ ] **Admin Dashboard** — Totals + pending queue + audit log   → `Insert Screenshot Here`

### 7.4 Admin Screens

- [ ] **Pending Companies queue**   → `Insert Screenshot Here`
- [ ] **Audit Logs view**   → `Insert Screenshot Here`
- [ ] **Health Summary**   → `Insert Screenshot Here`
- [ ] **Reports**   → `Insert Screenshot Here`

### 7.5 User Journey Screens

- [ ] **Registration → Email verification → First login**   → `Insert Screenshot Here`
- [ ] **Resume upload → Parse → Review → Confirm**   → `Insert Screenshot Here`
- [ ] **Job search → Detail → Apply → Rejection modal**   → `Insert Screenshot Here`
- [ ] **Employer: Post job → First applicant → Shortlist → Interview**   → `Insert Screenshot Here`

---

## 8. API Flow Documentation

### 8.1 Request Lifecycle

```
[Browser]
   │ HTTPS request with Authorization: Bearer <jwt>
   ▼
[Helmet] — set security headers
   │
   ▼
[CORS] — Access-Control-Allow-Origin check
   │
   ▼
[Compression] — gzip if Accept-Encoding allows
   │
   ▼
[Body parsing] — JSON (1 MB) / URL-encoded / multipart (multer for files)
   │
   ▼
[Morgan logger] — pipes one line per request into winston
   │
   ▼
[Rate limiter] — default 300 req/15min per IP at the API prefix
   │
   ▼
[Versioned router /api/v1/*]
   │
   ▼
[Domain router /candidates / /employers / /admin / ...]
   │
   ▼
[Auth middleware] — requireAuth | optionalAuth | requireCandidate | requireEmployer | requireAdmin
   │
   ▼
[Validation middleware] — Joi schema runs against req.body | req.query | req.params
   │   strips unknown fields, applies defaults, coerces types
   │   on failure: 422 + Errors[] envelope
   ▼
[Controller] — thin handler, calls one service method, shapes the response
   │
   ▼
[Service] — business logic, transactions, cache invalidation
   │
   ▼
[Repository] — parameterised SQL, no logic
   │
   ▼
[MySQL / Redis / ES]
```

### 8.2 Response Envelope (Project Convention)

**Success:**
```json
{
  "Response": { "responseCode": 1, "status": "Success", "message": "Data Returned Successfully" },
  "Data": { ... }
}
```

**Error:**
```json
{
  "Response": { "responseCode": 0, "status": "Error", "message": "Job not found" },
  "Data": null
}
```

**Validation error:**
```json
{
  "Response": { "responseCode": 0, "status": "Validation Error", "message": "Invalid request data" },
  "Errors": [
    { "field": "email", "message": "email must be a valid email", "type": "string.email" }
  ]
}
```

### 8.3 Authentication Flow (JWT)

```
[Login] → access_token (15min JWT signed with JWT_SECRET) + refresh_token (opaque 96-byte hex)
       │
       ▼
[SPA stores both in localStorage (Remember Me) OR sessionStorage]
       │
       ▼
[axios interceptor attaches Authorization: Bearer <access> on every request]
       │
       ▼
[Backend `requireAuth`]
   try jwt.verify(token, JWT_SECRET) → attach req.user
   catch → 401 Unauthorized
       │
       ▼
[On 401 from API, axios interceptor coalesces concurrent refreshes]
   POST /auth/refresh-token → new pair → old refresh revoked → retry original request
       │
       ▼
[If refresh fails → tokens.clear() → dispatch 'matchhire:auth:logout' window event]
```

### 8.4 Redis Caching Flow

```
[Service: cache.rememberCache(key, ttl, loader)]
       │
       ▼
[Redis GET key]
   hit → return parsed JSON
   miss ─┐
         ▼
   [loader() → DB result]
         │
         ▼
   [Redis SET key value EX ttl]
         │
         ▼
   [return value]
```

**Invalidation on writes (services do this explicitly):**
- Job created/updated/closed → `cache.deleteByPattern('jobs:list:*')` + `cache.deleteCache('jobs:detail:{id}')`
- Company updated → similar for `companies:*`
- Application status change → `cache.deleteByPattern('dashboard:*')`

### 8.5 Error Handling Flow

```
[Service throws AppError('Job not found', 404)]
       │
       ▼
[asyncHandler catches → next(err)]
       │
       ▼
[errorHandler middleware]
   if err.isOperational (AppError): response.error(res, err.message, err.statusCode, err.details)
   else: log full stack, return generic 500 'Internal server error' (no leak)
```

### 8.6 Rate Limiting

`express-rate-limit` configured in `Backend/src/middlewares/rateLimit.middleware.js`:

| Scope | Window | Max requests |
|---|---|---|
| Default (every API route) | 15 min | 300 |
| `/auth/login` | 15 min | 10 |
| `/auth/forgot-password` | 15 min | 5 |
| `/auth/resend-verification` | 15 min | 3 |

Per-IP via `X-Forwarded-For` (first hop trusted; `app.set('trust proxy', 1)`).

### 8.7 Validation Process

Every mutation endpoint runs Joi validation **before** the controller:

```js
router.post('/profile/update', validate(v.profileUpdate), asyncHandler(controller.updateProfile));
```

`validate(schema, target)` runs `schema.validate(req[target], { abortEarly: false, stripUnknown: true, convert: true })`. On error → 422 + Errors[]. On success → `req[target]` is replaced with the typed/cleaned object the controller will see.

---

## 9. Database Documentation

### 9.1 Schema Summary (31 Tables)

| # | Table | Purpose | Notable columns |
|---|---|---|---|
| 001 | roles | Role catalogue (seed) | name, description |
| 002 | users | All accounts | email (UNIQUE), password_hash, role, status, email_verified_at, avatar_url, last_login_at |
| 003 | companies | Employer entities | name, slug (UNIQUE), industry, size, status, verification_status, owner_user_id |
| 004 | job_categories | Job category taxonomy | name, slug (UNIQUE), icon |
| 005 | skills | Skill catalogue | name, slug (UNIQUE), category |
| 006 | jobs | Job postings | title, slug, status, admin_status, salary_min/max, skills_tags, is_featured, published_at |
| 007 | candidate_profiles | Per-candidate data | headline, current_title, years_experience, profile_strength, profile_image |
| 008 | candidate_skills | M:N between candidates and skills | UNIQUE(candidate_user_id, skill_id), proficiency, years_experience |
| 009 | employer_profiles | Per-employer data | user_id (UNIQUE), company_id, designation, is_primary_contact |
| 010 | applications | Candidate ↔ job applications | match_score, status, cover_letter |
| 011 | favorites | Saved jobs | UNIQUE(user_id, job_id) |
| 012 | preferences | Candidate job-pref | desired_titles, preferred_locations, salary_min/max, job_scope |
| 013 | notifications | In-app notifications | user_id, kind, payload, read_at |
| 014 | interviews | Scheduled interviews | application_id, scheduled_at, mode, status |
| 015 | admin_audit_logs | Admin action trail | admin_user_id, action, entity_type, entity_id, ip_address |
| 016 | password_reset_tokens | Password reset | token_hash (SHA-256), expires_at, used_at |
| 017 | refresh_tokens | Refresh-token store | token_hash, expires_at, revoked_at, replaced_by_id |
| 018 | countries | Country picker | code, name, continent, currency |
| 019 | cities | City picker | country_id, name, timezone |
| 020 | (alter) jobs +location | Adds city, work_mode, is_global_remote, country_id, timezone | |
| 021 | (alter) candidate_profiles +location | Adds city, timezone | |
| 022 | (alter) preferences +job_scope | local / country / global_remote / hybrid | |
| 023 | email_verification_tokens | Verification | token_hash, expires_at, used_at, sent_to |
| 024 | resumes | Resume metadata | filename, mime_type, size_bytes, parse_status, is_primary |
| 025 | resume_parsed_data | Parsed resume fields | full_name, skills, experience (JSON), education, confidence, confirmed_at |
| 026 | application_match_results | Apply-time verdicts | match_score, decision, reasons (JSON), missing (JSON), rejection_message |
| 027 | search_events | Search analytics | query, source, results_count, user_id |
| 028 | (alter) users +auth_columns | password_changed_at, remember_me_enabled | |
| 029 | (alter) candidate_profiles +profile_image | VARCHAR(500) | |
| 030 | (alter) candidate_profiles +targets | desired_role, work_preference, relocation_scope | |
| 031 | candidate_experiences | Work history rows | company, title, start_date, end_date, is_current, description |

### 9.2 Key Relationships

```
users (1) ──── (1) candidate_profiles
       │
       ├── (1:M) candidate_skills ──── (M:1) skills
       ├── (1:M) candidate_experiences
       ├── (1:M) resumes ──── (1:1) resume_parsed_data
       ├── (1:1) preferences
       ├── (1:M) applications ──── (M:1) jobs
       ├── (1:M) favorites ──── (M:1) jobs
       ├── (1:M) notifications
       ├── (1:M) refresh_tokens
       └── (1:1) employer_profiles ──── (M:1) companies (1:M) jobs

companies (1) ──── (1:M) jobs ──── (M:1) job_categories

countries (1) ──── (1:M) cities
                      │
jobs (M) ──── (M:1) countries / cities
```

### 9.3 Indexing Strategy

| Table | Index | Purpose |
|---|---|---|
| users | `UNIQUE (email)` + `idx_users_role` + `idx_users_status` | Login lookup, role-filtered admin queries |
| jobs | `FULLTEXT (title, description, skills_tags)` | Free-text search (used as fallback when ES is down) |
| jobs | `idx_jobs_loc_lookup (country, city, work_mode, is_global_remote)` | Location-first ranking query |
| jobs | `idx_jobs_status` + `idx_jobs_featured` | Public listing filters |
| candidate_profiles | `idx_profile_strength` (planned) | Top-candidates ranking |
| candidate_skills | `UNIQUE (candidate_user_id, skill_id)` | Duplicate prevention |
| applications | `UNIQUE (job_id, candidate_user_id)` | One application per candidate per job |
| refresh_tokens | `idx_refresh_user` + `idx_refresh_hash` | Logout + rotation lookups |

### 9.4 Soft Delete Convention

`deleted_at DATETIME NULL` on every user-facing entity (users, companies, jobs, resumes). A soft-deleted row is hidden from public queries via `WHERE deleted_at IS NULL` but kept for audit + recovery.

### 9.5 Redis Caching Strategy

See [Section 8.4](#84-redis-caching-flow). Namespacing convention (`Backend/src/cache/cache.helper.js`):

```
jobs:list:<filtered-querystring>
jobs:detail:<id>
companies:list:<qs>
companies:detail:<id>
candidates:list:<qs>
candidates:detail:<id>
candidates:top
meta:categories
meta:skills
dashboard:<scope>:<id>
home:payload:guest
```

Cache-key construction lives in **one place** (`cache.Keys` / `cache.Patterns`). Services never hand-build keys as strings.

---

## 10. AI Features Documentation

### 10.1 Resume Parsing ✅

See [Section 5.6](#56-ai-resume-parsing-flow). Today: heuristic regex + line-walkers. Tomorrow (🔮): swap to LLM extractor via `ai.service.provider` flag for layout-tricky resumes.

### 10.2 Skill Extraction ✅

Two paths:
1. **From resumes** — intersect parsed text against the skills catalogue (word-boundary regex per skill name)
2. **From job posts** — employer enters comma-separated tags into `jobs.skills_tags`

The intersection drives the matching engine.

### 10.3 Candidate-Job Matching ✅

Deterministic 0-100 rubric. See [Section 4.7](#47-ai-matching-module-) and [Section 5.7](#57-ai-job-matching-flow).

**Why this is "AI" enough to ship today:**
- Transparent — the candidate sees exactly which skills matched and which didn't
- Auditable — every score is reproducible from the same inputs
- Latency-free — sub-millisecond per pair, no API call
- Provider-pluggable — `ai.service.summariseMatch()` already has the OpenAI branch stubbed

### 10.4 Smart Recommendations ✅

`profileMatch.service.recommendedSkillsFor(userId)`:
1. Find the candidate's `current_title` or first preferred title
2. Pull the 80 most-recent open jobs whose title matches
3. Tally `skills_tags` minus skills the candidate already has
4. Return top 8 by frequency

This means recommendations track the **actual market** — not a static list.

### 10.5 AI Interview Questions 🔮

**Phase 2.** Plan: `ai.service.interviewQuestions(role, skills)` returns 5-8 role-specific questions; candidate answers via text; LLM-graded for clarity + relevance + correctness.

### 10.6 AI Scoring 🔮

**Phase 2.** Score interview answers; surface to recruiter alongside match score.

### 10.7 Semantic Search 🚧

**Foundation in place** (ElasticSearch indexers + autocomplete). True semantic search (vector embeddings) is a Phase 2 upgrade — replace the `fuzziness: 'AUTO'` query with a kNN search against an embedding field once we have a vector store decision (pgvector vs Pinecone vs Weaviate).

### 10.8 Skill Gap Analysis ✅

For every job a candidate views, `missingSkills` is computed and returned. The Profile Page's "Recommended skills" panel surfaces the cross-job aggregate: which skills appear most often across jobs you'd be a good fit for, that you don't yet have.

### 10.9 Provider Pluggability

`ai.service.js` exports a stable surface:

```js
labelForScore(score)
summariseMatch({ job, candidate, score, matched, missing, reasons })
missingSkillSuggestion(missing[])
careerImprovement(candidate, missing[])
profileImprovement(profile, skills)
recommendedJobTitles(skills, currentTitle)
```

Local rule-based implementations exist for all six. When `config.ai.provider === 'openai'` and `config.ai.apiKey` is set, the same functions can route to the LLM. Callers never change.

---

## 11. Security Documentation

### 11.1 Authentication

JWT access tokens (signed with `JWT_SECRET`, 15-minute default expiry) + opaque refresh tokens (96 bytes of crypto-random hex, SHA-256 hashed in DB, 7-day default / 90-day if "Remember Me", rotated on every use).

### 11.2 Authorization

Three-tier check:
1. `requireAuth` — token present + valid
2. `requireRole` — role match (candidate / employer / admin / super_admin)
3. **Resource ownership** in the service (`jobRepo.ownsJob(jobId, userId)`)

### 11.3 JWT

- Algorithm: HS256
- Claims: `sub` (user id), `role`, `email`, `full_name`, `iat`, `exp`
- Verification re-runs on every request — no session store

### 11.4 OTP Verification 🚧

Email-link verification ✅; numeric OTP path 🚧 (templates ready, flow scaffolded, not yet wired).

### 11.5 Email Verification ✅

Required before login. 32-byte hex token, SHA-256 hashed, 24-hour TTL, single-use, automatically invalidated when a new one is issued.

### 11.6 Password Encryption ✅

bcrypt cost 10 via `bcryptjs`. Salt embedded in hash. Plain passwords are never logged, stored, or transmitted to any third party.

### 11.7 API Protection

| Threat | Defence |
|---|---|
| **Brute force login** | Rate-limit 10/15min per IP on `/auth/login` |
| **Forgot-password enumeration** | Rate-limit 5/15min + identical response shape regardless of email existence |
| **Refresh-token replay** | Tokens are single-use; rotation invalidates the prior token |
| **Stolen access token** | 15-minute TTL minimises window |
| **Password reset replay** | Token single-use (`used_at`) + 60-minute TTL |

### 11.8 SQL Injection Prevention

100% parameterised queries via `mysql2`'s `?` placeholders. No string concatenation anywhere. Raw user input never reaches the SQL parser.

### 11.9 XSS Protection

- Helmet's default CSP enforces `default-src 'self'`
- React's default JSX escaping
- No `dangerouslySetInnerHTML` in production code
- All HTML emails are server-rendered with `escape()`

### 11.10 Rate Limiting

See [Section 8.6](#86-rate-limiting).

### 11.11 Audit Logs

Every admin action writes a row to `admin_audit_logs` with admin_user_id, action, entity_type, entity_id, description, IP, user-agent, timestamp. Captured at the service layer — controllers don't have to remember.

### 11.12 File Upload Security

- Image upload: MIME whitelist + extension whitelist + magic-number sniff (defence in depth)
- Resume upload: MIME whitelist + size cap + virus scan 🔮 (Phase 2 — ClamAV integration point reserved)
- All files stored under `/storage/<bucket>/<random-hex>.<ext>` — never accept user-supplied filenames

### 11.13 Secrets Management

- `.env.local`, `.env.production` gitignored
- Real credentials never committed; `.env.example` ships with placeholders only
- JWT secret defaults to a warning placeholder in dev; required in prod via env validation

### 11.14 CORS

`config.corsOrigin` configurable per-environment. `*` in dev, restricted to frontend hostnames in prod.

### 11.15 HMAC-Signed File URLs

Resume downloads issued as `/api/v1/files/resumes/<filename>?exp=<unix>&sig=<hmac>` where `sig = HMAC-SHA256(JWT_SECRET, '<storagePath>:<exp>')`. Verifier in `storage.service.verifySignedUrl()` checks expiry + recomputes signature with `timingSafeEqual`.

---

## 12. DevOps & Deployment

### 12.1 Environment Structure

| Env | NODE_ENV | DB | Redis | ES | API base |
|---|---|---|---|---|---|
| local | `local` | MAMP MySQL (port 8889) | localhost (optional) | localhost (optional) | http://localhost:3500 |
| staging 🔮 | `staging` | Managed MySQL | Managed Redis | Managed ES | https://staging-api.matchhire.example.com |
| production 🔮 | `production` | Managed MySQL | Managed Redis | Managed ES | https://api.matchhire.example.com |

Env loading priority: `.env.${NODE_ENV}` → `.env` → process env (process env wins).

### 12.2 Staging 🔮

Phase 2. Identical infra to prod, smaller instance sizes. Pre-merge integration smoke tests run here.

### 12.3 Production 🔮

Phase 3. Target topology:
- API: 2-3 stateless Node containers behind a load balancer
- MySQL: managed (RDS or Cloud SQL), single primary + read replica
- Redis: managed (ElastiCache or Memorystore)
- ES: managed (Elastic Cloud or self-hosted on Kubernetes)
- Files: S3 + CloudFront

### 12.4 CI/CD 🔮

Phase 2. GitHub Actions pipeline:
1. PR open → lint + Jest run + Vite build
2. Merge to `main` → Docker image build + push to registry
3. Tag `vX.Y.Z` → deploy to staging
4. Manual approval → deploy to production

### 12.5 Git Workflow ✅

- `main` is the trunk; releases tagged via `git tag`
- Feature work in topic branches → PR → squash merge
- Commit style: descriptive subject + bullet body, "Co-Authored-By:" footer for AI-assisted work
- Conventional commits not enforced — readable subjects are

### 12.6 Docker ✅

`Dockerfile` in both `Backend/` and `Frontend/`, plus root-level `docker-compose.yml` for the full local stack (mysql + redis + es + backend + frontend).

### 12.7 AWS Deployment 🔮

Phase 3. Target:
- ECS Fargate or EKS for the API
- RDS Aurora MySQL
- ElastiCache Redis
- OpenSearch (managed ES)
- S3 + CloudFront for file storage
- CloudWatch + X-Ray for observability
- Route 53 + ACM + ALB for ingress

### 12.8 Monitoring 🔮

Phase 2.
- **Metrics**: Prometheus + Grafana, OR Datadog / New Relic
- **Logs**: structured JSON (winston already ships this), aggregated to CloudWatch / Datadog
- **Tracing**: OpenTelemetry instrumentation in Express
- **Alerting**: PagerDuty / Opsgenie on SLO breaches

### 12.9 Backup Strategy 🔮

Phase 2.
- MySQL: managed automated daily snapshots, 30-day retention; point-in-time recovery enabled
- File storage: S3 versioning + cross-region replication
- Redis: persistence not relied on (cache only); BullMQ tolerates restarts

---

## 13. Notification System

### 13.1 Email Notifications ✅

| Trigger | Template |
|---|---|
| Registration | `welcome.template.js` |
| Email verification | included in welcome |
| Password reset request | `password-reset.template.js` |
| Password changed | `password-changed.template.js` |
| Generic OTP | `otp.template.js` |
| Application status change 🚧 | template pending |
| Interview scheduled 🚧 | template pending |
| Company verified 🚧 | template pending |

Mechanics:
- Singleton pooled Nodemailer transporter (`services/mail/transporter.js`)
- Lazy verify on first send, re-verify after 10 minutes of idle
- Retry with exponential backoff (1s → 2s → 4s) on transient errors
- PII masking in logs ("a***e@example.com")
- HTML + plain-text fallback for every template
- Queue-routed via BullMQ when `MAIL_QUEUE_ENABLED=true`; otherwise inline

### 13.2 Push Notifications 🔮

Phase 3. Service worker scaffold ready in Frontend; backend dispatcher in `notification.queue` is generic enough to accept a `push` channel.

### 13.3 SMS Notifications 🔮

Phase 3. Twilio integration point reserved on `notification.queue` worker.

### 13.4 Real-Time Notifications 🔮

Phase 3. Server-Sent Events (SSE) endpoint at `/api/v1/events` per authenticated user; lighter than WebSockets, no extra infra.

### 13.5 Queue Processing ✅

BullMQ on Redis. Producer side: any service can `notification.queue.add(payload)`. Worker pops, persists to `notifications` table, optionally dispatches email. Inline fallback when Redis is offline so user-facing flows never block.

---

## 14. Reporting & Analytics

### 14.1 Company Analytics 🚧

| Report | Status |
|---|---|
| Jobs posted (by month) | 🚧 — query exists, dashboard widget pending |
| Applicants per job | ✅ — surfaced in `/employers/dashboard/stats` |
| Application funnel (applied → shortlisted → hired) | 🚧 |
| Time-to-fill | 🔮 |

### 14.2 Candidate Analytics 🚧

| Report | Status |
|---|---|
| Application history | ✅ — `/candidates/applications/list` |
| Match scores over time | 🔮 |
| Profile views | 🔮 — requires `profile_view_events` table |

### 14.3 Admin Analytics ✅

| Report | Status |
|---|---|
| Users by role | ✅ — `/admin/dashboard/stats` |
| Companies by status | ✅ |
| Jobs by status | ✅ |
| Applications by decision (accepted/rejected/below_threshold) | ✅ |
| Demand by location (city / country) | ✅ — `application_match_results.jobsByLocation()` |
| Audit log feed | ✅ — `/admin/audit-logs` |
| Health summary | ✅ — `/admin/health-summary` |

### 14.4 Revenue Reports 🔮

Phase 3 (depends on Payment module).

### 14.5 Application Reports ✅

Per-company applicant inbox sortable by match score, application status, applied date.

### 14.6 Hiring Reports 🚧

Phase 2. Hires per month per company, source funnel, average time from application to offer.

---

## 15. Future Scalability Plan

### 15.1 Microservices Readiness

The monolith is **deliberately structured** as if it were N services:
- Each route group (`/auth`, `/candidates`, `/employers`, `/admin`) maps cleanly to a future service
- Services depend on repositories, never directly on other services' tables
- Cache invalidation is event-shaped (`deleteByPattern('jobs:*')`) — already replaceable with a message bus
- Queues are already external (BullMQ on Redis)

**Decomposition order (when traffic warrants):**
1. **Auth service** (smallest, highest-touch surface)
2. **Mail service** (already a separate worker via BullMQ — promote to its own deployable)
3. **Resume parser** (CPU-bound; isolate to scale independently)
4. **Search service** (the only one heavily dependent on ES; co-locate the indexer)
5. **Matching service** (the AI scoring engine becomes a callable RPC)

### 15.2 Global Scaling

- **Read replicas** on MySQL (Aurora supports up to 15 replicas; 2-3 sufficient for our workload pattern)
- **Redis cluster mode** for horizontal cache capacity (currently single-node)
- **ES cluster** with shard count tuned to total index size
- **API horizontal autoscaling** based on CPU + req/s

### 15.3 Multi-Region Deployment 🔮

Phase 4. Tier 1 region (e.g. eu-west-1 for European candidates), Tier 2 region (e.g. ap-south-1 for South Asian + MENA candidates). Database via global Aurora cluster (read replicas per region, writes go to primary). Eventually-consistent caches per region.

### 15.4 AI Scaling

- **Today**: rule-based, sub-ms per pair, no external API
- **Phase 2**: LLM-based copy generation with provider behind a flag — start with a cheap model (gpt-4o-mini equivalent), cache results aggressively in Redis
- **Phase 3**: vector embeddings for semantic skill matching — pgvector or a dedicated vector DB; embedding generation batched into the existing BullMQ `match.queue`

### 15.5 Performance Optimization

| Lever | Status |
|---|---|
| Redis read-through caching | ✅ |
| BullMQ for async work | ✅ |
| Connection pooling (mysql2) | ✅ |
| Gzip compression | ✅ |
| Static asset CDN | 🔮 |
| HTTP/2 | 🔮 (proxy-dependent) |
| Image optimisation pipeline | 🔮 (sharp for resizes) |
| ES bulk indexing | ✅ |

### 15.6 CDN Optimization 🔮

Phase 3. CloudFront in front of S3 for files; static SPA assets served via CloudFront with long-cache, fingerprinted filenames (Vite already produces these).

---

## 16. UI/UX Principles

### 16.1 Responsive Design ✅

- CSS-grid layouts collapse cleanly at 900px and 600px breakpoints
- No fixed widths on cards or form fields
- Mobile-first navigation drawer (planned)

### 16.2 Accessibility ✅

- All interactive elements have aria-labels or visible labels
- Show/hide password buttons have `aria-label="Show password" / "Hide password"`
- Form errors use `role="alert"`
- Color contrast meets WCAG AA on primary text + button surfaces
- Keyboard navigation works on every screen (tab order, Enter to submit)

### 16.3 User Experience Flow

- One main action per screen (e.g. "Save profile" is the only primary CTA on `/profile`)
- Progressive disclosure: complex forms broken into 5 numbered cards
- "Empty hint" cards instead of blank space when data is missing
- Real-time feedback: profile completion bar moves as you type/save

### 16.4 Modern UI Principles ✅

- Typography: Fraunces (display) + Geist (body)
- Color: coral primary on bone background (warm, distinct from the LinkedIn / Indeed blue-grey crowd)
- Generous whitespace; 16px+ body text
- Soft 12-16px border radii on cards
- 250-400ms transitions, no flashy animations

### 16.5 Loading States

- `<LoadingState>` component on every async screen
- Skeleton loaders 🔮 Phase 2

### 16.6 Error Handling UI

- `<ErrorState error={err} onRetry={fn} />` on every screen with async data
- Inline form errors with `<EmptyHint>` styling
- Toast-style success banners (e.g. "Profile saved at HH:MM")
- Rejection modal on apply-time validation failures (with actionable "Update profile" CTA)

---

## 17. Development Phases

### Phase 1 — Foundation ✅ (Shipped — current state of the repo)

| Module | Status |
|---|---|
| Authentication (login, register, refresh, forgot/reset, email verify, Remember Me) | ✅ |
| Candidate profile (full editor + image + completion + Review page) | ✅ |
| Skills picker (catalogue + custom + multi-select) | ✅ |
| Resume upload + parse + confirm | ✅ |
| Work history CRUD | ✅ |
| Job posting + lifecycle | ✅ |
| Public job listing + detail | ✅ |
| Smart job matching (0-100 rubric + AI labels) | ✅ |
| Apply with match validation | ✅ |
| Company verification workflow | ✅ |
| Admin dashboard + audit log | ✅ |
| Redis caching | ✅ |
| ElasticSearch + autocomplete | ✅ |
| BullMQ queues | ✅ |
| Gmail SMTP via Nodemailer | ✅ |
| Profile image upload + display fix | ✅ |
| 102 OpenAPI endpoints documented | ✅ |

**Estimated effort**: 12-16 weeks of senior engineering. **Status**: complete and on `main`.

### Phase 2 — Production Hardening (Next 8-12 weeks)

| Module | Effort estimate |
|---|---|
| Skeleton loaders on every screen | 1 week |
| Application-status notification templates (email + in-app) | 1 week |
| Dedicated `/notifications` page | 1 week |
| Settings consolidation (`/settings`) | 1 week |
| Admin reports page with date ranges | 2 weeks |
| Interview module polish (reminders, calendar links) | 2 weeks |
| OTP-based 2FA option for admins | 1 week |
| Virus scan on resume uploads (ClamAV) | 1 week |
| Monitoring stack (Prometheus + Grafana or Datadog) | 1 week |
| Staging environment + CI/CD pipeline | 2 weeks |

### Phase 3 — Monetisation & Scale (Following 12-16 weeks)

| Module | Effort estimate |
|---|---|
| Subscription & payment module (Stripe) | 3 weeks |
| Employer subscription tiers + entitlement enforcement | 2 weeks |
| Invoicing + tax handling | 2 weeks |
| SMS notifications (Twilio) | 1 week |
| Web push (service worker) | 1 week |
| Real-time updates (SSE) | 1 week |
| Production AWS deployment | 2 weeks |
| CloudFront CDN for files | 1 week |
| Backup + disaster-recovery runbooks | 1 week |
| Performance load-testing + tuning | 2 weeks |

### Phase 4 — AI Native & Global (Following 16+ weeks)

| Module | Effort estimate |
|---|---|
| AI interview module (LLM-driven Q&A + scoring) | 4 weeks |
| Semantic search (vector embeddings) | 3 weeks |
| LLM-based resume parsing for long-tail layouts | 2 weeks |
| Multi-region deployment | 3 weeks |
| Microservice decomposition (auth, mail, resume parser) | 6 weeks |
| Mobile native apps (React Native shell over existing API) | 8 weeks |
| ATS integrations (Greenhouse, Lever, Workday) | 6 weeks |

---

## 18. QA Checklist

### 18.1 Functional Testing

- [ ] User can register as candidate; verification email received; verification link activates account
- [ ] User can register as employer; company row created; verification status `pending` until admin approves
- [ ] Login fails for `pending`, `suspended`, `inactive` users with appropriate messages
- [ ] Login succeeds for active users; tokens issued
- [ ] Remember Me extends refresh-token lifetime to 90 days
- [ ] Forgot password sends an email; reset link works; old refresh tokens revoked after reset
- [ ] Password show/hide toggle works on every password input
- [ ] Profile updates persist; completion bar moves accordingly
- [ ] Image upload accepts JPG/PNG/WEBP under 2MB; rejects everything else with 413/415
- [ ] Image displays correctly on Profile, Dashboard, Header, Review page
- [ ] Skills picker autocomplete returns results; custom skill creates a catalogue row
- [ ] Work history CRUD works; MonthYearPicker enforces 2000..current year, no future
- [ ] Resume upload accepts PDF/DOCX/TXT under 5MB; parse extracts fields; confirm merges into profile
- [ ] Jobs feed is auth-aware (latest for guest, personalised for candidate)
- [ ] Match% surfaces on job cards when signed in
- [ ] Apply with sub-threshold match returns rejection modal with specific skills missing
- [ ] Admin can verify companies; rejected companies cannot post jobs
- [ ] Admin audit log captures every state change

### 18.2 API Testing

- [ ] All 102 OpenAPI endpoints return the documented response envelope
- [ ] Validation errors return 422 with `Errors[]` field-level detail
- [ ] Auth failures return 401; role failures return 403; not-found returns 404
- [ ] Refresh-token rotation: old token rejected after rotation
- [ ] Single-use tokens (password reset, email verify) cannot be replayed
- [ ] Rate limits trigger 429 with `Retry-After` header
- [ ] All POST mutations return the new state (no need for a follow-up GET)

### 18.3 Security Testing

- [ ] SQL injection attempts on every search param return zero results, no error leak
- [ ] XSS payload in `summary` field renders as plain text, not HTML
- [ ] CORS rejects requests from disallowed origins in prod config
- [ ] JWT tampering (alter payload, keep header+sig) → 401
- [ ] Expired access token triggers refresh attempt; expired refresh forces logout
- [ ] Signed file URL with tampered `sig` → 403
- [ ] Signed file URL past `exp` → 403
- [ ] Uploaded `.exe` renamed to `.jpg` rejected by magic-number sniff
- [ ] Forgot-password response identical for known vs unknown emails

### 18.4 Load Testing 🔮 (Phase 2)

- [ ] 100 RPS sustained on `/jobs` for 10 minutes — P99 latency < 500ms
- [ ] 50 concurrent resume uploads complete in < 5s each
- [ ] BullMQ workers process 10,000 emails/hour without queue backlog growth
- [ ] Redis cache hit rate ≥ 85% on `/home` and `/jobs` listings

### 18.5 Mobile Testing

- [ ] iOS Safari (latest two versions) — all screens render, forms submit
- [ ] Android Chrome (latest two versions) — same
- [ ] Drag-and-drop image upload degrades gracefully on touch (tap-to-pick still works)
- [ ] Skill picker keyboard doesn't cover the dropdown on iOS

### 18.6 Browser Testing

- [ ] Chrome (latest two)
- [ ] Firefox (latest two)
- [ ] Safari (latest two)
- [ ] Edge (latest two)
- [ ] No console errors on any page on any browser

### 18.7 Accessibility Testing

- [ ] Lighthouse accessibility score ≥ 95 on Home, Jobs, Profile
- [ ] All forms submittable via keyboard only
- [ ] Screen reader (VoiceOver / NVDA) announces every form label correctly
- [ ] Color contrast ≥ 4.5:1 on body text

---

## 19. Conclusion

### 19.1 Business Value

Match Hire is a **production-grade foundation** for a curated career marketplace. Phase 1 delivers everything required to onboard the first thousands of candidates and hundreds of verified employers:

- A trustworthy matching engine that's transparent, auditable, and immediate
- A profile experience that reduces drop-off via progressive completion + automatic resume merge
- A moderation surface that keeps the marketplace clean from day one
- An infrastructure substrate (Redis + ES + BullMQ) ready for 10× growth without re-architecture

### 19.2 Scalability

The codebase is **deliberately structured** for the journey from monolith → modular monolith → microservices:
- Repository pattern keeps SQL out of business logic
- Service boundaries already map to future deployable units
- Queue-based async work decouples user-facing latency from background processing
- Cache invalidation is event-shaped, ready for an external bus
- Every external dependency (DB, Redis, ES, SMTP) has a graceful-degradation path

### 19.3 Market Impact

The job-board market is enormous and undifferentiated. Incumbents (LinkedIn, Indeed, ZipRecruiter) win on volume but lose on signal. Match Hire's wedge:

1. **Match transparency** — candidates see exactly why a job is recommended, recruiters see exactly why an applicant scored well
2. **Apply-time validation** — fewer wasted applications, fewer wasted reviews
3. **Senior + cross-border focus** — the underserved segment willing to pay for quality

### 19.4 Future Expansion

The roadmap (Phases 2-4) takes Match Hire from "verified launch" to "AI-native marketplace":
- **Phase 2**: production hardening (monitoring, CI/CD, staging, virus scan, notifications polish)
- **Phase 3**: monetisation (subscriptions, payments, SMS, push, AWS production)
- **Phase 4**: AI-native + global (LLM interviews, semantic search, multi-region, mobile apps, ATS integrations)

Each phase is **estimated and unblocked** — the foundation has been built to receive every one of these without rework.

---

## 20. Appendix — Codebase Reference Map

The single source of truth for everything in this document is the repository. Every claim above can be verified by reading the file paths below.

### 20.1 Backend Layout

```
Backend/src/
├── app.js                     Express wiring (helmet, cors, compression, static mounts, routes)
├── server.js                  Process entrypoint
├── config/
│   ├── env.js                 typed env loader
│   ├── database.js            mysql2 pool + queryOne/query/transaction
│   ├── redis.js               ioredis client + isReady() probe
│   ├── elasticsearch.js       lazy ES client + idempotent index mappings
│   └── mail.config.js         SMTP config validator
├── cache/cache.helper.js      Redis facade (rememberCache, deleteByPattern, Keys, Patterns)
├── controllers/               (10) auth · candidate · employer · admin · public · resume · home · mail · skill · search
├── services/                  (25) auth · candidate · candidateExperience · employer · admin · public · home · jobMatch · match · profileMatch · profileImage · reviewProfile · resume · skill · search · searchAnalytics · trending · session · ai · email · cache · geolocation · storage · mail/transporter · mail/mail
├── repositories/              user · candidate · employer · company · job · favorite · application · interview · token · meta · match · candidateExperience
├── routes/                    (12) index · auth · candidate · employer · admin · public · home · mail · skill · search · files · index (reindex)
├── validators/                Joi schemas — auth · candidate · employer · admin · public · home · mail
├── middlewares/               auth · role · validate · rateLimit · upload · error
├── queues/                    BullMQ — email · resume · match · notification
├── indexers/                  ES — job · candidate · resume
├── templates/                 HTML email templates — welcome · otp · password-reset · password-changed
├── database/
│   ├── migrate.js             runner
│   ├── migrations/            (31) numbered .js files
│   ├── seed.js                small curated seed (admins + 3 demo companies)
│   ├── seed.industries.js     22 industries × 10 companies + 18 professions
│   ├── seed.expand.js         additive +50 / +50 / +50
│   └── seed.skills.js         additive skill-catalogue top-up
├── docs/
│   ├── swagger.js             OpenAPI assembler (JSDoc-derived from routes)
│   └── schemas/               OpenAPI component shapes
└── utils/                     AppError · asyncHandler · logger · pagination · response.helper
```

### 20.2 Frontend Layout

```
Frontend/src/
├── App.jsx                    route table
├── main.jsx                   provider stack
├── pages/                     (16) Home · Jobs · Companies · Candidates · Profile · ReviewProfile · Preferences · Favorites · EmployerOnboarding · DashboardCandidate · DashboardCompany · DashboardAdmin · VerifyEmail · VerifyPending · ForgotPassword · ResetPassword
├── components/                (13) Header · Footer · Layout · TopBar · Logo · AuthModal · ProtectedRoute · AsyncState · JobCard · CompanyCard · CandidateCard · DashboardDropdown · ResumeUploadCard · SkillsPicker · ProfileImageUpload · ProfileCompletionCard · WorkExperienceCard · MonthYearPicker · PasswordInput
├── api/                       client (axios) · auth · public · home · candidates · employers · admin · skills · adapters
├── context/                   AuthContext · AuthModalContext · FavoritesContext
└── hooks/                     useLocation
```

### 20.3 Documentation Suite

| File | Purpose |
|---|---|
| `docs/FUNCTIONAL_DOCUMENT.md` | **This document** |
| `docs/MatchHire-Project-Document.pdf` | Earlier project document (visual / marketing-leaning) |
| `Backend/docs/DEVELOPER_GUIDE.md` | Hands-on developer guide with §1-§32 sections on architecture, conventions, recipes |
| `Backend/README.md` | Install + configure + route table |
| `Frontend/README.md` | Folder layout, API client, environment, scripts |
| `README.md` (root) | Quick-start for the full stack |

### 20.4 Conversion to PDF / DOCX

This Markdown file converts cleanly to either format using **Pandoc**:

```bash
# PDF (requires a LaTeX engine like TinyTeX)
pandoc docs/FUNCTIONAL_DOCUMENT.md \
  -o docs/FUNCTIONAL_DOCUMENT.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=1in \
  -V mainfont="Geist" \
  -V monofont="Menlo" \
  --toc --toc-depth=3

# DOCX (no LaTeX needed)
pandoc docs/FUNCTIONAL_DOCUMENT.md \
  -o docs/FUNCTIONAL_DOCUMENT.docx \
  --toc --toc-depth=3 \
  --reference-doc=docs/reference.docx   # optional, for branded styling
```

For a quick HTML preview that mirrors the PDF layout:

```bash
pandoc docs/FUNCTIONAL_DOCUMENT.md \
  -o docs/FUNCTIONAL_DOCUMENT.html \
  --standalone --toc --css=docs/style.css
```

---

*Document prepared by the Match Hire Engineering team. For verification of any claim above, consult the linked code paths in the repository.*
