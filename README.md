# MatchHire

A curated career marketplace for senior talent and the companies smart
enough to hire them.

This repository contains the MatchHire web client, converted from the
original static HTML prototype into a modern React single-page
application.

```
.
├── Frontend/        React SPA (Vite + React Router)
└── README.md
```

## Quick start

```bash
cd Frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in Frontend/dist
```

For implementation details, see [Frontend/README.md](Frontend/README.md).

## Tech stack

| Layer        | Choice                              |
|--------------|-------------------------------------|
| Build tool   | Vite 5                              |
| UI library   | React 18                            |
| Routing      | React Router v6 (`BrowserRouter`)   |
| State        | React Context + Hooks               |
| Styling      | Hand-written CSS (no framework)     |
| Persistence  | `localStorage` for client-only data |

## Project status

Frontend-only. Forms, auth, and data are stubbed with mock fixtures and
client-side state. To productionise: wire forms to an API, replace the
auth modal with real OAuth/email flow, and persist favorites and
preferences server-side.
