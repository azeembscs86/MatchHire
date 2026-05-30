/**
 * CompanyJobCard — thin role-bound wrapper around the shared
 * <JobCard /> ("BaseJobCard") component.
 *
 * Pre-binds `viewer="company"` so the underlying card never
 * renders candidate-only decorations (match score, why-recommended
 * checklist, missing skills, Apply Now button). The company-facing
 * action row is opt-in via the `onManage` prop, which the base
 * component renders as a "View Applications" CTA.
 *
 * Typical usage:
 *
 *   import CompanyJobCard from '../components/CompanyJobCard';
 *   <CompanyJobCard
 *     job={view}
 *     featured={!!job.is_featured}
 *     onManage={(j) => navigate(`/jobs/${j.id}`)}
 *   />
 *
 * Companion: `CandidateJobCard.jsx`. Both wrappers forward every
 * non-`viewer` prop to the base component verbatim.
 */
import JobCard from './JobCard.jsx';

export default function CompanyJobCard(props) {
  return <JobCard {...props} viewer="company" />;
}
