/**
 * Centralised axios client for the MatchHire API.
 *
 * Responsibilities:
 *   - Build a singleton axios instance pointed at `VITE_API_BASE_URL`.
 *   - Attach the bearer token on every request (read from localStorage so
 *     it survives page reloads).
 *   - Automatically refresh the access token on a 401 once per request,
 *     using the stored refresh token. If refresh fails the session is
 *     cleared and a `matchhire:auth:logout` window event is dispatched so
 *     AuthContext can react.
 *   - Unwrap the MatchHire response envelope so callers receive `Data`
 *     directly (or `Errors` on validation failures).
 *
 * Token storage:
 *   - `localStorage` keys: `matchhire:access_token`, `matchhire:refresh_token`,
 *     `matchhire:user`.
 *   - Keep all reads/writes inside `tokens.*` so swapping to a more
 *     secure store (e.g. httpOnly cookies + a backend session endpoint)
 *     is a single-file change later.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3500/api/v1';

const STORAGE = {
  access: 'matchhire:access_token',
  refresh: 'matchhire:refresh_token',
  user: 'matchhire:user',
  // Sentinel that records which store actually owns the session.
  // Reads check localStorage first, then sessionStorage. Writes go
  // to one or the other based on the rememberMe flag and the
  // OPPOSITE store is wiped so the session is never duplicated.
  mode: 'matchhire:auth_mode',
};

/**
 * Token storage that supports two persistence modes:
 *
 *   rememberMe = true   -> localStorage (survives browser restart)
 *   rememberMe = false  -> sessionStorage (cleared on tab close)
 *
 * Reads transparently look up both stores so existing call sites
 * don't need to know which one is active. Writes are routed to the
 * correct store and the opposite one is cleared so we never end up
 * with stale tokens from a previous "remember me" preference.
 *
 * Plain passwords are NEVER stored — only the access + refresh
 * tokens issued by the backend.
 */
export const tokens = {
  getAccess: () => readEither(STORAGE.access),
  getRefresh: () => readEither(STORAGE.refresh),
  getUser: () => readEitherJSON(STORAGE.user),
  /** Returns 'local' (remember-me on) or 'session' (off) or null. */
  getMode: () => readEither(STORAGE.mode),
  isRemembered: () => readEither(STORAGE.mode) === 'local',
  /**
   * @param {object} payload
   * @param {string} [payload.access_token]
   * @param {string} [payload.refresh_token]
   * @param {object} [payload.user]
   * @param {boolean} [payload.rememberMe]   If omitted, keeps the
   *   currently-active store. If no store is active yet, defaults
   *   to session (rememberMe=false) — the safer choice.
   */
  set: ({ access_token, refresh_token, user, rememberMe } = {}) => {
    const target = pickStore(rememberMe);
    if (access_token) safeWrite(target.store, STORAGE.access, access_token);
    if (refresh_token) safeWrite(target.store, STORAGE.refresh, refresh_token);
    if (user) safeWrite(target.store, STORAGE.user, JSON.stringify(user));
    safeWrite(target.store, STORAGE.mode, target.name);
    // Wipe the opposite store so tokens never live in both places.
    wipeOther(target.store);
  },
  clear: () => {
    for (const store of [getLocal(), getSession()]) {
      if (!store) continue;
      safeRemove(store, STORAGE.access);
      safeRemove(store, STORAGE.refresh);
      safeRemove(store, STORAGE.user);
      safeRemove(store, STORAGE.mode);
    }
  },
};

/* ---------- internal helpers (no callers outside this module) ---------- */
function getLocal()   { try { return window.localStorage; } catch { return null; } }
function getSession() { try { return window.sessionStorage; } catch { return null; } }

function readEither(key) {
  // localStorage wins so a remembered session is preferred over a
  // session-only one when both happen to coexist (shouldn't, but
  // belt + braces).
  const l = getLocal(); if (l) { try { const v = l.getItem(key); if (v) return v; } catch { /* noop */ } }
  const s = getSession(); if (s) { try { const v = s.getItem(key); if (v) return v; } catch { /* noop */ } }
  return null;
}
function readEitherJSON(key) {
  const raw = readEither(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function pickStore(rememberMe) {
  if (rememberMe === true)  return { store: getLocal(),   name: 'local' };
  if (rememberMe === false) return { store: getSession(), name: 'session' };
  // Undefined → keep the currently-active store, defaulting to session.
  const active = readEither(STORAGE.mode);
  if (active === 'local')  return { store: getLocal(),   name: 'local' };
  return { store: getSession(), name: 'session' };
}
function wipeOther(activeStore) {
  const other = activeStore === getLocal() ? getSession() : getLocal();
  if (!other) return;
  for (const k of Object.values(STORAGE)) safeRemove(other, k);
}
function safeWrite(store, k, v) { try { store?.setItem(k, v); } catch { /* noop */ } }
function safeRemove(store, k)   { try { store?.removeItem(k); } catch { /* noop */ } }

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach bearer token on every outgoing request.
api.interceptors.request.use((config) => {
  const t = tokens.getAccess();
  if (t) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// Coalesce concurrent refreshes: one in-flight promise, every waiting
// request resolves off the same result.
let refreshInflight = null;

async function refreshAccessToken() {
  const refresh_token = tokens.getRefresh();
  if (!refresh_token) throw new Error('no refresh token');
  if (!refreshInflight) {
    refreshInflight = axios
      .post(`${BASE_URL}/auth/refresh-token`, { refresh_token }, { headers: { 'Content-Type': 'application/json' } })
      .then((res) => {
        const Data = res?.data?.Data || {};
        tokens.set({
          access_token: Data.access_token,
          refresh_token: Data.refresh_token,
          user: Data.user,
        });
        return Data.access_token;
      })
      .finally(() => { refreshInflight = null; });
  }
  return refreshInflight;
}

// Unwrap MatchHire envelope on success; transparently refresh + retry on 401.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;

    if (status === 401 && !original._retry && !original.url?.includes('/auth/refresh-token') && !original.url?.includes('/auth/login')) {
      original._retry = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch (_e) {
        tokens.clear();
        try { window.dispatchEvent(new CustomEvent('matchhire:auth:logout')); } catch { /* noop */ }
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Unwrap the standard MatchHire envelope and throw a clean Error on failure.
 *
 *   { Response: { responseCode: 1, ... }, Data: {...} }            -> returns Data
 *   { Response: { responseCode: 0, status: 'Validation Error' }, Errors: [...] }
 *   { Response: { responseCode: 0, ... }, Data: null }
 *
 * Errors carry: `status`, `message`, `errors` (array on validation),
 * `httpStatus`, and `original` for callers that need to introspect.
 */
export async function call(promise) {
  try {
    const res = await promise;
    const body = res?.data || {};
    if (body?.Response?.responseCode === 1) return body.Data ?? {};
    const message = body?.Response?.message || 'Request failed';
    const err = new Error(message);
    err.status = body?.Response?.status;
    err.errors = body?.Errors || null;
    err.httpStatus = res?.status;
    throw err;
  } catch (e) {
    if (e?.response) {
      const body = e.response.data || {};
      const err = new Error(body?.Response?.message || e.message || 'Request failed');
      err.status = body?.Response?.status;
      err.errors = body?.Errors || null;
      err.httpStatus = e.response.status;
      err.original = e;
      throw err;
    }
    throw e;
  }
}

export const apiBaseUrl = BASE_URL;
