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
import CandidateDashboardLayout from './components/CandidateDashboardLayout.jsx';
import CompanyDashboardLayout from './components/CompanyDashboardLayout.jsx';
import CandidateApplications from './pages/CandidateApplications.jsx';
import CandidateWithdrawn from './pages/CandidateWithdrawn.jsx';
import CandidateRejected from './pages/CandidateRejected.jsx';
import CandidateMessages from './pages/dashboard/CandidateMessages.jsx';
import CandidateNotifications from './pages/dashboard/CandidateNotifications.jsx';
import CandidateSettings from './pages/dashboard/CandidateSettings.jsx';
import PostJob from './pages/PostJob.jsx';
import CompanyJobs from './pages/CompanyJobs.jsx';
import CompanyApplications from './pages/CompanyApplications.jsx';
import DashEmptyPage from './pages/dashboard/DashEmptyPage.jsx';
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
          {/*
           * Standalone candidate pages — render with ONLY the
           * global top header/navbar (no dashboard sidebar).
           * Profile + Preferences live here because they're
           * full-page editors reached from the header / inline
           * CTAs, not from the dashboard sidebar. Keeping them
           * standalone gives the form room to breathe and
           * matches the design brief (no left rail on these
           * pages).
           */}
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/review" element={<ReviewProfile />} />
          <Route path="/preferences" element={<Preferences />} />

          {/*
           * Candidate dashboard SHELL — sidebar + main column.
           * Every page nested under it renders inside the same
           * shell so the sidebar never disappears when the
           * candidate clicks a tab (Favourites, Saved Jobs,
           * Applications, …). The standalone DashboardCandidate
           * page provides its OWN sidebar (also via
           * CandidateDashSidebar) so the overview's existing
           * layout stays unchanged.
           */}
          <Route element={<CandidateDashboardLayout />}>
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/saved-jobs" element={<SavedJobs />} />
            {/*
             * Dedicated candidate dashboard tabs. Each route
             * mounts inside the shell so the sidebar stays
             * anchored on the left and the active row
             * highlights correctly via NavLink. Messages /
             * Notifications / Settings render placeholder empty
             * states until their backing surfaces ship.
             */}
            <Route path="/dashboard/candidate/applications" element={<CandidateApplications />} />
            <Route path="/dashboard/candidate/withdrawn" element={<CandidateWithdrawn />} />
            <Route path="/dashboard/candidate/rejected" element={<CandidateRejected />} />
            <Route path="/dashboard/candidate/messages" element={<CandidateMessages />} />
            <Route path="/dashboard/candidate/notifications" element={<CandidateNotifications />} />
            <Route path="/dashboard/candidate/settings" element={<CandidateSettings />} />
          </Route>
          {/*
           * Candidate Onboarding Wizard (7 steps) keeps its own
           * full-bleed layout — the wizard is a guided flow and
           * should not be wrapped in the dashboard shell.
           */}
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard/candidate" element={<DashboardCandidate />} />
        </Route>

        {/* Employer-only flows */}
        <Route element={<ProtectedRoute roles={['employer']} />}>
          {/*
           * Company dashboard SHELL — sidebar + main column. Every
           * employer-facing tab mounts inside this wrapper so the
           * sidebar persists when the user clicks between tabs.
           * `/employer-onboarding` is the existing company-profile
           * editor — the Profile sidebar item routes there directly
           * via NavLink rather than duplicating that surface here.
           */}
          <Route element={<CompanyDashboardLayout />}>
            <Route path="/dashboard/company" element={<DashboardCompany />} />
            <Route path="/dashboard/company/post-job" element={<PostJob />} />
            <Route path="/dashboard/company/jobs" element={<CompanyJobs />} />
            <Route path="/dashboard/company/applications" element={<CompanyApplications mode="all" />} />
            <Route path="/dashboard/company/shortlisted" element={<CompanyApplications mode="shortlisted" />} />
            <Route path="/dashboard/company/rejected" element={<CompanyApplications mode="rejected" />} />
            {/*
             * Interviews + Profile placeholders so every sidebar tab
             * lands on a real page. Interviews surfaces an empty
             * state until the scheduling UI ships; Profile takes the
             * employer to the existing onboarding editor which
             * already calls /employers/company-profile/update.
             */}
            <Route
              path="/dashboard/company/interviews"
              element={(
                <DashEmptyPage
                  testid="company-interviews"
                  icon="☎"
                  eyebrow="Interview pipeline"
                  display="Scheduled"
                  emphasis="interviews"
                  intro="Interviews you've booked with shortlisted candidates appear here."
                  emptyTitle="No interviews scheduled yet"
                  emptyMessage="When you schedule an interview from an applicant's row, it'll show up on this tab."
                />
              )}
            />
            <Route
              path="/dashboard/company/profile"
              element={(
                <DashEmptyPage
                  testid="company-profile-redirect"
                  icon="◧"
                  eyebrow="Company profile"
                  display="Edit your"
                  emphasis="company profile"
                  intro="Visit the company profile editor to update your logo, location, industry, website, and description."
                  emptyTitle="Open the profile editor"
                  emptyMessage="Click 'Edit company profile' on the Employer Onboarding page to update your details."
                />
              )}
            />
          </Route>
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
