/**
 * AuthModalContext
 *
 * Tiny global controller for the sign-in / sign-up overlay.
 *
 * Lives in context (rather than each consumer holding its own state)
 * because the modal is rendered once at the layout level but triggered
 * from many places — top bar "Help Center" link, header "Sign in" /
 * "Join free" buttons, the Home page CTAs, etc. Keeping it global
 * avoids prop-drilling an `onOpenAuth` handler through the tree.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

const AuthModalContext = createContext(null);

export function AuthModalProvider({ children }) {
  const [open, setOpen] = useState(false);
  // 'signin' | 'signup' — which tab the modal opens to.
  const [mode, setMode] = useState('signin');

  /**
   * Open the modal, optionally jumping straight to a specific tab.
   * Treat the legacy 'candidate' alias as a signup intent so the old
   * Help Center link from the static HTML still does the right thing.
   */
  const openAuth = useCallback((m = 'signin') => {
    setMode(m === 'signup' || m === 'candidate' ? 'signup' : 'signin');
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);
  const switchTab = useCallback((m) => setMode(m), []);

  const value = useMemo(
    () => ({ open, mode, openAuth, closeAuth, switchTab }),
    [open, mode, openAuth, closeAuth, switchTab]
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
}

/** Hook for opening, closing, and switching tabs on the auth modal. */
export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error('useAuthModal must be used inside AuthModalProvider');
  }
  return ctx;
}
