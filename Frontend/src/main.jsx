/**
 * App bootstrap.
 *
 * Mounts the React tree and wraps it in the providers that own
 * cross-cutting state. The provider order is deliberate:
 *
 *   AuthProvider          owns the authenticated session
 *     AuthModalProvider   owns the sign-in/sign-up overlay (depends on Auth
 *                         only through the components that use it)
 *       FavoritesProvider hydrates favorites from the API when the user
 *                         is signed in (reads useAuth + useAuthModal)
 *         App             routes
 *
 * `AuthProvider` is at the top so every consumer below it can read the
 * current user without prop-drilling.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AuthModalProvider } from './context/AuthModalContext.jsx';
import { FavoritesProvider } from './context/FavoritesContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AuthModalProvider>
          <FavoritesProvider>
            <App />
          </FavoritesProvider>
        </AuthModalProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
