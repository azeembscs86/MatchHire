/**
 * AuthContext
 *
 * Owns the authenticated session for the SPA. Holds:
 *   - user           current user object (or null)
 *   - ready          true after the initial token+me hydration finishes
 *   - login()        POST /auth/login, persist tokens, fetch me()
 *   - register()     POST /auth/register/{role}, persist tokens
 *   - logout()       revoke refresh token, clear local state
 *   - refreshMe()    re-fetch current user (used after profile updates)
 *
 * Why a context (not redux/zustand): the rest of the app reads `user`
 * in only a handful of places (Header, ProtectedRoute, role-specific
 * dashboards). A single context with memoised value covers all of it
 * with zero extra dependencies.
 *
 * Cross-tab + 401 logout: client.js dispatches `matchhire:auth:logout`
 * when the refresh handshake fails. We listen here and clear state so
 * the rest of the tree re-renders into the signed-out view.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authApi, tokens } from '../api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => tokens.getUser());
  const [ready, setReady] = useState(false);

  // On mount, if we have an access token, validate by calling /me. If
  // that fails (token expired, revoked, server down), client.js handles
  // refresh transparently; if refresh also fails, the user is signed out.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!tokens.getAccess()) { setReady(true); return; }
      try {
        const me = await authApi.me();
        if (cancelled) return;
        const u = me?.user || null;
        if (u) tokens.set({ user: u });
        setUser(u);
      } catch (_e) {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, []);

  // React to forced logout fired by the API client on auth failure.
  useEffect(() => {
    function onLogout() { setUser(null); }
    window.addEventListener('matchhire:auth:logout', onLogout);
    return () => window.removeEventListener('matchhire:auth:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    tokens.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    });
    setUser(data.user || null);
    return data.user;
  }, []);

  const register = useCallback(async (role, payload) => {
    const data = await authApi.register(role, payload);
    tokens.set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    });
    setUser(data.user || null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await authApi.me();
    const u = me?.user || null;
    if (u) tokens.set({ user: u });
    setUser(u);
    return u;
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: !!user,
    role: user?.role || null,
    login,
    register,
    logout,
    refreshMe,
  }), [user, ready, login, register, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the current session. Throws outside AuthProvider so misuse is loud. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
