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
