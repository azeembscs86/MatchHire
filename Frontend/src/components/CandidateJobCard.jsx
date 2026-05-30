/**
 * CandidateJobCard — thin role-bound wrapper around the shared
 * <JobCard /> ("BaseJobCard") component.
 *
 * Existence rationale
 * -------------------
 * The whole codebase renders job cards through one shared component
 * (`components/JobCard.jsx`). That component takes a `viewer` prop
 * (`'candidate' | 'company' | 'guest'`) which gates the role-specific
 * decorations: match score, why-recommended checklist, missing skills,
 * the Apply Now action row.
 *
 * In practice every candidate-facing caller forgets to pass
 * `viewer="candidate"` (it's the default and easy to miss) and every
 * company-facing caller had to remember `viewer="company"`. This
 * wrapper makes the intent explicit at the call-site:
 *
 *   import CandidateJobCard from '../components/CandidateJobCard';
 *   <CandidateJobCard job={...} onApply={...} applied={...} />
 *
 * — no `viewer` prop to mistype, no chance of accidentally flipping
 * to the wrong role. The wrapper forwards every other prop to the
 * base component verbatim. Callers that need the row variant, the
 * featured ribbon, the applied state, or any future JobCard prop
 * keep working unchanged.
 *
 * Companion: `CompanyJobCard.jsx`.
 */
import JobCard from './JobCard.jsx';

export default function CandidateJobCard(props) {
  return <JobCard {...props} viewer="candidate" />;
}
