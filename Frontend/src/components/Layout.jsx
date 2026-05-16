/**
 * Layout
 *
 * Persistent shell rendered for every route. Hosts the top bar,
 * header, footer, and the auth modal — the page-specific markup
 * mounts inside the `<Outlet />`. Also scrolls to the top of the
 * window on each navigation so a deep-scrolled page doesn't bleed
 * into the next one.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import TopBar from './TopBar.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import AuthModal from './AuthModal.jsx';

export default function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  return (
    <>
      <TopBar />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <AuthModal />
    </>
  );
}
