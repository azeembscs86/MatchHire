/**
 * FavoritesContext
 *
 * Owns the set of job indexes the user has saved. Stored as a `Set`
 * for O(1) `has`/`add`/`delete` since `isSaved(idx)` is called by
 * every JobCard on every render.
 *
 * Persistence: written to `localStorage` so the saved state survives
 * full page reloads. Read synchronously on first render (via the
 * `useState` initialiser) so cards render with the correct heart
 * state from frame one — no flash of "unsaved" hearts.
 *
 * The first-time default seeds 12 saved jobs to keep the Favorites
 * page non-empty for the demo; remove once a real backend is wired
 * up and a fresh user starts with an empty set.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'matchhire:savedJobs';
const DEFAULT_SAVED = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  // Hydrate from localStorage on mount. Wrapped in try/catch because
  // localStorage can throw (private mode, quota exceeded, disabled).
  const [savedJobs, setSavedJobs] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* storage unavailable — fall through to defaults */
    }
    return new Set(DEFAULT_SAVED);
  });

  // Persist on every change. Set is serialised to an array since
  // JSON.stringify can't represent a Set.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedJobs]));
    } catch {
      /* storage unavailable — silently skip persistence */
    }
  }, [savedJobs]);

  /** Add or remove `idx` from the saved set. */
  const toggleSave = useCallback((idx) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  /** Cheap membership check used by every JobCard render. */
  const isSaved = useCallback((idx) => savedJobs.has(idx), [savedJobs]);

  // Memoise the context value so consumers only re-render when the
  // underlying set actually changes.
  const value = useMemo(
    () => ({ savedJobs, toggleSave, isSaved, count: savedJobs.size }),
    [savedJobs, toggleSave, isSaved]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

/** Hook for reading + mutating the favorites set. */
export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used inside FavoritesProvider');
  }
  return ctx;
}
