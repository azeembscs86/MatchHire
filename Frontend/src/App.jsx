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
import JobDetail from './pages/JobDetail.jsx';
import Companies from './pages/Companies.jsx';
import CompanyDetail from './pages/CompanyDetail.jsx';
import Candidates from './pages/Candidates.jsx';
import CandidateDetail from './pages/CandidateDetail.jsx';
import Profile from './pages/Profile.jsx';
import ReviewProfile from './pages/ReviewProfile.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Preferences from './pages/Preferences.jsx';
import Favorites from './pages/Favorites.jsx';
import SavedJobs from './pages/SavedJobs.jsx';
import EmployerOnboarding from './pages/EmployerOnboarding.jsx';
import DashboardCandidate from './pages/DashboardCandidate.jsx';
import DashboardCompany from './pages/DashboardCompany.jsx';
import DashboardAdmin from './pages/DashboardAdmin.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import VerifyPending from './pages/VerifyPending.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public discovery */}
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        {/* Public job detail page. Auth status changes the action bar
            (Apply / Save / Favourite) but anyone can view the posting. */}
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/companies" element={<Companies />} />
        {/* Public company / candidate detail pages — destination for
            the whole-card click on the discovery grids. Anyone can
            view; the candidate profile is server-side gated to rows
            with `is_public=1`. */}
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/candidates/:id" element={<CandidateDetail />} />
        <Route path="/employer-onboarding" element={<EmployerOnboarding />} />

        {/* Email verification (public — no token required to view the screens) */}
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/verify-email" element={<VerifyPending />} />

        {/* Password reset flow (both pages are public — the token is in the URL) */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Candidate-only flows */}
        <Route element={<ProtectedRoute roles={['candidate']} />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/review" element={<ReviewProfile />} />
          {/*
           * Candidate Onboarding Wizard (7 steps). Reachable from the
           * candidate dashboard via "Continue setup" banner; saves
           * progress server-side so closing the tab resumes here.
           */}
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/saved-jobs" element={<SavedJobs />} />
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
