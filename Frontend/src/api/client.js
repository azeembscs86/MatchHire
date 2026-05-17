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
};

export const tokens = {
  getAccess: () => safeRead(STORAGE.access),
  getRefresh: () => safeRead(STORAGE.refresh),
  getUser: () => safeJSON(STORAGE.user),
  set: ({ access_token, refresh_token, user }) => {
    if (access_token) safeWrite(STORAGE.access, access_token);
    if (refresh_token) safeWrite(STORAGE.refresh, refresh_token);
    if (user) safeWrite(STORAGE.user, JSON.stringify(user));
  },
  clear: () => {
    safeRemove(STORAGE.access);
    safeRemove(STORAGE.refresh);
    safeRemove(STORAGE.user);
  },
};

function safeRead(k)  { try { return localStorage.getItem(k); } catch { return null; } }
function safeWrite(k, v) { try { localStorage.setItem(k, v); } catch { /* noop */ } }
function safeRemove(k) { try { localStorage.removeItem(k); } catch { /* noop */ } }
function safeJSON(k)   { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; } }

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
