/**
 * Route table for the MatchHire SPA.
 *
 * Every route is wrapped by `<Layout />`, which renders the persistent
 * shell (top bar, header, footer, auth modal) and a `<Outlet />` for
 * the active page. Unknown paths fall back to the home page.
 *
 * Keep this file flat and declarative — when a new page is added, it
 * should be a one-line entry here.
 */
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Jobs from './pages/Jobs.jsx';
import Companies from './pages/Companies.jsx';
import Candidates from './pages/Candidates.jsx';
import Profile from './pages/Profile.jsx';
import Preferences from './pages/Preferences.jsx';
import Favorites from './pages/Favorites.jsx';
import EmployerOnboarding from './pages/EmployerOnboarding.jsx';
import DashboardCandidate from './pages/DashboardCandidate.jsx';
import DashboardCompany from './pages/DashboardCompany.jsx';
import DashboardAdmin from './pages/DashboardAdmin.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public discovery */}
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/candidates" element={<Candidates />} />

        {/* Candidate-side flows */}
        <Route path="/profile" element={<Profile />} />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="/favorites" element={<Favorites />} />

        {/* Employer-side flows */}
        <Route path="/employer-onboarding" element={<EmployerOnboarding />} />

        {/* Dashboards */}
        <Route path="/dashboard/candidate" element={<DashboardCandidate />} />
        <Route path="/dashboard/company" element={<DashboardCompany />} />
        <Route path="/dashboard/admin" element={<DashboardAdmin />} />

        {/* Catch-all: send unknown paths home rather than 404 */}
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
