/**
 * App bootstrap.
 *
 * Mounts the React tree, sets up client-side routing, and wraps the
 * tree in the providers that own cross-cutting state. Provider order
 * matters: FavoritesProvider sits above AuthModalProvider so the
 * header (rendered inside both) can read the saved-jobs count and
 * trigger the auth modal independently.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthModalProvider } from './context/AuthModalContext.jsx';
import { FavoritesProvider } from './context/FavoritesContext.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FavoritesProvider>
        <AuthModalProvider>
          <App />
        </AuthModalProvider>
      </FavoritesProvider>
    </BrowserRouter>
  </React.StrictMode>
);
