# Match Hire — Prompt Commands, Business Requirements & Developer Implementation Log

> **Single source of truth** for every prompt-driven task on the Match Hire project. New prompts append here; nothing is ever removed.
>
> **Audience:** developers continuing the codebase, product / business stakeholders, future contributors who need to understand *why* something was built the way it was.

---

## 1. Project Overview

**Match Hire** is an AI-augmented global job portal that connects skilled candidates with employers through skill-based matching, professional messaging, and a recommendation engine that ranks roles and candidates by fit rather than recency.

The platform has three modules:

| Module | Audience | Core responsibility |
|---|---|---|
| **Candidate** | Job seekers | Build a structured profile, upload + parse a resume, browse skill-ranked roles, apply / save / favourite jobs, manage applications (including withdraw), receive notifications. |
| **Company / Employer** | Hiring teams | Post jobs, review applicants, see AI-recommended candidates ranked by match, message professionally vetted candidates, see withdrawn applications. |
| **Admin** | Platform operators | Moderate content, manage users, oversee the matching system. |

**Core concepts**

- **Job matching** — a backend scorer (`matchService.scoreJob`) produces a 0–100 score for each candidate × job pair, plus structured `reasons` (matched skills / experience / location) and `missing` (skills the candidate lacks). Candidates see this on every card; employers see the inverse on the Recommended Candidates surface.
- **Resume parsing** — uploaded resumes (PDF via `pdf-parse`, DOCX via `mammoth`) are extracted into a structured preview the candidate can edit before saving, so old profile fields are never silently overwritten.
- **Apply / Save / Favourite / Withdraw flow**
  - *Apply* — match-validated by default (`/applications/:jobId/validate-and-apply`); low-fit applications are rejected politely with a reason, high-fit ones are stored with their score so employers can sort applicants by quality.
  - *Save (for later)* — a personal bookmark for jobs the candidate isn't ready to apply to.
  - *Favourite* — a heart on the job card; separate from "save", appears on the candidate dashboard's Favourites tab.
  - *Withdraw* — flips an application to status `withdrawn`. The row is never deleted, so the employer keeps visibility of the withdrawal.

---

## 2. Business Goals

1. **Help candidates find relevant jobs** — surface roles ranked by skill / experience / location fit, not just by post date.
2. **Help companies find matching candidates** — show employers a ranked list of qualified applicants and AI-recommended passive candidates.
3. **Improve job matching with skills + experience signals** — every candidate action (profile edit, resume parse, preference change) feeds the same scoring pipeline so results stay personalised.
4. **Keep UI / UX professional and responsive** — one design system, one job card, no broken layouts on tablet / mobile.
5. **Make dashboards consistent and easy to use** — candidate dashboard tabs share one shell; the company dashboard is a single coherent surface.
6. **Protect the candidate's experience** — no employer-only data (match score, missing skills) leaks onto employer surfaces, and no candidate is shown a job they've already applied to or one that's expired.

---

## 3. Technology Stack

| Layer | Tech |
|---|---|
| **Frontend** | React `18.3.1` · React Router DOM `6.26.2` · Vite `8.0.13` · Axios `1.7.7` |
| **Backend** | Node.js · Express `4.21` · Helmet · CORS · `express-rate-limit` |
| **Database** | MySQL (`mysql2 3.11`) — migrations under `Backend/src/database/migrations` |
| **Cache** | Redis via `ioredis 5.4` — used for dashboard stats, job detail, job list patterns |
| **Search** | Elasticsearch `@elastic/elasticsearch 8.15` |
| **Auth** | JWT (`jsonwebtoken 9`) · bcrypt password hashing · role-gated middleware (`requireAuth`, `requireCandidate`, etc.) |
| **Validation** | Joi `17` |
| **Email** | Nodemailer `8` (Gmail SMTP App Password in dev, SES/SendGrid path documented) |
| **Uploads** | Multer for files; `pdf-parse` + `mammoth` for resume text extraction |
| **API docs** | `swagger-jsdoc` + `swagger-ui-express` — served alongside the API |
| **AI / matching** | In-house `matchService` (skills weighting, experience, location, salary expectation, recency); `Recommended candidates` and `validate-and-apply` decisions both feed off the same scorer |
| **QA** | Playwright (E2E) · Jest `30` + Supertest `7` (API) · axe-core (a11y) · Lighthouse (perf / a11y / SEO / best-practices) — all under `/qa` |

**Repository layout**

```
Backend/   Node/Express API, MySQL, Redis, swagger docs
Frontend/  React SPA, Vite, shared components, design system in styles.css
qa/        Playwright e2e + Jest API + axe + Lighthouse, reports/, helpers/
docs/      Functional document, PDF render, this prompt log
```

---

## 4. Prompt Command Log

Every prompt-driven task lands here. Step numbers never repeat. The most recent prompt is at the bottom.

| # | Date | Module | Prompt / Requirement | Business Purpose | Developer Notes | Status |
|---|---|---|---|---|---|---|
| 1 | 2026-05-17 | Foundation | Convert static HTML to a React SPA | Establish the modern frontend foundation. | Commit `a1962d1`. Replaced static fixtures with React components + Vite build. | Completed |
| 2 | 2026-05-17 | Docs | Add READMEs and JSDoc-style header comments | Make the codebase navigable for new developers. | Commit `6393712`. | Completed |
| 3 | 2026-05-17 | Backend | Add Swagger API documentation + developer guide | Self-serve API discovery for both frontend and external integrators. | Commit `298a67e`. `swagger-jsdoc` + `swagger-ui-express`. | Completed |
| 4 | 2026-05-17 | Frontend ↔ Backend | Wire SPA to live API | End-to-end connectivity instead of fixtures. | Commit `728572f`. Axios client + auth bearer. | Completed |
| 5 | 2026-05-17 | DX | `npm run dev` boots backend + frontend together | One-command local dev. | Commit `a698d71`. Root script orchestrates both. | Completed |
| 6 | 2026-05-18 | Backend | Global job portal — backend layer | Multi-country jobs, salary normalisation, work-mode + global remote flags. | Commit `92ddb0b`. | Completed |
| 7 | 2026-05-18 | Frontend | Global job portal — frontend integration | Surface global filters + work-mode chips on the SPA. | Commit `b99495b`. | Completed |
| 8 | 2026-05-18 | Backend | Redis cache + Elasticsearch integration | Sub-200ms hot reads on job lists and dashboard stats. | Commit `6b62d04`. Cache keys + invalidation patterns. | Completed |
| 9 | 2026-05-20 | Candidate UX | Smart matching, Skills picker, profile image, completion score, Gmail SMTP, Remember-me, Forgot password | Lift the candidate's first session into a guided, modern experience. | Commit `9878a9c`. Multi-feature epic. | Completed |
| 10 | 2026-05-21 | Profile | Image display fix, themed MonthYearPicker, work-history CRUD | Production-grade profile editor (no broken inputs, no orphan dates). | Commit `4e9f737`. | Completed |
| 11 | 2026-05-21 | Docs | Enterprise Functional & System Document (60+ pages) | Stakeholder-readable overview of every module. | Commit `4bace44`. Stored under `docs/FUNCTIONAL_DOCUMENT.md`. | Completed |
| 12 | 2026-05-22 | Candidate UX | Full Preferences wiring, Onboarding Wizard, Resume Management | Drive the matching engine with explicit candidate preferences. | Commit `a6c924b`. | Completed |
| 13 | 2026-05-22 | Candidate UX | Saved-for-later jobs + profile UX fixes (multi-experience, partial updates, strict-opt-in resume confirm) | Lossless profile edits + non-destructive resume re-uploads. | Commit `33c7d3c`. | Completed |
| 14 | 2026-05-22 | UI/UX | Fix Apply Now button alignment globally | Consistent CTA placement across every surface. | Commit `b4b4aa9`. | Completed |
| 15 | 2026-05-22 | UI/UX | Fix featured badge placement on job cards | Featured pill no longer collides with heart / bookmark icons. | Commit `f8abbc5`. | Completed |
| 16 | 2026-05-22 | Data | Seed 200+ high-salary demo jobs | Realistic load for matching demos / QA. | Commit `cbfa1d3`. | Completed |
| 17 | 2026-05-22 | Mail | Gmail SMTP setup guide + SES/SendGrid migration notes | Production email path documented end-to-end. | Commit `b5ab07e`. | Completed |
| 18 | 2026-05-22 | Mail | Auto-strip whitespace from `SMTP_PASS` | Gmail App Passwords copy-pasted with spaces no longer break login. | Commit `4ec91de`. | Completed |
| 19 | 2026-05-23 | Candidate UX | Apply Now button globally for candidates | Single, predictable CTA for the apply flow. | Commit `d66f21b`. | Completed |
| 20 | 2026-05-23 | UI/UX | Improve global job card UI + jobs display experience | Premium visual rhythm on the central card surface. | Commits `7ccc33c`, `1fc79da`, `dcfe494`. | Completed |
| 21 | 2026-05-23 | Candidate UX | Remove expired jobs from candidate lists | Don't waste a candidate's time on dead postings. | Commit `2097569`. `filterActiveJobs` adapter. | Completed |
| 22 | 2026-05-23 | Jobs | Fix jobs page filters end-to-end | Searchable, sortable feed that actually filters. | Commit `6eeb45b`. | Completed |
| 23 | 2026-05-23 | Data | Seed 200 more companies + ≥50 jobs per skill | Coverage for skill-based matching demos. | Commit `8a5d64e`. | Completed |
| 24 | 2026-05-24 | Detail pages | Clickable candidate + company detail pages | Direct deep-links to candidate and company surfaces. | Commit `d0cbec4`. | Completed |
| 25 | 2026-05-24 | UI/UX | Align featured badge with job card actions globally | Featured + heart + bookmark cluster reads as one row. | Commit `98f86aa`. | Completed |
| 26 | 2026-05-24 | Matching | Show company-side candidate match % for active jobs | Employers see how qualified their applicants are. | Commit `57309e1`. | Completed |
| 27 | 2026-05-24 | Matching (AI) | AI-powered recommended candidates + advanced matching | Passive-candidate recommendations for employers. | Commit `3f1a162`. | Completed |
| 28 | 2026-05-24 | Company UX | Resume download on candidate profile + primary download CTA + icons | Quick triage of applicants. | Commits `6a81131`, `02381a6`, `1a4875f`. | Completed |
| 29 | 2026-05-24 | Candidate UX | Horizontal matching-jobs section on candidate profile | Personal recommendations on the candidate's own page. | Commit `549742e`. | Completed |
| 30 | 2026-05-24 | UI/UX | Unify card design across jobs + candidates | One `CardShell` for every clickable tile. | Commit `51eb266`. | Completed |
| 31 | 2026-05-24 | Candidate UX | Similar professionals + professional candidate messaging | Peer-network surface with abuse-resistant messaging. | Commit `8bf87e9`. Content filter on `/candidates/:id/message`. | Completed |
| 32 | 2026-05-25 | Profile | Universal portfolio + achievements + profile-completion scoring | Richer profile + a measurable strength score. | Commit `a00475b`. | Completed |
| 33 | 2026-05-25 | UI/UX | Job-type badge on cards with Onsite default | Card always shows a work-mode chip; never blank. | Commit `75662ac`. `toJobCardShape` falls back to `onsite`. | Completed |
| 34 | 2026-05-25 | QA | Add QA automation suite (Playwright + Jest + Supertest + axe + Lighthouse) | Hard guard rails against regressions. | Commit `9765af9`. Suite lives under `/qa`. | Completed |
| 35 | 2026-05-25 | QA | Fix login / IPv6 / rate-limit / a11y threshold; 31 tests green | Stabilise the suite. | Commit `1c94e1c`. | Completed |
| 36 | 2026-05-25 | QA | Fix candidate similar-professionals flow + message-modal QA | Cover the messaging gate in tests. | Commit `b254815`. | Completed |
| 37 | 2026-05-25 | QA | Build out scalable Playwright QA automation | Reusable helpers (auth, navigation, console-monitor, api-monitor, ui-validation, screenshot, report). | Commit `fb99dcc`. | Completed |
| 38 | 2026-05-25 | UI/UX | Fix inconsistent job card heights globally | Cards aligned across rows of the grid. | Commit `cedadb7`. Reserved-slot approach (later superseded — see #45). | Completed |
| 39 | 2026-05-25 | QA | Improve Playwright QA + full workflow coverage | Candidate + company + UI + a11y + perf suites. | Commit `dad9fdc`. | Completed |
| 40 | 2026-05-25 | Matching | Improve candidate listing skill-based matching | Better signal weighting on the candidate feed. | Commit `6bf59b8`. | Completed |
| 41 | 2026-05-25 | UI/UX | Improve full-website mobile responsiveness | Desktop / tablet / mobile all read correctly. | Commit `edde0de`. | Completed |
| 42 | 2026-05-26 | Company UX | Matching company job cards UI | Company surface uses the same shared `JobCard` as candidates. | Commit `f4e0538`. | Completed |
| 43 | 2026-05-26 | Dashboards | Unify candidate + company dashboard layouts | Shell + sidebar persists across every candidate dashboard tab. | Commit `92b8acd`. New `CandidateDashboardLayout` + shared `CandidateDashSidebar`. | Completed |
| 44 | 2026-05-26 | Candidate sidebar | Remove unused sidebar tabs (Job Matches, Job Preference, Edit Profile) | Sidebar focuses on day-to-day workflow. | Commit `ee01050`. Routes (`/jobs`, `/profile`, `/preferences`) stayed live. | Completed |
| 45 | 2026-05-26 | Candidate UX | Fix candidate dashboard tabs + application list | My Applications tab renders inside the same shell. | Commit `d3a1249`. | Completed |
| 46 | 2026-05-27 | UI/UX | Improve job card UI and information hierarchy | Stronger title, summary line, restrained meta row. | Commit `170b40e`. | Completed |
| 47 | 2026-05-27 | UI/UX | Role-based job card rendering + tighter card height | Company viewer hides match/why/missing; candidate keeps full UX. | Commit `d6a93cb`. `viewer` prop on `JobCard`; min-height tuned 316→288px. | Completed |
| 48 | 2026-05-28 | Cards + Apply flow | Standardise job cards + add withdraw application | One card design, role-based; candidates can withdraw applications. | Commit `932856c`. New `POST /candidates/applications/:applicationId/withdraw`; confirmation modal in candidate Applications tab; auto-height cards (no reserved-empty slots); JobDetail label "Already Applied" → "Applied". | Completed |
| 49 | 2026-05-28 | Navigation | Profile + Preferences standalone; Favourites moved to candidate sidebar; sidebar relabeled | Sidebar reads as workflow tabs; full-page editors get the room they need. | Commit `776e54d`. Header heart removed; mobile drawer Saved-jobs link removed; sidebar labels now Overview / Job Applications / Saved Jobs / Favourites / Messages / Notifications / Settings / Logout. | Completed |
| 50 | 2026-05-28 | Preferences | Fix scroll-driven active tab on Preferences | Sidebar follows the section the user is actually reading. | Commit `beaef85`. Replaced inverted `IntersectionObserver` winner-pick with rAF-throttled anchor-line tracker; 700ms click-lock prevents flicker during smooth-scroll. New spec `qa/e2e/candidate/preferences-scroll.spec.js`. | Completed |
| 51 | 2026-05-28 | Docs | Create master prompt-and-requirements document | Single canonical log for prompts, business reasons, dev notes. | This document. Lives at `docs/match-hire-prompts-and-requirements.md`. | Completed |

---

## 5. Feature Requirements by Module

### 5.1 Candidate Module

| Feature | Description | Status |
|---|---|---|
| Register / Login | Email + password via JWT; Remember-me; Forgot password mail flow via Nodemailer / Gmail SMTP. | Done |
| Onboarding wizard | 7-step guided flow that hydrates the profile, preferences, and skills. | Done |
| Profile completion score | Per-section breakdown + composite score, surfaced in the dashboard and on `/profile`. | Done |
| Resume upload + parsing | PDF (`pdf-parse`) / DOCX (`mammoth`); preview-then-confirm flow so old fields never silently overwrite. | Done |
| Skills + expertise | `SkillsPicker` with autocomplete; persisted separately. | Done |
| Work experience CRUD | Multi-row editor with month-year pickers; partial updates supported. | Done |
| Job recommendations | `POST /candidates/jobs/match` returns roles scored by the in-house matcher. | Done |
| Apply job | Match-validated by default. Low-fit applications return a polite rejection + the missing skills. | Done |
| Save job (for later) | Personal bookmark; reflected on `/saved-jobs`. | Done |
| Favourite job | Heart icon on every card; reflected on `/favorites`. | Done |
| Withdraw application | Confirmation modal → `POST /candidates/applications/:id/withdraw`; status → `withdrawn`. Only allowed from active pipeline states. | Done |
| Candidate dashboard | `/dashboard/candidate` overview + nested tabs (Applications, Saved Jobs, Favourites, Messages, Notifications, Settings). All share one shell. | Done |
| Job Applications list | Per-row status pill (Applied / Under review / Shortlisted / Interview / Offered / Hired / Rejected / Withdrawn), withdraw CTA where allowed. | Done |
| Preferences page | Standalone full-width page (no dashboard sidebar). 8 sections; sidebar tabs follow the section currently in viewport. | Done |
| Similar professionals | Peer rail on the candidate detail page; messaging gated by a content filter. | Done |

### 5.2 Company Module

| Feature | Description | Status |
|---|---|---|
| Register / Login | Employer-onboarding flow at `/employer-onboarding`. | Done |
| Company dashboard | `/dashboard/company` — single page with sidebar shortcuts, posted jobs grid, applicants table, recommended candidates rail. | Done |
| Job posting | Create / edit jobs via the employer API; job goes live and starts collecting applicants + views. | Done |
| Posted jobs | Rendered through the same shared `JobCard` (with `viewer="company"`), showing status, applicants count, views count, expired flag. | Done |
| Applications | Top-applicants table on the dashboard; status pills map every backend state (including `withdrawn`); moderation hidden on terminal statuses. | Done |
| Withdrawn applications | Withdrawn rows remain visible to the employer with a clear pill; moderation actions disabled. | Done |
| Candidate search / list | `/candidates` public talent-search; recommended-candidates surface on the dashboard. | Done |
| Company job cards | Use the same design as candidate cards, but with a "View Applications" CTA (no Apply, no match score, no missing skills). | Done |

### 5.3 Jobs Module

| Feature | Description | Status |
|---|---|---|
| Job listing (`/jobs`) | Auth-aware feed: candidate sees match-ranked roles + Apply CTAs; guest sees latest-first. | Done |
| Job detail page (`/jobs/:id`) | Full posting, applied/expired states, similar-jobs rail. | Done |
| Similar / recommended jobs | Computed once per candidate context and cached. | Done |
| Applied-job hiding | `/candidates/jobs/match` excludes jobs the candidate already applied to. | Done |
| Expired-job handling | `filterActiveJobs` strips expired rows on every candidate-facing list. Detail page can still render an expired job with a clear "Job Expired" CTA. | Done |
| Featured jobs | `is_featured` flag → coral border, ★ Featured pill in the card actions cluster. | Done |
| Job card design rules | Single shared `JobCard` component, role-based via `viewer` prop. Auto-height (no reserved-empty slots). Apply Now / Applied / Expired states share one row. | Done |

### 5.4 UI/UX Module

| Topic | Rule |
|---|---|
| Mobile responsiveness | Tested at 320 / 375 / 414 / 768 / 1024 / 1440 in the QA suite (`qa/e2e/ui/responsive.spec.js`). No horizontal overflow beyond the native scrollbar gutter. |
| Dashboard sidebar | Same component everywhere (`CandidateDashSidebar`); active state via `NavLink`. Standalone pages (Profile, Preferences) do NOT show this sidebar. |
| Job card | One component (`JobCard`) drives every list. Cards size to content (`align-items:start` + no card-shell min-height). |
| Header menu | Marketplace nav only (Home / Jobs / Companies / etc.) + the Candidate/Company Hub dropdown. No Favourites shortcut. |
| Preferences page | Sidebar tabs follow the section in view via an rAF-throttled anchor-line tracker. Click → smooth-scroll with a 700 ms listener lock to prevent flicker. |
| Role-based UI | The `viewer` prop on `JobCard` ensures match score / why-recommended / missing-skills only appear for `candidate`. |

### 5.5 Backend / API Module

Selected routes (full surface in Swagger):

| Surface | Route | Notes |
|---|---|---|
| Apply | `POST /api/v1/candidates/applications/:jobId` | Bare apply (legacy). |
| Match-validated apply | `POST /api/v1/candidates/applications/:jobId/validate-and-apply` | Returns a polite rejection envelope if below threshold; otherwise stores the application + `match_score`. |
| List my applications | `POST /api/v1/candidates/applications/list` | Paginated, optional `status` filter. |
| **Withdraw application** | `POST /api/v1/candidates/applications/:applicationId/withdraw` | New. Ownership-checked; only from active pipeline states. Busts the same caches `apply` does. |
| Match jobs | `POST /api/v1/candidates/jobs/match` | Excludes already-applied jobs. |
| Recommended candidates | `POST /api/v1/employers/recommended-candidates` | Employer-only. |
| Saved jobs | `POST /api/v1/candidates/saved-jobs/*` | Save / remove / list. |
| Favourites | `POST /api/v1/candidates/favorites/*` | Add / remove / list. |
| Profile completion | `POST /api/v1/candidates/profile-completion` | Per-section breakdown. |

**Validation** — every body / params validator lives under `Backend/src/validators/`. Joi schemas, shared param validators (`pubV.jobIdParam`, `pubV.applicationIdParam`, `pubV.candidateIdParam`).

**Auth rules** — `requireAuth` for any authenticated route, plus role middlewares (`requireCandidate`, `requireEmployer`, `requireAdmin`). Guests are blocked at the route layer; cross-role calls return 4xx.

**Candidate-specific filtering** — every list goes through `filterActiveJobs` so expired jobs never surface on a candidate-facing surface. The matching endpoint also strips jobs the candidate already applied to.

**Company-specific filtering** — `viewer="company"` on the card hides match-score / why / missing-skills; the employer applications table maps `withdrawn` to a distinct pill and disables moderation on terminal states.

---

## 6. Important UI / UX Rules (Single Reference)

1. **Candidate users see**: Apply Now (active / Applied / Job Expired states), Save, Favourite, Match Score, Missing Skills, Why Recommended.
2. **Company users must NOT see**: Apply Now, Strong Fit, Match Score, Missing Skills, Why-Recommended checklist.
3. **Company users SEE**: applications count, views count, job status, withdrawn applications, "View Applications" CTA on each card.
4. **Job cards** are one shared component (`Frontend/src/components/JobCard.jsx`) — never duplicate a card design.
5. **No empty space in job cards** — auto-height layout, empty sections (why-list, meta-row, tags) are conditionally rendered, not reserved.
6. **Dashboards keep the same layout across tabs** — candidate sub-routes nest inside `CandidateDashboardLayout`; sidebar stays anchored.
7. **Preferences and My Profile do NOT show the dashboard sidebar** — they render as standalone pages under the global header/navbar.
8. **Favourites lives inside the candidate dashboard sidebar**, not in the top header.
9. **One header for everyone** — marketplace links + Candidate / Company Hub dropdown. No Favourites shortcut in the header.
10. **Mobile drawer mirrors the header** — no candidate-only shortcuts in the drawer either.

---

## 7. Git & Deployment Workflow

After every completed task:

```bash
# 1. Build / type-check / lint sanity
cd Frontend && npm run build      # Vite build — must finish clean
cd ../Backend && node -e "require('./src/app')"   # smoke-load the app

# 2. Tests
PW_AUTO_START=1 npx playwright test --config qa/playwright.config.js   # full E2E
npx jest --config qa/jest.config.js                                    # API tests

# 3. Commit + push
git add -A
git commit -m "<clear, meaningful commit message>"
git push
```

Commit messages should describe the **what + why** in a single line. The body adds rationale and lists test outcomes (e.g. "Full Playwright suite: 94 passed").

---

## 8. How to Add New Prompt Commands Going Forward

When a new task arrives:

1. **Append, never replace.** Add a row to the Prompt Command Log (Section 4). Step numbers are monotonic — never reuse one.
2. **Use real dates** — the date the task was executed, not the date it was assigned.
3. **Pick the right Module value** — match one of the headings in Section 5 (Candidate / Company / Jobs / UI-UX / Backend) or add a new one if genuinely new.
4. **Fill all six columns** — Step, Date, Module, Prompt/Requirement, Business Purpose, Developer Notes, Status. Empty cells are a code smell.
5. **Reference the commit hash** in Developer Notes so future readers can `git show <hash>`.
6. **Mark status honestly** — `Pending`, `In Progress`, `Completed`, or `Reverted`. Don't mark Completed before the commit lands.
7. **If the task changes a rule in Section 6**, update Section 6 in the same PR — the rules and the log should never disagree.
8. **Never delete a previous prompt.** If a later task supersedes an earlier one, note that in the later row's Developer Notes (e.g. "Supersedes #38 — replaces reserved-slot height contract with auto-height").
9. **Do not create a duplicate document.** One canonical file lives at `docs/match-hire-prompts-and-requirements.md`.

---

## 9. Current Known Prompt Commands (Summary Index)

The full ordered log is in Section 4. The summary below groups them so a new reader can find the right family of commits fast:

- **Foundation** (#1–#5) — React conversion, READMEs, Swagger, frontend↔backend wiring, single-command dev.
- **Global jobs + infra** (#6–#8) — multi-country posting model, Redis cache, Elasticsearch.
- **Candidate UX core** (#9–#13, #19, #21, #29, #31, #32) — smart matching, skills picker, profile image, completion score, Saved-for-later, Apply Now CTA, expired-job hiding, similar professionals, achievements/portfolio.
- **Mail** (#9, #17, #18) — Gmail SMTP setup, password-whitespace stripping, SES/SendGrid migration notes.
- **Job card design** (#14, #15, #20, #25, #30, #33, #38, #46, #47, #48) — alignment, featured badge, unified card, work-mode default, height contract evolution (equal-height → auto-height).
- **Filters + listing** (#22, #21) — jobs page filters, expired filtering.
- **Detail pages** (#24, #28, #29) — clickable candidate + company detail pages, resume download, matching jobs rail.
- **Matching engine** (#26, #27, #40) — company-side match %, AI recommended candidates, candidate listing improvements.
- **QA automation** (#34, #35, #36, #37, #39) — Playwright + Jest + axe + Lighthouse, scalable helpers, full workflow coverage.
- **Responsiveness** (#41) — mobile review across breakpoints.
- **Dashboards + sidebar + navigation** (#42, #43, #44, #45, #49, #50) — shared shells, sidebar relabeling, standalone Profile/Preferences, Preferences scroll tracking.
- **Withdraw application** (#48) — backend endpoint + UI confirmation modal + company-side visibility.
- **Documentation** (#2, #11, #51) — READMEs, functional document, this master log.

---

## 10. Important Instruction

- **Never remove** a previous prompt command from this document.
- **Always append** new commands step by step, with a new step number.
- **Keep the document professional, readable, and useful** for both developers and business stakeholders.
- **If you supersede a prior rule or contract** (as #48 did to #38, or #49 did to part of the layout from #43), say so explicitly in the new row's Developer Notes — don't silently rewrite the old row.
- **Treat this document as production code.** It's reviewed in the same PR as the change it describes.
