# MatchHire — Frontend

React SPA for the MatchHire career marketplace. Talks to the
`Backend/` REST API for every piece of data; ships zero static
fixtures (besides a short list of priority labels in `src/data/`).

## Tech stack

- **React 18** + **react-router-dom** for the UI and client routing.
- **Vite** for dev server + production build.
- **axios** as the HTTP client, wrapped by a centralised module
  (`src/api/client.js`) that adds bearer auth, refresh-on-401, and
  envelope unwrapping.
- **Context** for cross-cutting state (`AuthContext`,
  `AuthModalContext`, `FavoritesContext`).
- Vanilla CSS modules with the original design tokens — no UI library.

## Run it

```bash
cp .env.example .env.local         # set VITE_API_BASE_URL if needed
npm install
npm run dev                        # http://localhost:5173
```

The backend must be running on whatever `VITE_API_BASE_URL` points to
(default `http://localhost:3500/api/v1`). See [`../Backend/README.md`](../Backend/README.md).

## Folder layout

```
src/
├── api/
│   ├── client.js          axios instance + token store + envelope unwrap
│   ├── adapters.js        view-model adapters (backend record → card prop shape)
│   ├── auth.js            wrappers for /auth/*
│   ├── public.js          wrappers for /public/*
│   ├── candidates.js      wrappers for /candidates/*
│   ├── employers.js       wrappers for /employers/*
│   ├── admin.js           wrappers for /admin/*
│   └── index.js           public surface (one import for any page)
├── components/
│   ├── AsyncState.jsx     Loading / Error / Empty state helpers
│   ├── AuthModal.jsx      sign-in / sign-up overlay (calls AuthContext)
│   ├── DashboardDropdown.jsx
│   ├── Footer.jsx / Header.jsx / Layout.jsx / Logo.jsx / TopBar.jsx
│   ├── JobCard.jsx / CompanyCard.jsx / CandidateCard.jsx
│   └── ProtectedRoute.jsx role-gated route wrapper
├── context/
│   ├── AuthContext.jsx       session, login/register/logout, user state
│   ├── AuthModalContext.jsx  open/close + active tab for the auth overlay
│   └── FavoritesContext.jsx  API-backed saved-jobs set
├── data/
│   └── priorities.js         static config: priority labels (not user data)
├── pages/                    one file per route
│   ├── Home.jsx / Jobs.jsx / Companies.jsx / Candidates.jsx
│   ├── Profile.jsx / Preferences.jsx / Favorites.jsx
│   ├── EmployerOnboarding.jsx
│   └── DashboardCandidate.jsx / DashboardCompany.jsx / DashboardAdmin.jsx
├── App.jsx                   route table (public + ProtectedRoute groups)
├── main.jsx                  provider chain + ReactDOM.createRoot
└── styles.css                design system tokens + component CSS
```

## API client

Everything HTTP-related is in `src/api/`. The barrel `src/api/index.js`
re-exports the typed-ish wrappers so a page can just write:

```js
import { publicApi, candidatesApi, employersApi, adminApi, authApi } from '../api';
```

`call(...)` (used inside every wrapper) unwraps the MatchHire response
envelope into the `Data` payload and throws a clean `Error` carrying
`errors`/`httpStatus`/`status` on failure. Pages do not need to read
`res.data.Response.responseCode` themselves.

### Auth & token storage

`AuthContext` persists access + refresh tokens in `localStorage` under
the `matchhire:*` namespace and re-validates the access token on first
mount by calling `POST /auth/me`. The axios response interceptor
transparently refreshes on a 401 once per request and dispatches
`matchhire:auth:logout` if refresh itself fails — `AuthContext`
listens and clears state so the rest of the tree re-renders into the
signed-out view.

### Protected routes

```jsx
<Route element={<ProtectedRoute roles={['candidate']} />}>
  <Route path="/profile" element={<Profile />} />
</Route>
```

While auth is hydrating, `ProtectedRoute` renders a light placeholder.
For unauthenticated visitors it pops the auth modal and bounces to `/`
without leaving the page tree.

## Dynamic navigation

The Header calls `GET /public/navigation` on mount (and whenever the
user changes). The backend returns `{ primary, actions, dashboard,
user }` with links tailored to the caller's role, so the menu adjusts
automatically — no client-side role branching needed for the link
list. Action buttons are still owned by the Header so they can wire to
`AuthContext.login/logout`.

## Adding a new page

1. Create the file under `src/pages/`. Use API helpers from
   `src/api/` for any data; do not import static fixtures.
2. Add a route to `App.jsx`. Wrap it in `<ProtectedRoute roles={[...]} />`
   if it requires authentication.
3. Use `LoadingState`, `ErrorState`, `EmptyState` from
   `components/AsyncState.jsx` so the UX stays consistent.
4. If the page needs a new menu entry, add it to the backend's
   `services/public.service.js > navigation(user)` instead of the
   Header — the menu is dynamic.

## Environment

| Var | Default | What it does |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3500/api/v1` | Base URL of the backend. No trailing slash. |

Only variables prefixed `VITE_` are exposed to the browser. Put real
secrets in the backend `.env`, not here.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run start` | Same as preview, bound to `--host` |

## License

MIT
