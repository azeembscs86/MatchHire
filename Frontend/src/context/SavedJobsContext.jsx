/**
 * SavedJobsContext (API-backed)
 *
 * Sibling of FavoritesContext for the "apply later" surface. Owns the
 * set of job ids the signed-in candidate has saved-for-later. Source
 * of truth is the backend (`/candidates/saved-jobs/*`).
 *
 *   - Empty for guests / non-candidates.
 *   - Hydrates from `saved-jobs/list` on auth changes.
 *   - `toggleSave` is optimistic: updates the local set first, then
 *     calls the backend; rolls back on failure.
 *
 * The bookmark icon on JobCard reads from this context so the UI
 * stays in sync across pages.
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

const SavedJobsContext = createContext(null);

export function SavedJobsProvider({ children }) {
  const { user, role } = useAuth();
  const { openAuth } = useAuthModal();
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || role !== 'candidate') {
        setSavedIds(new Set());
        setReady(true);
        return;
      }
      try {
        const data = await candidatesApi.savedJobs.list({ page: 1, limit: 100 });
        if (cancelled) return;
        const ids = (data?.records || []).map((r) => Number(r.id ?? r.job_id)).filter(Boolean);
        setSavedIds(new Set(ids));
      } catch {
        if (!cancelled) setSavedIds(new Set());
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    setReady(false);
    load();
    return () => { cancelled = true; };
  }, [user, role]);

  const toggleSave = useCallback(async (jobId) => {
    if (jobId == null) return;
    const id = Number(jobId);
    if (!user) { openAuth('signin'); return; }
    if (role !== 'candidate') return;

    const currently = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (currently) next.delete(id); else next.add(id);
      return next;
    });
    try {
      if (currently) await candidatesApi.savedJobs.remove(id);
      else await candidatesApi.savedJobs.save(id);
    } catch {
      // Roll back on failure (e.g. job past deadline).
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (currently) next.add(id); else next.delete(id);
        return next;
      });
    }
  }, [savedIds, user, role, openAuth]);

  const isSavedForLater = useCallback((jobId) => savedIds.has(Number(jobId)), [savedIds]);

  const value = useMemo(
    () => ({ savedIds, toggleSave, isSavedForLater, count: savedIds.size, ready }),
    [savedIds, toggleSave, isSavedForLater, ready]
  );

  return <SavedJobsContext.Provider value={value}>{children}</SavedJobsContext.Provider>;
}

export function useSavedJobs() {
  const ctx = useContext(SavedJobsContext);
  if (!ctx) throw new Error('useSavedJobs must be used inside SavedJobsProvider');
  return ctx;
}
