/**
 * ProtectedRoute
 *
 * Gate a route by authentication state and (optionally) role. Use as a
 * wrapper element in App.jsx:
 *
 *   <Route element={<ProtectedRoute roles={['candidate']} />}>
 *     <Route path="/profile" element={<Profile />} />
 *   </Route>
 *
 * Behaviour:
 *   - While auth is hydrating, render a minimal loading shell so we
 *     don't flash the signed-in or signed-out view.
 *   - If unauthenticated, open the auth modal (signin tab) and bounce
 *     to the home page so the rest of the layout still renders.
 *   - If a `roles` array is provided and the user's role is not in it,
 *     redirect to the home page (the header already prevents the link
 *     from showing for the wrong role).
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuthModal } from '../context/AuthModalContext.jsx';

export default function ProtectedRoute({ roles }) {
  const { ready, isAuthenticated, role } = useAuth();
  const { openAuth } = useAuthModal();
  const location = useLocation();

  // While AuthContext is still validating the stored token, render a
  // light placeholder so the URL doesn't flash to / and back.
  if (!ready) {
    return (
      <section className="container" style={{ padding: '60px 0' }}>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    // Open the auth modal as a side-effect; the redirect below renders
    // the home page underneath, which preserves the rest of the chrome.
    return <RedirectWithModal openAuth={openAuth} from={location.pathname} />;
  }

  if (roles && roles.length > 0 && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function RedirectWithModal({ openAuth, from }) {
  useEffect(() => { openAuth('signin'); }, [openAuth, from]);
  return <Navigate to="/" replace state={{ from }} />;
}
