import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'matchhire:savedJobs';
const DEFAULT_SAVED = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [savedJobs, setSavedJobs] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set(DEFAULT_SAVED);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedJobs]));
    } catch {}
  }, [savedJobs]);

  const toggleSave = useCallback((idx) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const isSaved = useCallback((idx) => savedJobs.has(idx), [savedJobs]);

  const value = useMemo(() => ({ savedJobs, toggleSave, isSaved, count: savedJobs.size }), [savedJobs, toggleSave, isSaved]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
