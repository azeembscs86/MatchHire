# MatchHire QA Automation

End-to-end QA suite covering API contracts, UI behaviour,
accessibility, responsive layout, and Lighthouse performance
audits. Built on Playwright + Jest + Supertest + axe-core.

## Folder layout

```
qa/
  e2e/
    auth/         Login / logout flows on the AuthModal
    candidate/    Candidate-role page flows (dashboard, similar feed, messaging)
    company/      Employer-role page flows (dashboard, postings)
    jobs/         JobCard contract on the public Jobs page
    navigation/   Curated crawl + dynamic internal-link integrity
    smoke/        Fast happy-path checks on Home
    ui/           Accessibility (axe) + responsive layout
  api/            Jest + Supertest API tests
  helpers/
    auth.helper.js        login + token injection
    navigation.helper.js  console/network trackers + link discovery
    screenshot.helper.js  on-demand labelled screenshots
    validation.helper.js  reusable DOM assertions
    env.js                shared env access (loads .env.qa + Backend dotenvs)
    api-client.js         Supertest wrapper for the Jest suite
    wait-for-ready.js     orchestrator readiness probe
    jest-setup.js
  fixtures/users.json     reference of seeded test users (mirrors test-data/users.js)
  reports/                Generated artefacts (HTML report, screenshots, traces)
  screenshots/            Manual screenshot drops (per-spec subfolders)
  videos/, traces/        Artefact buckets (Playwright also writes under reports/test-artifacts)
  scripts/                Orchestrator + lighthouse + report consolidator
  test-data/              Canonical QA users + seeder
  .env.qa                 QA defaults (committed; no real secrets)
  jest.config.js
  playwright.config.js
```

## One-time setup

```bash
# At the repo root
npm install                       # installs root devDeps incl. Playwright + start-server-and-test
npm install --prefix Backend
npm install --prefix Frontend
npx playwright install chromium   # pulls the browser binary (~250 MB)

# Seed the canonical QA test users + a peer candidate
npm run qa:seed
```

## Running

```bash
# Auto-starts backend+frontend (reuses what's already up) and runs the e2e suite.
npm run qa:e2e

# Or explicitly:
npm run qa:start            # alias for `PW_AUTO_START=1 qa:e2e`
npm run qa:headed           # same suite, visible browser
npm run qa:debug            # PWDEBUG=1 — opens the Playwright Inspector

# Sub-suites:
npm run qa:smoke            # only @smoke tests
npm run qa:accessibility    # only @a11y tests
npm run qa:matrix           # adds firefox/webkit/tablet/mobile projects

# API + lighthouse + orchestrator:
npm run qa:api              # Jest + Supertest
npm run qa:lighthouse       # Lighthouse audits of key public pages
npm run qa:report           # Re-build the consolidated HTML/JSON summary
npm run qa:report:open      # Open Playwright's HTML report in a browser
npm run qa:full             # Full sweep (servers + seed + api + e2e + lighthouse + report)
```

## Test users

Defined in [`qa/test-data/users.js`](./test-data/users.js) and
mirrored in [`qa/fixtures/users.json`](./fixtures/users.json):

| Role       | Email                                  | Password         |
|------------|----------------------------------------|------------------|
| candidate  | `qa-candidate@matchhire-qa.com`        | `QaTest@1234!`   |
| peer       | `qa-peer-candidate@matchhire-qa.com`   | `QaTest@1234!`   |
| employer   | `qa-company@matchhire-qa.com`          | `QaTest@1234!`   |
| admin      | `qa-admin@matchhire-qa.com`            | `QaTest@1234!`   |

Override via env (`QA_CANDIDATE_EMAIL`, `QA_TEST_PASSWORD`, etc.) when CI needs different accounts.

## What's covered today

**E2E (Playwright)**
- `auth/login.spec.js`         — modal opens, invalid creds alert, valid sign-in,
                                  password show/hide, forgot-password link
- `auth/logout.spec.js`        — sign-out flips header back to guest
- `candidate/candidate-flow.spec.js` — Similar Professionals + message content filter
- `candidate/dashboard.spec.js`      — Welcome heading + Edit profile CTA
- `company/dashboard.spec.js`        — Hiring heading + stat row + Post new job CTA
- `jobs/job-cards.spec.js`     — work-mode badge, card click, button non-bubbling
- `navigation/crawl.spec.js`   — curated route crawl
- `navigation/links.spec.js`   — dynamic link discovery + integrity walk
- `smoke/home.spec.js`         — home renders + no console errors
- `ui/accessibility.spec.js`   — axe-core WCAG 2A+2AA, critical = blocking
- `ui/responsive.spec.js`      — desktop/tablet/mobile viewport + no horizontal overflow

**API (Jest + Supertest)** — `qa/api/`
- Auth login for all roles + bad-credential rejection
- Jobs list contract, work_mode never empty, expired filtered
- Candidates list + similarity gate + message content filter
- Home payloads (guest + candidate)

**Lighthouse** — `qa/scripts/lighthouse.js` — Performance, A11y, Best Practices, SEO.

## Auth pattern for new authenticated tests

```js
const { test, expect } = require('@playwright/test');
const { authenticatePage } = require('../../helpers/auth.helper');

test.beforeEach(async ({ page }) => {
  await authenticatePage(page, 'CANDIDATE'); // or 'COMPANY' / 'ADMIN'
});
```

The helper hits `/auth/login` via `apiRequestContext`, then injects
tokens into the SPA's localStorage via `addInitScript` so the
session is live BEFORE any page JS runs. No reload dance, no
cross-context storage handoff.

## Tag-based filtering

| Tag          | Run with                                              |
|--------------|-------------------------------------------------------|
| `@smoke`     | `npm run qa:smoke`                                    |
| `@a11y`      | `npm run qa:accessibility`                            |
| `@candidate` | `npx playwright test --config qa/playwright.config.js --grep @candidate` |
| `@company`   | `npx playwright test --config qa/playwright.config.js --grep @company`   |
| `@ui`        | `npx playwright test --config qa/playwright.config.js --grep @ui`        |

## Environment variables

Default values live in `qa/.env.qa` (committed). Shell exports
override the file values. The order of precedence is:

```
shell exports → qa/.env.qa → Backend/.env.local → Backend/.env
```

| Variable             | Default                                | Purpose                              |
|----------------------|----------------------------------------|--------------------------------------|
| `FRONTEND_URL`       | `http://localhost:5173`                | SPA base URL (alias: `QA_BASE_URL`)  |
| `BACKEND_URL`        | `http://127.0.0.1:3500/api/v1`         | API base URL (alias: `QA_API_URL`)   |
| `PW_AUTO_START`      | `1`                                    | Auto-start backend+frontend          |
| `PW_FULL_MATRIX`     | `0`                                    | Enable firefox/webkit/tablet/mobile  |
| `QA_TEST_PASSWORD`   | `QaTest@1234!`                         | Shared QA-user password              |

## Reports & artefacts

```
qa/reports/
  qa-report.html          ← consolidated dashboard (start here)
  qa-report.json
  html/                   ← Playwright HTML report
  test-artifacts/         ← per-test screenshots, videos, traces (on failure)
  lighthouse/             ← per-route Lighthouse HTML + JSON
  lighthouse-summary.json
  playwright.json
qa/screenshots/           ← ad-hoc screenshots from screenshot.helper.js
qa/videos/, qa/traces/    ← convenience buckets (Playwright also writes under reports/test-artifacts)
```

Open the consolidated report with `open qa/reports/qa-report.html`
or `npm run qa:report:open` for the Playwright viewer.

## Extending the suite

**Adding an authenticated spec** — drop a new `*.spec.js` into the
appropriate `qa/e2e/<role>/` folder. Use `authenticatePage` from
`qa/helpers/auth.helper.js`. Tag the test (`test('@candidate X',
...)`) so CI can run subsets.

**Adding a route to the crawler** — append to `ROUTES` in
`qa/e2e/navigation/crawl.spec.js`. The link-integrity walker in
`navigation/links.spec.js` discovers routes dynamically — add an
entry to `SKIP_PATTERNS` if a route should be excluded.

**Adding a Lighthouse route** — append to `ROUTES` in
`qa/scripts/lighthouse.js`.

## Known limitations

- The dependency footprint is heavy (Playwright + Lighthouse).
  CI containers should cache `~/.cache/ms-playwright` and the
  npm cache between runs.
- The matrix run (`qa:matrix`) is opt-in. The default suite uses
  Desktop Chrome only — fast feedback for development, full
  matrix in CI.
- Lighthouse needs a system Chrome binary; the runner gracefully
  no-ops if `chrome-launcher` isn't installed yet.
