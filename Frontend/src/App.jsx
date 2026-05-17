/**
 * Route table for the MatchHire SPA.
 *
 * Public routes render under `<Layout />`. Authenticated routes are
 * nested under `<ProtectedRoute />` so unauthenticated visitors get
 * redirected to / (with the auth modal popped) and role-mismatched
 * users get redirected to / silently.
 *
 *   /                    public
 *   /jobs                public
 *   /companies           public
 *   /candidates          public
 *
 *   /profile             candidate only
 *   /preferences         candidate only
 *   /favorites           candidate only
 *
 *   /employer-onboarding public (so guests can land on the marketing
 *                        page); the form itself triggers signup
 *   /dashboard/candidate candidate only
 *   /dashboard/company   employer only
 *   /dashboard/admin     admin / super_admin
 */
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
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
        <Route path="/employer-onboarding" element={<EmployerOnboarding />} />

        {/* Candidate-only flows */}
        <Route element={<ProtectedRoute roles={['candidate']} />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/dashboard/candidate" element={<DashboardCandidate />} />
        </Route>

        {/* Employer-only flows */}
        <Route element={<ProtectedRoute roles={['employer']} />}>
          <Route path="/dashboard/company" element={<DashboardCompany />} />
        </Route>

        {/* Admin-only flows */}
        <Route element={<ProtectedRoute roles={['admin', 'super_admin']} />}>
          <Route path="/dashboard/admin" element={<DashboardAdmin />} />
        </Route>

        {/* Catch-all: send unknown paths home rather than 404 */}
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
