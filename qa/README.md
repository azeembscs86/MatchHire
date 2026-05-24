# MatchHire QA Automation

End-to-end QA suite covering API contracts, UI behaviour,
accessibility, and Lighthouse performance audits.

## Folder layout

```
qa/
  api/          Jest + Supertest API tests
  e2e/          Playwright e2e (incl. axe-core a11y)
  helpers/      Shared utilities (api-client, env, auth-ui)
  reports/      Generated artefacts (HTML report, screenshots, traces)
  screenshots/  Manual screenshot drops; per-test screenshots live in reports/
  scripts/      Orchestrator + lighthouse + report consolidator
  test-data/    Canonical QA users + seeder
  jest.config.js
  playwright.config.js
```

## One-time setup

```bash
# At the repo root
npm install                       # installs root devDeps incl. Playwright
npm install --prefix Backend      # if you haven't already
npm install --prefix Frontend
npx playwright install chromium   # pulls the browser binary (~250 MB)

# Seed the three QA test users into your local DB
npm run qa:seed
```

The seeder uses your `Backend/.env.local` DB credentials and
upserts the three accounts (candidate / employer / admin) with a
known password. Re-runnable safely.

## Test users

Defined in [`qa/test-data/users.js`](./test-data/users.js):

| Role      | Email                          | Password         |
|-----------|--------------------------------|------------------|
| candidate | `qa-candidate@matchhire.test`  | `QaTest@1234!`   |
| employer  | `qa-company@matchhire.test`    | `QaTest@1234!`   |
| admin     | `qa-admin@matchhire.test`      | `QaTest@1234!`   |

Override via env vars (`QA_CANDIDATE_EMAIL`, `QA_TEST_PASSWORD`,
etc.) when CI needs different accounts.

## Running

```bash
# Full sweep (starts servers if needed, runs everything, writes HTML report)
npm run qa:full

# Or run pieces individually (assumes dev servers are up):
npm run qa:api            # Jest + Supertest
npm run qa:e2e            # Playwright e2e
npm run qa:accessibility  # Playwright tests tagged @a11y
npm run qa:lighthouse     # Lighthouse audits of key public pages
npm run qa:report         # Re-build the consolidated HTML report
```

## What's covered today

**API (Jest + Supertest)** — `qa/api/`
- Auth: login for all 3 roles, /me, bad-credential rejection.
- Jobs: /jobs list contract, work_mode never empty, expired
  jobs filtered, work_mode filter narrows correctly.
- Home: guest payload shape, candidate enrichment payload shape.
- Candidates: public list shape, 404 on missing id,
  /candidates/similar role gate, /candidates/:id/message content
  filter, /employers/recommended-candidates role gate.

**E2E (Playwright)** — `qa/e2e/`
- `home.spec.js`         — home renders, recommended rail has cards, no console errors.
- `job-cards.spec.js`    — every card has a work-mode badge,
  whole card opens job detail, action buttons don't bubble.
- `candidate-flow.spec.js` — candidate viewer sees "Similar
  Professionals" not the full list; MessageModal blocks
  inappropriate content.
- `crawl.spec.js`        — shallow crawl of the top 6 routes;
  no broken pages, no console errors.
- `accessibility.spec.js` (`@a11y`) — axe-core scan of the top 4
  routes, fails on serious/critical WCAG 2A+2AA violations.

**Lighthouse** — `qa/scripts/lighthouse.js`
- Audits Home / Jobs / Companies for performance, a11y, best
  practices, SEO. Writes per-route HTML + a summary JSON the
  report consolidator picks up.

## Tag-based filtering

Playwright specs use grep tags so you can run subsets:

| Tag           | Run with                           |
|---------------|------------------------------------|
| `@smoke`      | `npx playwright test --grep @smoke` |
| `@a11y`       | `npm run qa:accessibility`          |
| `@candidate`  | `npx playwright test --grep @candidate` |
| `@company`    | `npx playwright test --grep @company`   |

## Reports & artefacts

After `qa:full` (or any individual run):

```
qa/reports/
  qa-report.html          ← consolidated dashboard (start here)
  qa-report.json
  html/                   ← Playwright HTML report
  test-artifacts/         ← failure screenshots, videos, traces
  lighthouse/             ← per-route Lighthouse HTML + JSON
  lighthouse-summary.json
  playwright.json
```

Open the consolidated report with `open qa/reports/qa-report.html`.

## Extending the suite

**Adding an API test** — drop a new `*.test.js` into
`qa/api/`. Import `newClient` / `login` from
`../helpers/api-client`. Tests run serially within a worker;
keep them independent.

**Adding an e2e test** — drop a new `*.spec.js` into
`qa/e2e/`. Use `loginViaAPI(page, 'CANDIDATE')` from
`../helpers/auth-ui` for authenticated flows. Tag the test
(`test('@smoke X', ...)`) so CI can run subsets.

**Adding a route to the crawler** — append to `ROUTES`
in `qa/e2e/crawl.spec.js`. The accessibility scanner has its own
`AUDIT_ROUTES` list inside `accessibility.spec.js`.

**Adding a Lighthouse route** — append to `ROUTES` in
`qa/scripts/lighthouse.js`.

## Known limitations

- The dependency footprint is heavy (Playwright + Lighthouse).
  CI containers should cache `~/.cache/ms-playwright` and the
  npm cache between runs.
- The crawler is curated, not dynamic. A future improvement is
  a discovery pass that walks every `<a href="/...">` on the
  page and visits each, but that flakes more easily than a
  curated list.
- The candidate-flow test depends on similarity seeds being
  in place. If `qa:seed` is run against a fresh DB with no
  other candidates, the message test self-skips.
- Lighthouse needs a system Chrome binary; the runner
  gracefully no-ops if `chrome-launcher` isn't installed yet.
