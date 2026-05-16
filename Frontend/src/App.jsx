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
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/employer-onboarding" element={<EmployerOnboarding />} />
        <Route path="/dashboard/candidate" element={<DashboardCandidate />} />
        <Route path="/dashboard/company" element={<DashboardCompany />} />
        <Route path="/dashboard/admin" element={<DashboardAdmin />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
