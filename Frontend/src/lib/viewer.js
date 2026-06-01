/**
 * Role → JobCard viewer mapping.
 *
 * Shared list pages (Jobs, Home, JobDetail's similar rail,
 * CompanyDetail, MatchingJobsCarousel) render the same `<JobCard>`
 * component for every role. The card's role-aware UI is gated on
 * its `viewer` prop — this helper turns the auth role from
 * `useAuth().role` into that prop so each caller doesn't reinvent
 * the mapping (and so a future role tweak is one edit, not
 * five).
 *
 *   candidate          → 'candidate'  (full card: match, apply, heart, save)
 *   employer           → 'company'    (no candidate affordances, status pill)
 *   admin / super_admin → 'admin'     (moderation surface)
 *   anything else      → 'guest'      (read-only, sign-in prompt elsewhere)
 */
export function viewerForRole(role) {
  if (role === 'candidate') return 'candidate';
  if (role === 'employer') return 'company';
  if (role === 'admin' || role === 'super_admin') return 'admin';
  return 'guest';
}
