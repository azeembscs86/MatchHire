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

### Step 49
**Date:** 2026-05-29
**Module:** Home page
**Purpose:** Personalised, role-aware homepage. Candidates see skill-ranked job + company recommendations and career resources; employers see a hiring snapshot; guests see a marketplace overview with trending skills and salary explorer.
**Prompt Command (verbatim, abbreviated):**
> Step 1: Home Page Improvements. Add personalized AI homepage for logged-in candidates (recommended jobs/companies, trending skills, live hiring stats, salary explorer preview, career resources). For logged-out users keep public marketing homepage. For logged-in companies show hiring-related content instead of candidate-only recommendations. Do not replace existing homepage functionality.
**Expected Output:** New `home.service` helpers (`liveStats`, `trendingSkills`, `salaryExplorer`, `recommendedCompaniesFromMatches`, `employerSummary`); new `career-resources.service.js` (AI-swappable); `GET /api/v1/home` payload extended with `liveStats`, `trendingSkills`, `salaryExplorer`, `careerResources`, `recommendedCompanies`, `employer`; new React components (LiveStatsBand, TrendingSkillsRow, RecommendedCompaniesBlock, SalaryExplorerBlock, CareerResourcesBlock, EmployerHomeSummary); CSS additions using existing design tokens; Swagger updated; QA: home API tests cover guest, candidate, employer paths.
**Status:** Completed
**Commit:** *(this commit)*
**Verification:**
  - `vite build` clean.
  - `qa/api/home.test.js`: **4/4 passed** (guest base, Step-1 blocks, candidate path, employer hiring snapshot).
  - Full Playwright suite: **94/94 passed** (no regression).
  - Live `/home` payload validated against MySQL — multi-currency salary preview correctly picks dominant currency per label (USA → USD, Pakistan → PKR, India → INR, Germany → EUR).
**Notes:**
  - **No database migrations.** All new blocks aggregate from existing tables (`jobs`, `applications`, `companies`, `job_categories`, `users`).
  - The legacy `hero` block is preserved alongside the new `liveStats` block so any external consumer of the older shape keeps working.
  - `career-resources.service.js` returns curated static content today. Its function signature accepts `{ skills, role }` so a future AI call can replace the body without touching the route, payload shape, or frontend renderer.
  - Cache: guest payload is still cached in Redis 15min keyed `home:payload:guest`; bust with `DEL matchhire:home:payload:guest` when iterating locally.

---

### Step 50
**Date:** 2026-05-30
**Module:** Application flow + Search UX
**Purpose:** Step 2 of the multi-step plan. Tighten the candidate application lifecycle (applied jobs disappear from listings; withdrawn jobs reappear), give withdrawals their own dashboard tab, hide withdrawals from employers, and replace the cluttered Jobs filter sidebar header with a modern unified search bar.
**Prompt Command (verbatim, abbreviated):**
> 1. Applied jobs visibility: filter all job listing APIs by candidate id; exclude active statuses (Applied, Under Review, Shortlisted, Accepted). 2. Job Applications tab hides withdrawn + removes withdraw button. 3. New "Withdrawn Applications" sidebar tab with View Job / Reapply. 4. Withdraw flow from Job Detail page, not the list, with confirmation modal. 5. After withdraw the job reappears in every list. 6. Company dashboard never shows withdrawn applications. 7. Modern search bar — Job Title / Skills / Company / Location, autosuggest, recent searches, clear buttons, no internal scrollbars. Do not break Apply/Save/Favourite/Job Detail/dashboards.
**Expected Output:**
  - **Backend:** new shared SQL fragment `notHasActiveApplicationFragment()` filters `status NOT IN ('withdrawn','rejected')` — applied threads through `listPublic`, `listLocationBased`, `recommendedForUser`, `similarJobs`. `application.repository.listForCandidate` accepts `statuses[]` + `exclude_statuses[]`. `listApplicantsForJob` and `statsForCompany` hide withdrawn rows from employers by default. `home.service.employerSummary` excludes withdrawn from weekly counts. `public.service.getJob` semantically redefines `is_applied` to mean "active application only" so withdrawals re-enable Apply Now. New `company` filter on `/jobs` (validated in both `home.validator` and `public.validator`).
  - **Frontend:** new `CandidateWithdrawn.jsx` page + `/dashboard/candidate/withdrawn` route + sidebar entry. `CandidateApplications.jsx` fetches with `exclude_statuses:['withdrawn']` and drops in-list withdraw button + modal. `JobDetail.jsx` owns the withdraw confirmation modal and re-enables Apply Now after withdrawal. `DashboardCompany.jsx` drops the `withdrawn` status mapping and tightens its terminal-status set. `Jobs.jsx` gains a modern top search bar (4 fields, skill autocomplete via `/skills?search=`, recent-search chips persisted in localStorage, per-field clear buttons, search icon) + the sidebar loses its duplicate Keyword/Skills/Location groups and its internal scrollbar.
  - **Swagger:** `/candidates/applications/list` description rewritten with three filter-shape examples (active-tab, withdrawn-tab, single-status).
  - **QA:** new candidate API tests (statuses + exclude_statuses + bad-value 4xx); new jobs API test (`company` filter narrows by name substring). Full Playwright suite continues to pass.
**Status:** Completed
**Commit:** *(this commit)*
**Notes:**
  - **No database migrations.** Every change is a filter / projection on existing columns.
  - The `is_applied` semantic change is a deliberate breaking nuance: it now means "active application", not "any application history". The `application_id` and `application_status` fields stay populated so the UI can still surface "previously withdrawn" copy if desired.
  - **Supersedes the withdraw-from-list affordance shipped in Step 44.** Step 44's in-list withdraw button + modal moved to JobDetail; Step 44's company-dashboard `withdrawn` pill mapping is also intentionally removed (employers should not see withdrawn rows at all).
  - Cache: guest payload on `/home` and per-route job lists may need a Redis flush after upgrading so the new `liveStats`/`is_applied` shapes are not served from stale cache (`DEL matchhire:home:payload:guest`).

---

### Step 51
**Date:** 2026-05-30
**Module:** UI/UX (Job card consistency)
**Purpose:** Standardise every job card across the project so cards in the same grid row have identical dimensions and the Apply button lines up perfectly. Restore the equal-height contract that was reversed in Step 48 in favour of an auto-height pass.
**Prompt Command (verbatim, abbreviated):**
> Standardize all Job Cards. Every card must have same width, height, spacing, alignment. Equal-height grid rows. Reserved title (max 2 lines), description (max 2–3 lines), skills section, footer. Apply / Applied / Manage / View Applications all line up. Refactor to one reusable BaseJobCard + CandidateJobCard + CompanyJobCard wrappers. Do NOT change matching logic, application flow, APIs, database, or any other functionality.
**Expected Output:**
  - **Single shared component preserved** — confirmed `components/JobCard.jsx` is the only job-card design; all 11 importers (Home, Jobs, JobDetail, Favorites, SavedJobs, DashboardCandidate, DashboardCompany, CompanyDetail, CandidateApplications, MatchingJobsCarousel, JobCard itself) already use it.
  - **New thin wrappers** for role-explicit usage: `CandidateJobCard.jsx` and `CompanyJobCard.jsx` pre-bind the `viewer` prop. `DashboardCompany.jsx` migrated to `CompanyJobCard` as the first canonical caller.
  - **CSS restored** to the equal-height contract: `.jobs-grid` back to `align-items:stretch` + `> *{height:100%}`, `.card-shell` back to `min-height:340px;height:100%`, reserved min-heights on `.job-title` (48px), `.job-summary` (36px), `.trust-row` (22px), `.job-meta-row` (22px), `.why-list` (60px), `.job-tags` (22px). Mobile breakpoints already collapse the floor.
  - **JobCard.jsx restored to always-render** the meta-row, tags, why-list and summary slots (the May-2027 conditional-render branches removed). `WhyRecommended` is `aria-hidden` when empty; the description paragraph emits a single space so the 36px slot is reserved even on jobs with no body copy.
  - **QA test rewritten**: `qa/e2e/ui/job-card-layout.spec.js` swaps the blank-band tolerance check for the equal-row-heights assertion (the contract introduced in Step 38, then dropped in Step 48, is back).
**Status:** Completed
**Commit:** *(this commit)*
**Notes:**
  - **Supersedes Step 48's auto-height contract.** Step 48 was the explicit response to "remove large blank areas"; this step reverses that decision in favour of "every card identical size, Apply button aligned". Both instructions were the user's at different points — the equal-height contract now wins.
  - **No changes to logic, APIs, or DB.** This is pure UI/UX layout. Every callsite continues to fetch + render identically; only the visual rendering rules changed.
  - The hero mini-cards on Home (`.hero-card`) and the row-style Withdrawn Applications cards (`.withdrawn-card`) are intentionally NOT JobCards — they're separate surfaces (hero collage tiles and table-style record rows respectively) and don't participate in the job-card grid contract.

---

### Step 52
**Date:** 2026-05-31
**Module:** UI/UX (Salary display + Dashboard card consistency)
**Purpose:** Display every salary as a monthly figure with full locale formatting; render the Withdrawn Applications tab through the same shared `<JobCard />` used on the Jobs page so candidate-dashboard cards no longer look "empty or different".
**Prompt Command (verbatim, abbreviated):**
> Change salary display to monthly everywhere ("PKR 500,000/month", not "PKR 6,000,000/year"). Keep DB data intact — convert only for UI. If period is monthly, display directly; if annual, monthly = annual / 12. Apply across Home, Jobs, Search, Recommended, Similar, Saved, Favourites, Candidate Dashboard, Company Dashboard, Job Detail, Related Jobs. Use the same rich JobCard for Job Applications + Withdrawn Applications tabs.
**Expected Output:**
  - **Centralised salary formatter** in `Frontend/src/api/adapters.js`. New signature `formatSalary(min, max, currency, period)`:
    - Honours `salary_period` (`'month'` / `'monthly'` → as-is; everything else → divide by 12).
    - Locale thousands separators ("PKR 500,000", not "500K").
    - Currency symbol mapping: USD → "$", every other ISO code prefixed (PKR, EUR, GBP, INR, AED, SGD, AUD).
    - Range shape: `PKR 100,000 – 150,000/month`; single-sided: `From …` / `Up to …`; empty: `Competitive`.
    - Exported so other surfaces import from `api/adapters.js` rather than maintaining local copies.
  - **`toJobCardShape`** now passes `j.salary_period` into the formatter so candidate + employer cards both render monthly.
  - **`components/MatchingJobsPanel.jsx`** + **`components/MatchingJobsCarousel.jsx`**: their local `formatSalary` copies (with "K / year" shorthand) deleted; they import from the central helper.
  - **`pages/CandidateWithdrawn.jsx`** rewritten to render through `<JobCard />` inside a `.jobs-grid` — same design as the Jobs page. The previous custom `.withdrawn-card` row-style layout retired. The page now wraps each card in `.application-card-wrap` with a Withdrawn pill + Applied / Withdrawn dates above and a Reapply CTA below, matching the active Applications tab pattern.
  - **`Backend/src/repositories/application.repository.js:listForCandidate`**: SELECT now includes `j.description` so the JobCard summary slot has real content on the candidate's Applications + Withdrawn tabs (same data shape the Jobs page already has).
  - **`Frontend/src/styles.css`**: the retired `.withdrawn-card` / `.withdrawn-list` / `.withdrawn-meta` rule set removed (with its responsive overrides) — the new card design uses the existing `.jobs-grid` and `.application-card-wrap` rules.
**Status:** Completed
**Commit:** *(this commit)*
**Verification:**
  - Live API smoke against the dev DB confirms `PKR 32,000,000 / year → PKR 2,666,700 – 4,166,700/month` and `PKR 1,200,000 / year → From PKR 100,000/month` (matches the user's worked examples).
  - `vite build` clean. Backend `require('./src/app')` clean.
  - Full Playwright suite: see commit body.
**Notes:**
  - **No business-logic changes.** Salary storage, matching, application flow, search filters, and APIs are untouched. Candidate `preferences.salary_min` / `salary_max` continue to mean "annual" because that's how the data was entered; the change is purely display-side.
  - The candidate Preferences page input field still asks for annual salary (no copy change needed since the user's spec applies only to *display* surfaces). If product later wants the input to also be monthly, the Onboarding wizard would need a copy change — not part of this step.
  - **Supersedes Step 33's "K shorthand" salary format** that landed via the job-card UI redesign; both Step 33 and Step 47's "From $90K" / "Up to $200K" / "$120K–180K" forms are replaced with the full-locale monthly shape.

---

### Step 53
**Date:** 2026-05-31
**Module:** UI/UX + Seeded-data hygiene + Git safety
**Purpose:** Localise the Jobs salary filter to PKR/month, stop the bulk seeds from polluting `candidate_profiles.education` with synthesised strings, collapse the empty `why-list` band on dashboard cards, and re-verify Git author identity.
**Prompt Command (verbatim, abbreviated):**
> 1. Jobs page salary range still shows USD "$". Switch to PKR/month (display only; do not change DB values). 2. Candidate education shows system/default data — must show only the logged-in user's saved education. 3. Dashboard job cards still have empty space below the Onsite/Remote/Hybrid chip; make them identical to Jobs-page cards. 4. Company view rules unchanged. 5. Verify git author is Azeem Akram and no Claude/Codex appears on contributors.
**Expected Output:**
  - **Salary filter** (`Frontend/src/pages/Jobs.jsx`): `SALARY_BANDS` rewritten — `$50K – $80K (year)` etc. replaced with `PKR 50,000 – 100,000 / month` etc. The numeric `min`/`max` sent to the API are the PKR-annual equivalents (× 12) so the existing repository range comparison continues to match PKR-annual rows out of the box.
  - **Seed pollution removed**: `seed.bulk.js` and `seed.industries.js` now insert `NULL` into `candidate_profiles.education` instead of synthesised "BS in X · Y University · YYYY" strings. New utility `Backend/src/database/scripts/clear-seeded-education.js` clears existing seeded rows (dry-run by default, `--apply` to commit). 220 rows cleared from the dev DB on this run; idempotent.
  - **Empty `why-list` slot collapsed** when the card carries no match content (`.why-list-empty { min-height:0; max-height:0; margin-bottom:0 }`). On Jobs page (matched cards) the 60px slot stays reserved; on the Applications / Saved / Favourites / Withdrawn surfaces (no match scoring) it collapses, removing the blank band the user reported below the work-mode chip.
  - **Git safety re-checked**: local + global identity remain `Azeem Akram <azeembscs86@gmail.com>` from Step (git-author rewrite). No `Co-Authored-By:` trailers in this commit.
**Status:** Completed
**Commit:** *(this commit)*
**Notes:**
  - **No database migrations.** The cleanup is a one-off UPDATE via the new script; existing schema unchanged.
  - **Salary filter caveat**: the filter is still currency-blind on the backend (raw numeric comparison against `salary_min`/`salary_max`). A PKR-monthly filter matches PKR-annual jobs cleanly via × 12, but USD-stored jobs won't match unless the candidate types matching numeric bounds in USD. Currency-aware filtering is a follow-up improvement, separate from this step.
  - **Synthetic-pattern set** in `clear-seeded-education.js` is explicit (5 patterns from the two bulk seeds). Any future synthetic-education shape must be added to the `PATTERNS` array before the next bulk seed → cleanup cycle.
  - **Supersedes nothing** — additive UI/UX + data-hygiene change.

---

### Step 54
**Date:** 2026-05-31
**Module:** Application workflow + Rejection feedback
**Purpose:** Tighten the candidate-side application surface (rename, 6-card summary, live withdrawn count, mandatory rejection reasons with candidate-visible feedback + improvement suggestions).
**Prompt Command (verbatim, abbreviated):**
> Rename "Job Applications" → "My Applications" everywhere. Add 6 summary cards (Total / Under Review / Shortlisted / Interview Scheduled / Accepted / Rejected) with auto-updating counts. Withdrawn tab gets a live count badge in the sidebar; withdraw button stays off the list. Add `Interview Scheduled` status label. Make rejection reason mandatory (canonical list + "Other" with custom text). Display rejection reason + tailored improvement suggestions on the rejected card. Don't break apply / save / favourite / withdraw / dashboard logic.
**Expected Output:**
  - **Backend:**
    - `Backend/src/validators/employer.validator.js`: `rejectionReason` is now `{ reason: Joi.valid(<canonical keys>).required(), custom_reason: required when reason === 'other' }`. New `REJECTION_REASON_KEYS` export keeps frontend + backend in sync.
    - `Backend/src/controllers/employer.controller.js#rejectApplication`: composes the stored value — canonical key for the listed reasons, `other:<custom text>` for the free-text branch — so a future schema change isn't needed.
    - `Backend/src/repositories/application.repository.js#listForCandidate`: SELECT now includes `a.rejection_reason` so the candidate sees the reason on rejected rows.
  - **Frontend:**
    - **Rename** "Job Applications" → "My Applications" in `CandidateDashSidebar.jsx`, `DashboardCandidate.jsx` (recent-apps header), and `CandidateWithdrawn.jsx` (empty-state copy).
    - **Sidebar:** new `withdrawnTotal` badge wired from `stats.applications.by_status.withdrawn`. The active `appsTotal` badge now excludes withdrawn rows (matches the list's `exclude_statuses` contract) so the sidebar and the page agree.
    - **6 summary cards** on `CandidateApplications.jsx`: Total / Under Review / Shortlisted / Interview Scheduled / Accepted / Rejected. `rollupStats` rewrites the by-status map into the new buckets (`interview` → Interview Scheduled, `accepted+offered+hired` → Accepted). New `.applications-summary` CSS grid collapses 6 → 3 → 2 → 1 across breakpoints.
    - **Label unification**: `interview` is rendered as "Interview Scheduled" on the Applications page status badge to match the overview page.
    - **Rejection feedback** on each rejected row: a coral-tinted panel below the JobCard shows the canonical reason label + the rejected-date + a tailored list of improvement suggestions. New `Frontend/src/data/rejection-reasons.js` owns the canonical list (key + label + 3 suggestions) and a `parseRejectionReason` decoder that handles both the canonical-key and `other:<text>` storage shapes (plus legacy free-text rows).
  - **QA:** new `qa/api/candidates.test.js` block "Employer reject-application contract" — proves the validator rejects empty / non-canonical / missing-custom_reason payloads and accepts valid canonical + valid "other" submissions. 8/8 candidates API tests pass; full API suite 23/23.
**Status:** Completed
**Commit:** *(this commit)*
**Notes:**
  - **No DB migrations.** The `rejection_reason` column already exists at VARCHAR(500); the storage shape change (key vs free text) is convention-only.
  - **Withdraw button stays off the My Applications list** — that was set in Step 50 and remains the rule. The withdraw flow lives on the Job Detail page.
  - **The "Interview Scheduled" status** uses the existing `interview` enum value — no migration. Display copy is unified across the candidate dashboard.
  - **Improvement suggestions are static + reason-keyed today.** Each canonical key carries 3 hand-curated suggestions in `data/rejection-reasons.js`; a future AI generator can swap the suggestions array on a per-candidate basis without changing the parse layer.
  - **Counts auto-update**: `CandidateApplications.jsx`, `DashboardCandidate.jsx`, and `CandidateDashboardLayout.jsx` all fetch `/candidates/dashboard/stats` on mount; the sidebar badge + summary cards both consume the same shape, so any successful apply / withdraw refetch propagates everywhere.

---

### Step 55
**Date:** 2026-05-31
**Module:** Candidate Dashboard UX overhaul
**Purpose:** Make the candidate dashboard easier to read at a glance, give withdrawals a clean inline path from the My Applications list, surface rejection feedback in a dedicated tab, move profile-strength into the sidebar, replace the four legacy stat cards with six clickable summary tiles, and (per the user's explicit request) rebuild the Preferences scroll-tracker on IntersectionObserver.
**Prompt Command (verbatim, abbreviated):**
> Standardise dashboard job cards (Favs/Saved match Jobs page). My Applications: replace "Applied" with "Withdraw Application" + confirmation modal. New Rejected Applications tab with rejection reason + suggestions. Remove My Applications list from Overview. Move Profile Strength under candidate avatar in left sidebar. Six clickable summary cards (Applications / Saved Jobs / Shortlisted / Interviews / Withdrawn / Rejected). Remove Favourites from header. Fix Preferences tab active-state on scroll using IntersectionObserver.
**Expected Output:**
  - **Card consistency:** `.why-list-empty` reservation restored (60px slot) so Favs / Saved / Applications / Withdrawn / Rejected cards match Jobs-page card height. Supersedes the May 2031 collapse.
  - **JobCard:** new `onWithdraw` + `withdrawingId` props. When supplied (and `applied=true`), the green "Applied" pill is replaced with a "Withdraw Application" outline CTA; clicking emits the event so the caller owns the confirmation + API call.
  - **My Applications:** wires `onWithdraw` to a `.confirm-overlay` modal, optimistic remove on success, inline success/failure notice, summary-card refetch.
  - **New Rejected Applications page** (`Frontend/src/pages/CandidateRejected.jsx`) + `/dashboard/candidate/rejected` route. Renders rejected rows through the shared JobCard with the `.rejection-feedback` panel below (reason label + improvement suggestions). Sidebar gains a "Rejected Applications" entry with a live count badge from `stats.applications.by_status.rejected`.
  - **Sidebar:** new `.dash-side-strength` widget renders the profile-strength % + progress bar + "Complete profile →" CTA (when <80%) directly under the user identity. Available on every dashboard tab via `CandidateDashboardLayout` + the overview page's own sidebar mount.
  - **Overview rebuild:** old `.stat-row` (4 cards) + inline `My Applications` list both removed. New `.overview-summary` grid renders six `<Link>` tiles: Applications · Saved Jobs · Shortlisted · Interviews · Withdrawn · Rejected. Each navigates to its dedicated tab; Shortlisted / Interviews append `?status=…` so a future list-scope feature can hook in without churn.
  - **Favourites removal from header:** verified — Step 49 (`776e54d`) already removed the desktop heart + the mobile drawer Saved-jobs link. Only documentary comments remain.
  - **Preferences scroll:** rewritten on IntersectionObserver. Defines a thin trigger band via `rootMargin: '-15% 0px -75% 0px'`. The LAST intersecting section (document order) wins; a scroll-position fallback handles "above first" / "below last" edges. Click-lock (700 ms) preserved so smooth-scroll doesn't flicker. Preferences-scroll spec: 4/4 pass.
**Status:** Completed
**Commit:** *(this commit)*
**Notes:**
  - **Supersedes Step 57's `.why-list-empty` collapse** — the user's "0 visual difference between dashboard cards and Jobs page" requirement directly conflicts with Step 57's "remove the empty band below work-mode". Both instructions were the user's; the current explicit "0 visual difference" wins. To get BOTH (consistent height AND no empty band), a follow-up should add match-score decoration to favourites + saved-jobs API responses so the why-list actually populates.
  - **Supersedes Step 50's Preferences scroll-listener tracker** — same problem space, different implementation. Both pass the QA spec; IntersectionObserver is the API the user explicitly asked for.
  - **No DB / API contract changes.** Sidebar badges + summary cards consume the existing `/candidates/dashboard/stats` shape.
  - **interviewsTotal** local in `DashboardCandidate.jsx` was reduced to a comment marker — the count is now read directly from `stats.applications.by_status.interview` on the summary card.

---

*End of document. Append the next prompt as Step 56.*
