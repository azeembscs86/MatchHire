/**
 * useApplyToJob
 *
 * Centralised "Apply Now" handler shared by every surface that
 * renders a JobCard (Home rails, Jobs feed, Favorites, JobDetail
 * similar-jobs rail, Dashboard new-matches list, ...).
 *
 * Responsibilities:
 *   - Gate the action on a signed-in candidate. Guests get the
 *     sign-in modal; employer/admin viewers never see Apply at all
 *     because callers check `isCandidate` before passing `onApply`.
 *   - Hide the action on expired jobs (view-model carries `isExpired`).
 *   - POST `/candidates/applications/:jobId/validate-and-apply` and
 *     surface success / rejection / network errors via callbacks the
 *     caller can render into its own toast UI.
 *
 * The hook deliberately stays UI-agnostic: it exposes
 * `{ apply, applyingId, isCandidate }` and lets each page render its
 * own status message. That keeps the existing per-page toast styling
 * (inline banner on Jobs, jd-toast on JobDetail, per-row pill on
 * SavedJobs) untouched while the underlying gating + API call is
 * shared.
 */
import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuthModal } from '../context/AuthModalContext.jsx';
import { candidatesApi } from '../api/index.js';

export function useApplyToJob({ onSuccess, onError } = {}) {
  const { user, role } = useAuth();
  const { openAuth } = useAuthModal();
  const isCandidate = !!user && role === 'candidate';
  const [applyingId, setApplyingId] = useState(null);

  const apply = useCallback(async (job) => {
    if (!job) return;
    if (!isCandidate) { openAuth('signin'); return; }
    if (job.isExpired) return;
    setApplyingId(job.id);
    try {
      const result = await candidatesApi.validateAndApply(job.id, {});
      onSuccess?.({ job, result });
    } catch (err) {
      const data = err?.original?.response?.data?.Data;
      const rejected = data?.decision === 'rejected';
      onError?.({
        job,
        err,
        rejected,
        data,
        message: (rejected && data?.message)
          ? data.message
          : (err?.message || 'Could not submit application.'),
      });
    } finally {
      setApplyingId(null);
    }
  }, [isCandidate, openAuth, onSuccess, onError]);

  return { apply, applyingId, isCandidate };
}

export default useApplyToJob;
