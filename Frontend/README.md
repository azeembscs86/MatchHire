# MatchHire — Frontend

React SPA for the MatchHire career marketplace. Converted from the
original static HTML prototype with the design system preserved 1:1.

## Run it

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build locally
```

Node 18+ is recommended.

## Folder layout

```
Frontend/
├── index.html              Vite entry HTML
├── vite.config.js          Vite + React plugin config
├── package.json
└── src/
    ├── main.jsx            App bootstrap (mounts React, providers, router)
    ├── App.jsx             Route table for the SPA
    ├── styles.css          Full design system (CSS variables + components)
    │
    ├── components/         Reusable presentational + chrome components
    │   ├── Layout.jsx          Persistent shell wrapping all routes
    │   ├── TopBar.jsx          Ink-black utility bar above the main nav
    │   ├── Header.jsx          Sticky primary navigation
    │   ├── Logo.jsx            Brand mark + word mark, links to home
    │   ├── Footer.jsx          Global footer with site links
    │   ├── AuthModal.jsx       Sign-in / sign-up overlay
    │   ├── DashboardDropdown.jsx  Top-right Dashboards menu
    │   ├── JobCard.jsx         Single job card with save toggle
    │   ├── CompanyCard.jsx     Single company card
    │   └── CandidateCard.jsx   Single candidate card
    │
    ├── context/            Cross-cutting client state (React Context)
    │   ├── AuthModalContext.jsx    Drives the auth overlay
    │   └── FavoritesContext.jsx    Saved-jobs set, persisted to localStorage
    │
    ├── data/               Static mock fixtures (stand-ins for an API)
    │   ├── jobs.js
    │   ├── companies.js
    │   ├── candidates.js
    │   └── priorities.js
    │
    └── pages/              One file per route, mounted by App.jsx
        ├── Home.jsx
        ├── Jobs.jsx
        ├── Companies.jsx
        ├── Candidates.jsx
        ├── Profile.jsx
        ├── Preferences.jsx
        ├── Favorites.jsx
        ├── EmployerOnboarding.jsx
        ├── DashboardCandidate.jsx
        ├── DashboardCompany.jsx
        └── DashboardAdmin.jsx
```

## Routes

| Path                      | Page                  | Notes                                |
|---------------------------|-----------------------|--------------------------------------|
| `/`                       | `Home`                | Hero, search, recommended jobs       |
| `/jobs`                   | `Jobs`                | Filter sidebar + listing             |
| `/companies`              | `Companies`           | Company grid                         |
| `/candidates`             | `Candidates`          | Top-rated talent grid                |
| `/profile`                | `Profile`             | Candidate profile builder            |
| `/preferences`            | `Preferences`         | Priority ranking + match weighting   |
| `/favorites`              | `Favorites`           | Saved jobs + collections + insights  |
| `/employer-onboarding`    | `EmployerOnboarding`  | Company verification flow            |
| `/dashboard/candidate`    | `DashboardCandidate`  | Candidate hub                        |
| `/dashboard/company`      | `DashboardCompany`    | Hiring funnel + applicants           |
| `/dashboard/admin`        | `DashboardAdmin`      | Platform admin console               |

## State model

State is intentionally lightweight — only what the UI actually needs.

* **`FavoritesContext`** — a `Set` of job indexes, persisted to
  `localStorage` under `matchhire:savedJobs`. Hydrated synchronously on
  first render so cards render with the right heart state. Exposes
  `toggleSave(idx)`, `isSaved(idx)`, and `count`.
* **`AuthModalContext`** — controls whether the auth modal is open and
  which tab (`signin` | `signup`) is active. Exposes `openAuth(mode)`,
  `closeAuth()`, and `switchTab(mode)`.
* **Local component state** — preferences ranking, sliders, toggles,
  skill pills, and deal-breaker lists all live inside their owning page
  via `useState`. Nothing exotic; nothing global it doesn't need to be.

## Design system

The original `assets/styles.css` is preserved verbatim in
[src/styles.css](src/styles.css). Theme tokens live in the `:root` block
at the top — edit colours, shadows, and spacing there.

Typography: Fraunces (display, serif) + Geist (body, sans), loaded from
Google Fonts in `index.html`.

## Going from prototype to production

1. **API** — replace the mock fixtures in `src/data/` with a thin client
   that talks to your backend. Keep the export shape so consumers don't
   change.
2. **Auth** — swap the demo `alert(...)` in `components/AuthModal.jsx`
   for real OAuth + email flow, and persist the session somewhere
   sensible (e.g. an `AuthContext`).
3. **Persistence** — move favorites and preferences off `localStorage`
   onto the API. Keep `FavoritesContext` as the call site; only the
   provider internals change.
4. **Forms** — every form currently calls `e.preventDefault()` and
   shows an alert. Wire the submit handlers to real endpoints.
