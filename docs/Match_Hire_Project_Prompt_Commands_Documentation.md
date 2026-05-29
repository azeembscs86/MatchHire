# MatchHire — Prompt Commands Documentation

> Complete, append-only log of every prompt-driven task on the MatchHire codebase. Per-command cards record the original prompt, the business reason, what was expected to land, the files / APIs touched, and the verified outcome.
>
> Companion to the table-style log at `docs/match-hire-prompts-and-requirements.md`. Both documents are kept; this one focuses on detailed per-command cards, that one on a quick-scan table.

---

## 1. Project Overview

**MatchHire** is an AI-augmented global job portal connecting candidates with employers through skill-based matching. It is built as a React SPA on top of a Node.js + Express + MySQL + Redis backend, with Elasticsearch powering search and a custom in-house matcher producing ranked recommendations on both sides of the marketplace.

The platform has three modules:

- **Candidate** — register, build a profile, upload a resume (auto-parsed), set preferences, see skill-ranked jobs, apply / save / favourite / withdraw applications, manage everything from a dashboard.
- **Company** — register, post jobs, see ranked applicants, receive AI-recommended passive candidates, message candidates through a content-filtered channel, see withdrawn applications.
- **Admin** — moderate users, content, and the matching system.

---

## 2. Business Purpose

| Goal | What it means in practice |
|---|---|
| Help candidates find relevant jobs | Surface roles ranked by skill / experience / location fit, not by post date. Hide expired and already-applied jobs. |
| Help companies find matching candidates | Show employers a ranked list of qualified applicants and AI-recommended passive candidates with match percentages. |
| Improve job matching with skills + experience signals | Every candidate action (profile edit, resume parse, preference change) feeds the same scoring pipeline so results stay personalised. |
| Keep UI / UX professional and responsive | One design system, one job card, no broken layouts on tablet or mobile. |
| Make dashboards consistent and easy to use | Candidate dashboard tabs share one shell; the company dashboard is a single coherent surface. |
| Protect the candidate's experience | Employer-only data (match score, missing skills) never leaks onto employer surfaces; candidates never see jobs they've already applied to or that are expired. |

---

## 3. Technical Stack

| Layer | Tech |
|---|---|
| Frontend | React `18.3.1` · React Router DOM `6.26.2` · Vite `8.0.13` · Axios `1.7.7` |
| Backend | Node.js · Express `4.21` · Helmet · CORS · `express-rate-limit` |
| Database | MySQL via `mysql2 3.11` — migrations under `Backend/src/database/migrations` |
| Cache | Redis via `ioredis 5.4` — dashboard stats, job detail, job list patterns |
| Search | Elasticsearch (`@elastic/elasticsearch 8.15`) |
| Auth | JWT (`jsonwebtoken 9`) · bcrypt · role-gated middlewares |
| Validation | Joi `17` |
| Email | Nodemailer `8` (Gmail SMTP App Password in dev) |
| Uploads + parsing | Multer · `pdf-parse` · `mammoth` (DOCX) |
| API docs | `swagger-jsdoc` + `swagger-ui-express` |
| AI / matching | In-house `matchService` (skills weighting, experience, location, salary, recency) |
| QA | Playwright (E2E) · Jest `30` + Supertest `7` (API) · axe-core (a11y) · Lighthouse (perf / a11y / SEO / best-practices) |

**Repository layout**

```
Backend/   Node/Express API, MySQL, Redis, swagger docs
Frontend/  React SPA, shared design system in styles.css
qa/        Playwright e2e + Jest API + axe + Lighthouse
docs/      Functional document, PDF render, prompt-command logs
```

---

## 4. Project Modules

### 4.1 Candidate Module
**Business:** the candidate is the marketplace's primary attention; everything else exists to serve them.
**Users:** job seekers who registered with email + password, optionally completed onboarding.
**Frontend files (selection):** `pages/DashboardCandidate.jsx`, `pages/Profile.jsx`, `pages/Preferences.jsx`, `pages/CandidateApplications.jsx`, `pages/Favorites.jsx`, `pages/SavedJobs.jsx`, `components/CandidateDashSidebar.jsx`, `components/CandidateDashboardLayout.jsx`, `components/JobCard.jsx`.
**Backend files (selection):** `routes/candidate.routes.js`, `controllers/candidate.controller.js`, `services/candidate.service.js`, `services/match.service.js`, `repositories/application.repository.js`.
**Database tables:** `users`, `candidate_profiles`, `candidate_skills`, `candidate_experiences`, `candidate_education`, `candidate_portfolios`, `candidate_achievements`, `applications`, `favorites`, `saved_jobs`, `candidate_preferences`.
**Testing checklist:** login, profile completion %, resume upload + parse preview, skills picker, apply (validate-and-apply), save, favourite, withdraw, dashboard tab navigation, preferences sidebar scroll tracking.

### 4.2 Company Module
**Business:** employer side; quality of applicants and recommendation pipeline drive retention.
**Users:** hiring teams, recruiters, founders, agency partners.
**Frontend files:** `pages/DashboardCompany.jsx`, `pages/CompanyDetail.jsx`, `pages/EmployerOnboarding.jsx`.
**Backend files:** `routes/employer.routes.js`, `controllers/employer.controller.js`, `services/employer.service.js`, `services/match.service.js`.
**Database tables:** `companies`, `company_users`, `jobs`, `applications`, `match_history`.
**Testing checklist:** company dashboard renders, posted jobs grid uses `viewer="company"` (no match score / Apply Now / why-recommended), applicants table maps every status (including `withdrawn`), recommended-candidates surface is employer-only.

### 4.3 Jobs Module
**Business:** the centrepiece — every list, card, and detail page must render consistently.
**Users:** all roles read jobs; only employers write them.
**Frontend files:** `pages/Jobs.jsx`, `pages/JobDetail.jsx`, `components/JobCard.jsx`, `components/CardShell.jsx`, `components/MatchingJobsCarousel.jsx`, `api/adapters.js` (`toJobCardShape`, `filterActiveJobs`).
**Backend files:** `routes/public.routes.js` (job list/detail), `services/job.service.js`, `repositories/job.repository.js`, `services/match.service.js`.
**Database tables:** `jobs`, `companies`.
**Testing checklist:** auth-aware feed sorts (match for candidates, latest for guests), expired jobs filtered out, applied jobs hidden from the match feed, card design identical on every surface.

### 4.4 UI / UX Module
**Business:** consistency = trust; one design system on every page.
**Frontend files:** `styles.css`, `components/CardShell.jsx`, `components/JobCard.jsx`, `components/Header.jsx`, `components/MobileNav.jsx`, `components/CandidateDashSidebar.jsx`.
**Testing checklist:** Playwright `qa/e2e/ui/*` suite — job card layout, blank-page detector, responsive (320 / 375 / 414 / 768 / 1024 / 1440).

### 4.5 Backend / API Module
**Business:** stable contracts so the SPA, mobile apps, and external integrators can rely on the same envelope shape.
**Files:** `Backend/src/routes/*`, `Backend/src/controllers/*`, `Backend/src/services/*`, `Backend/src/repositories/*`, `Backend/src/validators/*`, `Backend/src/middlewares/*`.
**Testing checklist:** Jest + Supertest specs under `qa/api/*`; Swagger reflects every shipped route.

---

## 5. Completed Work Summary

A high-level summary of what has shipped to `main` so far (full history in Section 6):

- React SPA conversion, Swagger docs, `npm run dev` orchestrator (2026-05-17).
- Global job model + Redis cache + Elasticsearch (2026-05-18).
- Candidate UX overhaul: smart matching, skills picker, profile image, completion score, Gmail SMTP, Remember-me, Forgot password (2026-05-20).
- Profile module hardening: image fix, MonthYearPicker, work-history CRUD (2026-05-21).
- Preferences wiring, Onboarding wizard, resume management (2026-05-22).
- Card alignment + featured badge work + 200+ demo jobs (2026-05-22).
- Apply Now globally, global card UI, expired-job hiding, filters end-to-end (2026-05-23).
- Detail pages, company match %, AI recommended candidates, resume download, similar professionals (2026-05-24).
- Universal portfolio + achievements + completion score (2026-05-25).
- QA automation suite (Playwright + Jest + axe + Lighthouse), then full workflow coverage (2026-05-25).
- Job-type default badge, mobile responsiveness sweep (2026-05-25).
- Matching company job cards, dashboard layout unification, sidebar relabel (2026-05-26).
- Role-based job card rendering + tighter heights (2026-05-27).
- Auto-height standardised cards + withdraw application end-to-end (2026-05-28).
- Profile/Preferences moved to standalone routes; Favourites moved into the candidate sidebar (2026-05-28).
- Preferences sidebar scroll-active-tab fix (2026-05-28).
- Master prompt + requirements log document (2026-05-28).
- This documentation file + PDF render workflow (2026-05-29).

---

## 6. Prompt Commands History

Each card below records one prompt-driven task. Cards are append-only — new prompts go at the end with the next step number.

**Note on early steps (Step 1 → ~Step 30):** the original prompt text for the earliest tasks isn't preserved in the conversation log; the "Prompt Command" field for those steps reconstructs the intent from the commit message and any in-code rationale. Cards from Step 34 onward quote the original prompt verbatim when available.

---

### Step 1
**Date:** 2026-05-17
**Module:** Foundation
**Purpose:** Establish the modern frontend foundation by converting the static HTML mock into a React SPA.
**Prompt Command:** Convert MatchHire static HTML project into a React application.
**Expected Output:** Vite-powered React 18 project replacing the static fixtures; SPA boots locally with `npm run dev`.
**Status:** Completed
**Commit:** `a1962d1`

### Step 2
**Date:** 2026-05-17
**Module:** Docs
**Purpose:** Make the codebase navigable for new developers.
**Prompt Command:** Add READMEs and JSDoc-style header comments across the codebase.
**Expected Output:** Top-level READMEs + per-module JSDoc headers.
**Status:** Completed
**Commit:** `6393712`

### Step 3
**Date:** 2026-05-17
**Module:** Backend
**Purpose:** Self-serve API discovery for the SPA and external integrators.
**Prompt Command:** Add Swagger API documentation and a developer guide.
**Expected Output:** `/api/docs` powered by `swagger-jsdoc` + `swagger-ui-express`.
**Status:** Completed
**Commit:** `298a67e`

### Step 4
**Date:** 2026-05-17
**Module:** Frontend ↔ Backend
**Purpose:** Replace static fixtures with live API responses.
**Prompt Command:** Wire the SPA to the backend; convert from fixtures to live API.
**Expected Output:** Axios client + auth bearer + page-level fetches.
**Status:** Completed
**Commit:** `728572f`

### Step 5
**Date:** 2026-05-17
**Module:** DX
**Purpose:** One-command local dev.
**Prompt Command:** Add a root `npm run dev` script that boots backend + frontend together.
**Expected Output:** `concurrently` script in root `package.json`.
**Status:** Completed
**Commit:** `a698d71`

### Step 6
**Date:** 2026-05-18
**Module:** Backend
**Purpose:** Support multi-country job postings end-to-end.
**Prompt Command:** Implement the global job portal backend layer.
**Expected Output:** Country / city / remote / global-remote fields on jobs, salary normalisation, work-mode chip data.
**Status:** Completed
**Commit:** `92ddb0b`

### Step 7
**Date:** 2026-05-18
**Module:** Frontend
**Purpose:** Surface the new global posting model on the SPA.
**Prompt Command:** Implement the global job portal frontend integration.
**Expected Output:** Country / remote filters + work-mode chips on every job surface.
**Status:** Completed
**Commit:** `b99495b`

### Step 8
**Date:** 2026-05-18
**Module:** Backend
**Purpose:** Sub-200ms hot reads on job lists and dashboard stats.
**Prompt Command:** Add Redis cache + Elasticsearch integration to the backend.
**Expected Output:** `ioredis` cache keys + invalidation patterns; `@elastic/elasticsearch` client.
**Status:** Completed
**Commit:** `6b62d04`

### Step 9
**Date:** 2026-05-20
**Module:** Candidate UX
**Purpose:** Lift the candidate's first session into a guided, modern experience.
**Prompt Command:** Candidate UX overhaul — smart matching, skills picker, profile image, completion score, Gmail SMTP, Remember-me, Forgot password.
**Expected Output:** Multi-feature epic; matching live; skills picker live; image upload live; profile completion bar live; password recovery via SMTP.
**Status:** Completed
**Commit:** `9878a9c`

### Step 10
**Date:** 2026-05-21
**Module:** Profile
**Purpose:** Production-grade profile editor — no broken inputs, no orphan dates.
**Prompt Command:** Profile module — image display fix, themed MonthYearPicker, work-history CRUD.
**Expected Output:** Image preview/upload works; date picker is themed; work history can be added / edited / deleted in multiple rows.
**Status:** Completed
**Commit:** `4e9f737`

### Step 11
**Date:** 2026-05-21
**Module:** Docs
**Purpose:** Stakeholder-readable overview of every module.
**Prompt Command:** Add an enterprise Functional & System Document (60+ pages).
**Expected Output:** `docs/FUNCTIONAL_DOCUMENT.md`.
**Status:** Completed
**Commit:** `4bace44`

### Step 12
**Date:** 2026-05-22
**Module:** Candidate UX
**Purpose:** Drive the matcher with explicit candidate preferences and onboard new users into the workflow.
**Prompt Command:** Candidate UX — full Preferences wiring, Onboarding wizard, Resume management.
**Expected Output:** 7-step onboarding wizard; Preferences saves + loads; resume upload + manage flow.
**Status:** Completed
**Commit:** `a6c924b`

### Step 13
**Date:** 2026-05-22
**Module:** Candidate UX
**Purpose:** Saved-for-later jobs + lossless profile editing.
**Prompt Command:** Add Saved-for-later jobs and fix profile UX (multi-experience, partial updates, strict-opt-in resume confirm).
**Expected Output:** `/saved-jobs` page; partial-update PATCH semantics; resume re-upload preview-then-confirm.
**Status:** Completed
**Commit:** `33c7d3c`

### Step 14
**Date:** 2026-05-22
**Module:** UI/UX
**Purpose:** Consistent CTA placement.
**Prompt Command:** Fix Apply Now button alignment globally.
**Expected Output:** Same button height + centred label on every surface.
**Status:** Completed
**Commit:** `b4b4aa9`

### Step 15
**Date:** 2026-05-22
**Module:** UI/UX
**Purpose:** Featured pill no longer collides with heart / bookmark icons.
**Prompt Command:** Fix Featured badge placement on job cards.
**Expected Output:** Badge inline with the action cluster; wraps on narrow widths.
**Status:** Completed
**Commit:** `f8abbc5`

### Step 16
**Date:** 2026-05-22
**Module:** Data
**Purpose:** Realistic load for matching demos.
**Prompt Command:** Seed 200+ high-salary demo jobs.
**Expected Output:** Seeder under `Backend/src/database/seeds` populates demo data.
**Status:** Completed
**Commit:** `cbfa1d3`

### Step 17
**Date:** 2026-05-22
**Module:** Mail
**Purpose:** Production email path documented end-to-end.
**Prompt Command:** Add Gmail SMTP setup docs, App Password procedure, SES/SendGrid migration notes.
**Expected Output:** Mail documentation in `Backend/`.
**Status:** Completed
**Commit:** `b5ab07e`

### Step 18
**Date:** 2026-05-22
**Module:** Mail
**Purpose:** Gmail App Passwords copy-pasted with spaces no longer break login.
**Prompt Command:** Auto-strip whitespace from `SMTP_PASS` at config load.
**Expected Output:** Defensive trim in mail config.
**Status:** Completed
**Commit:** `4ec91de`

### Step 19
**Date:** 2026-05-23
**Module:** Candidate UX
**Purpose:** Single, predictable CTA for the apply flow.
**Prompt Command:** Add Apply Now button globally for candidate users.
**Expected Output:** Card-level Apply Now visible only to logged-in candidates; gated by `onApply` prop.
**Status:** Completed
**Commit:** `d66f21b`

### Step 20
**Date:** 2026-05-23
**Module:** UI/UX
**Purpose:** Premium visual rhythm on the central card surface.
**Prompt Command:** Improve global job card UI and jobs display experience; unify job card design across home and jobs pages.
**Expected Output:** One JobCard component everywhere; consistent header / meta / footer.
**Status:** Completed
**Commits:** `7ccc33c`, `1fc79da`, `dcfe494`

### Step 21
**Date:** 2026-05-23
**Module:** Candidate UX
**Purpose:** Don't waste a candidate's time on dead postings.
**Prompt Command:** Remove expired jobs from candidate lists.
**Expected Output:** `filterActiveJobs` adapter applied everywhere candidate-facing.
**Status:** Completed
**Commit:** `2097569`

### Step 22
**Date:** 2026-05-23
**Module:** Jobs
**Purpose:** Searchable, sortable feed that actually filters.
**Prompt Command:** Fix the jobs page filters end-to-end.
**Expected Output:** Country / city / work-mode / salary / experience filters all functional.
**Status:** Completed
**Commit:** `6eeb45b`

### Step 23
**Date:** 2026-05-23
**Module:** Data
**Purpose:** Coverage for skill-based matching demos.
**Prompt Command:** Seed 200 more companies + ≥50 jobs per skill.
**Expected Output:** Heavier seed across the skill graph.
**Status:** Completed
**Commit:** `8a5d64e`

### Step 24
**Date:** 2026-05-24
**Module:** Detail pages
**Purpose:** Direct deep-links to candidate and company surfaces.
**Prompt Command:** Add clickable candidate and company detail pages.
**Expected Output:** `/candidates/:id` and `/companies/:id` route to full detail pages.
**Status:** Completed
**Commit:** `d0cbec4`

### Step 25
**Date:** 2026-05-24
**Module:** UI/UX
**Purpose:** Featured + heart + bookmark cluster reads as one row.
**Prompt Command:** Align Featured badge with job card actions globally.
**Expected Output:** Single action cluster at top-right; wraps cleanly on narrow widths.
**Status:** Completed
**Commit:** `98f86aa`

### Step 26
**Date:** 2026-05-24
**Module:** Matching
**Purpose:** Employers see how qualified their applicants are.
**Prompt Command:** Show company-side candidate match percentage for active jobs.
**Expected Output:** Match badge on the company applicants surface.
**Status:** Completed
**Commit:** `57309e1`

### Step 27
**Date:** 2026-05-24
**Module:** Matching (AI)
**Purpose:** Passive-candidate recommendations for employers.
**Prompt Command:** Implement AI-powered recommended candidates and advanced matching system.
**Expected Output:** Employer "Recommended candidates" surface ranked by the in-house matcher.
**Status:** Completed
**Commit:** `3f1a162`

### Step 28
**Date:** 2026-05-24
**Module:** Company UX
**Purpose:** Quick triage of applicants.
**Prompt Command:** Add resume download option for companies on candidate profile, plus the primary download CTA next to Contact and icons on both buttons.
**Expected Output:** "Download Resume" + "Contact" CTAs on `/candidates/:id` (employer view).
**Status:** Completed
**Commits:** `6a81131`, `02381a6`, `1a4875f`

### Step 29
**Date:** 2026-05-24
**Module:** Candidate UX
**Purpose:** Personal recommendations on the candidate's own page.
**Prompt Command:** Add a horizontal matching-jobs section on the candidate profile.
**Expected Output:** Carousel of matching jobs visible to the candidate.
**Status:** Completed
**Commit:** `549742e`

### Step 30
**Date:** 2026-05-24
**Module:** UI/UX
**Purpose:** One `CardShell` for every clickable tile.
**Prompt Command:** Unify card design across jobs and candidates.
**Expected Output:** Shared CardShell drives outer surface for JobCard + CandidateCard.
**Status:** Completed
**Commit:** `51eb266`

### Step 31
**Date:** 2026-05-24
**Module:** Candidate UX
**Purpose:** Peer-network surface with abuse-resistant messaging.
**Prompt Command:** Add similar professionals + professional candidate messaging.
**Expected Output:** Similar-professionals rail on candidate detail; messaging endpoint with content filter.
**Status:** Completed
**Commit:** `8bf87e9`

### Step 32
**Date:** 2026-05-25
**Module:** Profile
**Purpose:** Richer profile + a measurable strength score.
**Prompt Command:** Add a universal portfolio + achievements system with profile completion scoring.
**Expected Output:** Portfolio CRUD; achievements CRUD; completion score includes both.
**Status:** Completed
**Commit:** `a00475b`

### Step 33
**Date:** 2026-05-25
**Module:** UI/UX
**Purpose:** Card always shows a work-mode chip; never blank.
**Prompt Command:** Add job-type badge to job cards with Onsite default.
**Expected Output:** `toJobCardShape` falls back to `onsite` when no value supplied.
**Status:** Completed
**Commit:** `75662ac`

### Step 34
**Date:** 2026-05-25
**Module:** QA
**Purpose:** Hard guard rails against regressions; deliver a CI-ready test stack.
**Prompt Command:** Act as a Senior QA Architect. Add a comprehensive QA automation suite covering Playwright (E2E), Jest + Supertest (API), axe-core (a11y), and Lighthouse (performance / a11y / SEO / best-practices). Centralise everything under `/qa` with reusable helpers, fixtures, reports, and npm scripts.
**Expected Output:** `/qa/{e2e,api,helpers,fixtures,reports,scripts}` layout; `qa:e2e`, `qa:api`, `qa:lighthouse`, `qa:full` scripts; baseline 31 green tests.
**Status:** Completed
**Commits:** `9765af9`, `1c94e1c`, `b254815`, `fb99dcc`, `dad9fdc`

### Step 35
**Date:** 2026-05-25
**Module:** UI/UX
**Purpose:** Cards aligned across rows of the grid.
**Prompt Command:** Fix inconsistent job card heights globally.
**Expected Output:** Reserved-slot height contract (`min-height` per slot) so siblings in a row stay equal-height. *(Superseded later by Step 48 — auto-height.)*
**Status:** Completed (superseded by Step 48)
**Commit:** `cedadb7`

### Step 36
**Date:** 2026-05-25
**Module:** Matching
**Purpose:** Better signal weighting on the candidate feed.
**Prompt Command:** Improve candidate listing skill-based matching.
**Expected Output:** More accurate ranking; richer reasons + missing arrays.
**Status:** Completed
**Commit:** `6bf59b8`

### Step 37
**Date:** 2026-05-25
**Module:** UI/UX
**Purpose:** Desktop / tablet / mobile all read correctly.
**Prompt Command:** Improve full-website mobile responsiveness.
**Expected Output:** Layout works at 320 / 375 / 414 / 768 / 1024 / 1440; no horizontal overflow.
**Status:** Completed
**Commit:** `edde0de`

### Step 38
**Date:** 2026-05-26
**Module:** Company UX
**Purpose:** Company surface uses the same shared `JobCard` as candidates.
**Prompt Command:** Build matching company job cards UI.
**Expected Output:** DashboardCompany renders postings via the shared JobCard.
**Status:** Completed
**Commit:** `f4e0538`

### Step 39
**Date:** 2026-05-26
**Module:** Dashboards
**Purpose:** Shell + sidebar persists across every candidate dashboard tab.
**Prompt Command:** Unify candidate and company dashboard layouts.
**Expected Output:** New `CandidateDashboardLayout` wraps every candidate sub-route; sidebar stays anchored. Company dashboard keeps its single-page layout (no candidate-style sub-routes exist).
**Status:** Completed
**Commit:** `92b8acd`

### Step 40
**Date:** 2026-05-26
**Module:** Candidate sidebar
**Purpose:** Sidebar focuses on day-to-day workflow.
**Prompt Command:** Remove unused sidebar tabs from the candidate dashboard — Job Matches, Job Preference, Edit Profile.
**Expected Output:** Sidebar trimmed; underlying routes (`/jobs`, `/profile`, `/preferences`) stay live.
**Status:** Completed
**Commit:** `ee01050`

### Step 41
**Date:** 2026-05-26
**Module:** Candidate UX
**Purpose:** My Applications tab renders inside the same shell as every other tab.
**Prompt Command:** Fix candidate dashboard tabs and application list.
**Expected Output:** `/dashboard/candidate/applications` renders inside `CandidateDashboardLayout`.
**Status:** Completed
**Commit:** `d3a1249`

### Step 42
**Date:** 2026-05-27
**Module:** UI/UX
**Purpose:** Stronger title, summary line, restrained meta row.
**Prompt Command:** Improve job card UI and information hierarchy.
**Expected Output:** Hierarchical card layout — title → summary → trust badges → match → meta → tags → footer → apply.
**Status:** Completed
**Commit:** `170b40e`

### Step 43
**Date:** 2026-05-27
**Module:** UI/UX
**Purpose:** Company viewer hides match / why / missing; candidate keeps full UX.
**Prompt Command:** Role-based job card rendering and tighter card height.
**Expected Output:** `viewer` prop on JobCard; `min-height` retuned 316px → 288px.
**Status:** Completed (height contract later superseded by Step 48)
**Commit:** `d6a93cb`

### Step 44
**Date:** 2026-05-28
**Module:** Cards + Apply flow
**Purpose:** One card design across the project, role-based; candidates can withdraw applications safely.
**Prompt Command (verbatim, abbreviated):**
> Make all candidate job cards match the second/reference card design across the whole project. Remove empty space from cards (auto-height). For company users, do NOT show Apply Now / match score / Strong fit / missing skills — show "Manage Job / View Applications" instead. If candidate already applied, button text must be "Applied" (not "Already Applied"). Add Withdraw Application button in Candidate Dashboard → Job Applications with confirmation modal; company dashboard must see withdrawn applications.
**Expected Output:** Auto-height JobCard (no reserved-empty slots); conditional rendering for empty sections; `onManage` prop for company viewer; JobDetail "Applied" label fix; new `POST /candidates/applications/:applicationId/withdraw`; confirmation modal + optimistic refresh in `CandidateApplications.jsx`; company applicant table maps Withdrawn correctly.
**Status:** Completed
**Commit:** `932856c`
**Verification:** Full Playwright suite 90/90 passed; new withdraw API test passed.

### Step 45
**Date:** 2026-05-28
**Module:** Navigation
**Purpose:** Cleaner workflow sidebar + standalone full-page editors.
**Prompt Command (verbatim, abbreviated):**
> Fix layout/navigation for Preferences, My Profile, and Favourites. Remove dashboard sidebar from Preferences and My Profile (standalone pages, top header only). Remove Favourites from top header/menu — add it inside Candidate Dashboard sidebar (Overview / Job Applications / Saved Jobs / Favourites / Messages / Notifications / Settings / Logout). When candidate clicks Favourites in dashboard sidebar, keep same dashboard layout with left sidebar.
**Expected Output:** `/profile`, `/profile/review`, `/preferences` moved OUT of `CandidateDashboardLayout`; Favourites heart removed from Header + MobileNav; sidebar relabeled (My Applications → Job Applications, Saved for Later → Saved Jobs, Sign out → Logout); Interviews placeholder and Account divider removed.
**Status:** Completed
**Commit:** `776e54d`
**Verification:** Full Playwright suite 90/90 passed; updated `dashboard-shell.spec.js` asserts /preferences renders WITHOUT the dashboard sidebar.

### Step 46
**Date:** 2026-05-28
**Module:** Preferences
**Purpose:** Sidebar tab follows the section the user is actually reading.
**Prompt Command (verbatim, abbreviated):**
> Fix User Preferences page tab active-state on scroll without replacing existing working functionality. Restore/fix scroll-based active tab selection (both scroll down and scroll up). Click → smooth scroll. Avoid flickering. Clean up listeners on unmount. Don't break Save or My Profile.
**Expected Output:** Replaced broken IntersectionObserver winner-pick (was selecting the most-scrolled-past section) with deterministic anchor-line scroll tracker, rAF-throttled. 700ms click-lock prevents flicker during smooth-scroll. New spec `qa/e2e/candidate/preferences-scroll.spec.js` covers initial / down / up / click-smooth.
**Status:** Completed
**Commit:** `beaef85`
**Verification:** Full Playwright suite 94/94 passed.

### Step 47
**Date:** 2026-05-28
**Module:** Docs
**Purpose:** Create the master append-only prompt log alongside this codebase.
**Prompt Command (verbatim, abbreviated):**
> Create and maintain one master document that stores all prompt commands, development instructions, business requirements, and implementation history. Save as `/docs/match-hire-prompts-and-requirements.md`. Append new prompts step by step; never remove previous ones.
**Expected Output:** `docs/match-hire-prompts-and-requirements.md` with 51 prompt-log rows mapped to actual commits, business goals, tech stack, per-module rules, workflow, and an append-only policy.
**Status:** Completed
**Commit:** `6efb2f3`

### Step 48
**Date:** 2026-05-29
**Module:** Docs
**Purpose:** Produce a per-command, card-style documentation file in both Markdown and PDF for distribution.
**Prompt Command (verbatim, abbreviated):**
> Create a complete "MatchHire Prompt Command Documentation" from scratch and keep it updated step by step. Create `Match_Hire_Project_Prompt_Commands_Documentation.md` AND a PDF export at `Match_Hire_Project_Prompt_Commands_Documentation.pdf`. Sections: Project Overview, Business Purpose, Technical Stack, Project Modules, Completed Work Summary, Prompt Commands History, per-module command sections, QA, Git workflow, Pending, Future. Format each command as Step / Date / Module / Purpose / Prompt / Expected Output / Status. Rule: whenever a new command is given, append to this same document; do NOT create a new document unless requested.
**Expected Output:** This file + matching PDF + a small render script (`docs/render-prompts-pdf.js`) that converts MD → HTML → PDF via the already-installed Playwright Chromium and `marked`. No previous docs removed.
**Status:** Completed
**Commit:** *(this commit)*
**Verification:** `npm run build` clean; backend module load OK; PDF generated and saved next to the markdown.

---

## 7. Backend Commands

Commands that landed primarily on the backend layer (routes, controllers, services, repositories, migrations, validators, middlewares).

- **Step 3** Swagger setup.
- **Step 6** Global job portal backend layer (multi-country, work-mode, salary normalisation).
- **Step 8** Redis cache + Elasticsearch integration.
- **Step 27** AI recommended candidates + advanced matching service.
- **Step 36** Improve candidate listing skill-based matching.
- **Step 44** Withdraw application endpoint — `POST /candidates/applications/:applicationId/withdraw`. Owner-checked; only from active pipeline states; busts the same caches `apply` does.

### Conventions

- All routes under `/api/v1/*`.
- All responses use the project envelope (`{ Response: { responseCode, status, message }, Data }`) via `utils/response.helper.js`.
- Param validation goes through `pubV.*Param` (shared) and body validation through `validators/*.validator.js`.
- Auth via `requireAuth`; role gating via `requireCandidate`, `requireEmployer`, `requireAdmin`.

---

## 8. Frontend Commands

Commands that landed primarily on the React SPA.

- **Step 1, 2, 4, 5** Foundation (SPA + READMEs + wiring + dev script).
- **Step 7** Global job portal frontend integration.
- **Step 9–10, 12–13, 19, 21, 29, 31–32** Candidate UX & profile.
- **Step 14, 15, 20, 25, 30** Card alignment, featured badge, unified card design.
- **Step 24, 28, 29** Detail pages, resume download, similar-professionals rail.
- **Step 38, 39, 41** Company-side card unification + dashboard layout.
- **Step 40, 42, 43, 44, 45, 46** Sidebar relabel, hierarchy improvements, role-based card rendering, auto-height standardisation, navigation moves, preferences scroll.

### Conventions

- Shared design system in `Frontend/src/styles.css`.
- Reusable `CardShell` for every clickable tile.
- View-model adaptation in `Frontend/src/api/adapters.js` (`toJobCardShape`, `filterActiveJobs`, `toCompanyCardShape`, `toCandidateCardShape`).
- All API calls via `Frontend/src/api/*.js` modules.

---

## 9. UI / UX Improvement Commands

| Step | Topic |
|---|---|
| 14 | Apply Now alignment globally |
| 15 | Featured badge placement |
| 20 | Global card UI |
| 25 | Featured + actions cluster alignment |
| 30 | Unified card across jobs + candidates |
| 33 | Job-type badge default (Onsite) |
| 35 | (Superseded by 48) Equal-height card slots |
| 37 | Full-website mobile responsiveness |
| 42 | Information hierarchy on the card |
| 43 | Role-based rendering + tighter heights |
| 44 | Auto-height standardisation + no empty space |
| 45 | Header / sidebar navigation reorganisation |
| 46 | Preferences scroll active-tab |

---

## 10. Candidate Module Commands

**Business:** every command in this section either lowers the friction of finding the right job or protects the candidate's experience (no expired roles, no already-applied roles, no employer-only data leaking in).

- Step 9 Smart matching, skills picker, image upload, completion score.
- Step 10 Profile editor hardening.
- Step 12 Preferences wiring + onboarding wizard + resume management.
- Step 13 Saved-for-later + lossless profile edits.
- Step 19 Apply Now CTA globally.
- Step 21 Hide expired jobs.
- Step 29 Matching jobs rail on candidate profile.
- Step 31 Similar professionals + professional messaging.
- Step 32 Portfolio + achievements + completion scoring.
- Step 36 Improved skill-based matching on candidate listing.
- Step 41 Applications-list tab inside the dashboard shell.
- Step 44 Withdraw application end-to-end.
- Step 45 Profile + Preferences standalone; Favourites in sidebar.
- Step 46 Preferences sidebar scroll tracking.

---

## 11. Company Module Commands

- Step 26 Company-side candidate match percentage.
- Step 27 AI recommended candidates surface.
- Step 28 Resume download + Contact CTAs.
- Step 38 Company job cards use the shared JobCard.
- Step 39 Dashboard layout consistency.
- Step 44 Company applicant table maps Withdrawn correctly (+ moderation hidden on terminal states); "View Applications" CTA on every company-viewer card.

---

## 12. Dashboard Commands

- Step 39 Unify candidate + company dashboards (extract `CandidateDashSidebar`, introduce `CandidateDashboardLayout`).
- Step 40 Remove Job Matches / Job Preference / Edit Profile from candidate sidebar.
- Step 41 Candidate applications tab renders inside the same shell.
- Step 45 Sidebar relabeled (Overview · Job Applications · Saved Jobs · Favourites · Messages · Notifications · Settings · Logout); Interviews placeholder removed.

---

## 13. Job Card Commands

- Step 14 Apply Now alignment.
- Step 15 Featured badge placement.
- Step 20 Global card UI + unification across Home + Jobs.
- Step 25 Featured + action cluster alignment.
- Step 30 Unified card across jobs + candidates (CardShell).
- Step 33 Onsite default work-mode badge.
- Step 35 Equal-height contract (reserved slots). *Superseded by Step 48.*
- Step 38 Company job cards use the same shared component.
- Step 42 Information hierarchy.
- Step 43 Role-based rendering via `viewer` prop.
- Step 44 Auto-height, no empty space, conditional rendering of empty sections, role-based action row (Apply for candidates, View Applications for companies).

---

## 14. Job Detail Page Commands

- Step 24 Clickable candidate + company detail pages (added the JobDetail navigation flow alongside).
- Step 29 Matching jobs section on candidate profile (uses JobDetail's similar-rail data).
- Step 44 JobDetail applied label changed "Already Applied" → "Applied".

---

## 15. Apply / Save / Favourite Commands

- Step 19 Apply Now globally.
- Step 13 Saved-for-later.
- Step 21 Hide expired jobs.
- Step 44 Withdraw flow + role-based card actions.
- Step 45 Favourites moved from top header into the candidate dashboard sidebar (the underlying `/favorites` route still uses the same FavoritesContext).

---

## 16. Withdraw Application Commands

Step 44 introduced the full feature. Summary:

- **Backend:** `WITHDRAWABLE_STATUSES = { applied, reviewing, under_review, shortlisted, interview, offered }`. Endpoint enforces ownership (the application's `candidate_user_id` must equal the authenticated user) and only allows withdrawal from those statuses. Sets status to `withdrawn`, never deletes the row, and busts `jobDetail`, `jobsList`, and both dashboard-stats cache patterns.
- **Frontend (candidate):** confirmation modal in `CandidateApplications.jsx`; optimistic UI flip; success / failure notice banner; refresh of stats in the background.
- **Frontend (company):** `DashboardCompany.jsx` applicant table maps `withdrawn` to the rejected-pill style (clearly terminal); moderation buttons (✓ / ✗) hidden once the application reaches a terminal state (`withdrawn`, `rejected`, `hired`, `accepted`).
- **QA:** API test asserts the route is auth-gated (guest → 401/403) and ownership-checked (candidate withdrawing a non-existent application → 404).

---

## 17. Responsive Design Commands

- Step 37 Full-website mobile responsiveness sweep.
- Continually validated by `qa/e2e/ui/responsive.spec.js` — 6 viewports × 5 routes per run.

---

## 18. QA / Testing Commands

- Step 34 (and follow-ups) — Playwright + Jest + Supertest + axe + Lighthouse.
- All e2e specs under `qa/e2e/{auth,candidate,company,jobs,navigation,ui,smoke}`.
- API specs under `qa/api/*.test.js`.
- Helpers: `qa/helpers/{auth,navigation,api-client,api-monitor,console-monitor,ui-validation,screenshot,report,env,wait-for-ready,jest-setup,validation}.js`.
- Reports consolidated by `qa/scripts/report.js` into `qa/reports/qa-report.html`.

### Latest verified test counts

- Playwright full suite (servers auto-started): **94 passed, 0 failed**.
- Jest API tests (`qa/api/candidates.test.js`): **6 passed, 0 failed**.

---

## 19. Git Commit History Notes

Workflow after every completed task:

```bash
# 1. Build / smoke
cd Frontend && npm run build
cd ../Backend && node -e "require('./src/app')"

# 2. Tests (when applicable)
PW_AUTO_START=1 npx playwright test --config qa/playwright.config.js
npx jest --config qa/jest.config.js

# 3. Commit + push
git add -A
git commit -m "<clear, meaningful message>"
git push
```

**Commit-message rule:** the subject line answers *what* in active voice; the body answers *why* and lists verification outcomes (e.g. "Full Playwright suite: 94 passed").

**Notable recent commits:**

| Commit | Date | Summary |
|---|---|---|
| `beaef85` | 2026-05-28 | Fix preferences scroll active tab state |
| `776e54d` | 2026-05-28 | Update profile preferences and favourites navigation |
| `932856c` | 2026-05-28 | Standardize job cards and add withdraw application |
| `d6a93cb` | 2026-05-27 | Role-based job card rendering and tighter card height |
| `170b40e` | 2026-05-27 | Improve job card UI and information hierarchy |
| `d3a1249` | 2026-05-26 | Fix candidate dashboard tabs and application list |
| `ee01050` | 2026-05-26 | Remove unused candidate dashboard sidebar tabs |
| `92b8acd` | 2026-05-26 | Unify candidate and company dashboard layouts |
| `f4e0538` | 2026-05-26 | Build matching company job cards UI |
| `6efb2f3` | 2026-05-28 | Add master prompt and requirements documentation |

---

## 20. Pending Work

| Item | Notes |
|---|---|
| Company per-job applicants page | The dashboard sidebar lists "Job Postings / Applicants / Shortlists / Interviews" as inert placeholders. Currently the company JobCard's "View Applications" CTA opens `/jobs/:id`; building a dedicated `/dashboard/company/jobs/:id/applicants` page is the next logical step. |
| Lighthouse performance score | Currently `perf=55` against the dev build. A production-build audit (and bundle code-splitting) should improve it significantly. |
| Header "My Profile" link | Today candidates reach `/profile` via inline CTAs (Footer, ProfileCompletionCard, dashboard "Edit profile →" button). An explicit top-header link could be added if product wants quicker access. |
| Interviews surface | The candidate stat card on the dashboard shows an interview count, but no dedicated interviews page exists yet. |
| Mobile drawer sign-in shortcut | Today the drawer only shows authenticated-state shortcuts; product may want explicit "Sign in" / "Join free" buttons up top on mobile. |

---

## 21. Future Improvements

- **Production-grade Lighthouse audit pipeline** in CI (currently a manual one-shot via `npm run qa:lighthouse`).
- **Bundle code-splitting** — current Vite warning flags a 530KB JS chunk; route-level dynamic imports would cut LCP.
- **Real-time applicant pipeline** (websockets) so the employer dashboard reflects new applications without a refresh.
- **Saved-search alerts** (per-candidate stored query, daily email digest via Nodemailer).
- **Multi-language** — i18n via `react-intl` or `i18next`. The current `@formatjs` dependency in `node_modules` suggests partial scaffolding exists.
- **Public profile pages** with custom-slug URLs for candidates who opt in.
- **Two-factor auth** on employer accounts.
- **Audit trail** for application status changes (already partially modelled in `applications` columns) — surface it on the candidate timeline.

---

## 22. Important Instructions (Append-Only Policy)

1. **Never remove a previous prompt command** from this document. Append the next step at the end of Section 6.
2. **Whenever a new prompt command is given for Match Hire, add it to this same document** under the next step number. Do not create a new document unless explicitly requested.
3. **Use real dates** — the date the task was executed, not the date it was assigned.
4. **Cite the commit hash** in every step so future readers can `git show <hash>` for full context.
5. **Mark status honestly** — `Completed`, `In Progress`, `Pending`, or `Reverted`. Don't mark Completed before the commit lands.
6. **If a later step supersedes an earlier one** (as Step 48 superseded the equal-height contract from Step 35), note that explicitly in the new step's Notes — do not silently rewrite the older step.
7. **Update Section 6 (UI/UX Rules) of the companion doc** whenever a card-design / dashboard / navigation rule changes; the rules and the log should never disagree.
8. **Regenerate the PDF** after each new step lands: `node docs/render-prompts-pdf.js`.

---

*End of document. Append the next prompt as Step 49.*
