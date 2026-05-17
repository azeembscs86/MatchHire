/**
 * FavoritesContext (API-backed)
 *
 * Owns the set of job ids the signed-in candidate has favorited. The
 * source of truth is the MatchHire backend (`/candidates/favorites/*`),
 * not localStorage.
 *
 *   - When no user is signed in, the set stays empty. JobCard's heart
 *     icon shows the unsaved state; pressing it opens the auth modal.
 *   - When a candidate signs in (or the page boots with a stored token)
 *     we hydrate the set by calling `favorites/list`. Subsequent
 *     toggles call `add` / `remove` and update the cache optimistically.
 *
 * `count` is read by the header badge on every render, so we keep it
 * O(1) by storing the set as a JS `Set` of job ids (numbers).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { candidatesApi } from '../api/index.js';
import { useAuth } from './AuthContext.jsx';
import { useAuthModal } from './AuthModalContext.jsx';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user, role } = useAuth();
  const { openAuth } = useAuthModal();
  const [savedJobs, setSavedJobs] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  // Re-hydrate whenever the authenticated user changes. Non-candidates
  // (employers, admins) don't have a favorites surface so we skip the
  // network call and keep the set empty for them.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || role !== 'candidate') {
        setSavedJobs(new Set());
        setReady(true);
        return;
      }
      try {
        const data = await candidatesApi.favorites.list({ page: 1, limit: 100 });
        if (cancelled) return;
        const ids = (data?.records || []).map((r) => Number(r.id ?? r.job_id)).filter(Boolean);
        setSavedJobs(new Set(ids));
      } catch {
        if (!cancelled) setSavedJobs(new Set());
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    setReady(false);
    load();
    return () => { cancelled = true; };
  }, [user, role]);

  /** Optimistic toggle: update locally, then sync to the server. */
  const toggleSave = useCallback(async (jobId) => {
    if (!jobId && jobId !== 0) return;
    const id = Number(jobId);
    if (!user) { openAuth('signin'); return; }
    if (role !== 'candidate') return;

    const currentlySaved = savedJobs.has(id);
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (currentlySaved) next.delete(id); else next.add(id);
      return next;
    });
    try {
      if (currentlySaved) await candidatesApi.favorites.remove(id);
      else await candidatesApi.favorites.add(id);
    } catch {
      // Roll back on failure.
      setSavedJobs((prev) => {
        const next = new Set(prev);
        if (currentlySaved) next.add(id); else next.delete(id);
        return next;
      });
    }
  }, [savedJobs, user, role, openAuth]);

  const isSaved = useCallback((jobId) => savedJobs.has(Number(jobId)), [savedJobs]);

  const value = useMemo(
    () => ({ savedJobs, toggleSave, isSaved, count: savedJobs.size, ready }),
    [savedJobs, toggleSave, isSaved, ready]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

/** Hook for reading + mutating the saved-jobs set. */
export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
