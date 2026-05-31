/**
 * CompanyApplications — aggregated applicants view.
 *
 * One page, three modes selected via the `mode` prop set in App.jsx:
 *
 *   mode='all'         → /dashboard/company/applications
 *   mode='shortlisted' → /dashboard/company/shortlisted
 *   mode='rejected'    → /dashboard/company/rejected
 *
 * The applicants endpoint is per-job (`/employers/jobs/:id/applicants`),
 * so we fan out one request per posting and stitch the rows together
 * client-side. For typical employer accounts (≤20 active postings) the
 * fanout is fine; if a company ever crosses the threshold where this
 * pattern hurts, the cleanup is a single `/employers/applications/list`
 * endpoint — not a UI rewrite.
 *
 * Reject action opens the shared CompanyRejectionModal so the
 * mandatory-reason flow is identical to the overview hub.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { employersApi } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import CompanyRejectionModal from '../components/CompanyRejectionModal.jsx';
import { parseRejectionReason } from '../data/rejection-reasons.js';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
}

const APPLICANT_STATUS = {
  applied:      { cls: 'pill-applied',     label: 'Applied' },
  reviewing:    { cls: 'pill-review',      label: 'Under Review' },
  under_review: { cls: 'pill-review',      label: 'Under Review' },
  shortlisted:  { cls: 'pill-shortlisted', label: 'Shortlisted' },
  interview:    { cls: 'pill-interview',   label: 'Interview' },
  offered:      { cls: 'pill-accepted',    label: 'Offered' },
  hired:        { cls: 'pill-accepted',    label: 'Hired' },
  accepted:     { cls: 'pill-accepted',    label: 'Accepted' },
  rejected:     { cls: 'pill-rejected',    label: 'Rejected' },
};

function applicantStatus(status) {
  return APPLICANT_STATUS[String(status || '').toLowerCase()]
    || { cls: 'pill-active', label: status || 'Applied' };
}

const TERMINAL_APPLICANT_STATUSES = new Set(['rejected', 'hired', 'accepted']);

const MODE_CONFIG = {
  all: {
    heading: 'Applicants',
    italic: 'across every role',
    description: 'Every candidate who has applied to your active jobs, sorted newest first.',
    statusFilter: null,
    emptyTitle: 'No applicants yet',
    emptyMessage: 'Once candidates apply to your jobs, their applications will appear here for review.',
  },
  shortlisted: {
    heading: 'Shortlisted',
    italic: 'candidates',
    description: 'Candidates you\'ve moved into your shortlist. Send interview invites or reject with a reason.',
    statusFilter: 'shortlisted',
    emptyTitle: 'No shortlisted candidates yet',
    emptyMessage: 'Shortlist candidates from the Applicants tab to surface them here.',
  },
  rejected: {
    heading: 'Rejected',
    italic: 'applications',
    description: 'Applications you\'ve declined, with the reason that was shown to the candidate.',
    statusFilter: 'rejected',
    emptyTitle: 'No rejected applications',
    emptyMessage: 'Applications you decline (with a reason) will appear here for your records.',
  },
};

export default function CompanyApplications({ mode = 'all' }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.all;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // First fetch every posting we own. Drafts and archived
        // jobs can still have application rows attached, so we
        // pull the full set rather than just status=open.
        const jobsRes = await employersApi.jobs.list({ page: 1, limit: 100 });
        if (cancelled) return;
        const jobs = jobsRes?.records || [];
        if (jobs.length === 0) {
          setRows([]);
          return;
        }
        // Fan out one applicants request per job. `Promise.all` keeps
        // the round-trips concurrent so total time is bound by the
        // slowest call, not the sum.
        const perJob = await Promise.all(jobs.map((j) =>
          employersApi.jobs.applicants(j.id, {
            page: 1,
            limit: 100,
            status: cfg.statusFilter || undefined,
          })
            .then((res) => (res?.records || []).map((a) => ({
              ...a,
              _jobId: j.id,
              _jobTitle: j.title,
            })))
            .catch(() => [])
        ));
        if (cancelled) return;
        const merged = perJob.flat();
        // Sort newest first — applied_at when available, else updated_at.
        merged.sort((a, b) => {
          const ta = new Date(a.applied_at || a.updated_at || 0).getTime();
          const tb = new Date(b.applied_at || b.updated_at || 0).getTime();
          return tb - ta;
        });
        setRows(merged);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [mode, user?.id, cfg.statusFilter]);

  async function shortlistApplicant(applicationId) {
    setBusyId(applicationId);
    try {
      await employersApi.applications.shortlist(applicationId);
      // For the "shortlisted" view, the row stays. For "all", we
      // update the status pill in-place. For "rejected", the action
      // doesn't render so we won't hit this branch.
      setRows((list) => list.map((a) => a.id === applicationId
        ? { ...a, status: 'shortlisted' }
        : a));
    } catch { /* keep prior state */ } finally {
      setBusyId(null);
    }
  }

  async function handleRejectConfirmed(reasonKey, customReason) {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await employersApi.applications.reject(rejecting.id, reasonKey, customReason);
      setRows((list) => list.map((a) => a.id === rejecting.id
        ? { ...a, status: 'rejected', rejection_reason: customReason ? `${reasonKey}:${customReason}` : reasonKey }
        : a));
      setRejecting(null);
    } catch (e) {
      throw e;
    } finally {
      setBusyId(null);
    }
  }

  const headerCount = useMemo(() => rows.length, [rows]);

  if (loading) {
    return (
      <div className="container" style={{ padding: '48px 0' }}>
        <LoadingState label={`Loading ${cfg.heading.toLowerCase()}…`} />
      </div>
    );
  }

  return (
    <div className="dash-content" data-testid={`company-applications-${mode}`}>
      <div className="dash-topbar">
        <div>
          <h1>{cfg.heading} <span className="ital">{cfg.italic}</span>.</h1>
          <p>{headerCount} {headerCount === 1 ? 'record' : 'records'} · {cfg.description}</p>
        </div>
        <Link to="/dashboard/company" className="btn btn-ghost">← Back to dashboard</Link>
      </div>

      {error && <ErrorState error={error} />}

      {rows.length === 0 ? (
        <div className="fav-empty">
          <div className="fav-empty-icon">◉</div>
          <h3>{cfg.emptyTitle}</h3>
          <p>{cfg.emptyMessage}</p>
          <Link to="/dashboard/company/jobs" className="btn btn-coral">View my jobs →</Link>
        </div>
      ) : (
        <div className="dash-panel">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Applied for</th>
                <th>Match</th>
                <th>Status</th>
                {mode === 'rejected' && <th>Reason</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const s = applicantStatus(a.status);
                const isTerminal = TERMINAL_APPLICANT_STATUSES.has(String(a.status || '').toLowerCase());
                const reason = mode === 'rejected'
                  ? parseRejectionReason(a.rejection_reason)
                  : null;
                return (
                  <tr key={a.id} data-testid={`applicant-row-${a.id}`}>
                    <td>
                      <div className="table-co">
                        <div className="cand-tiny lg-1">{initials(a.candidate_name)}</div>
                        <div>
                          <strong>{a.candidate_name || 'Candidate'}</strong>
                          <small>
                            {a.headline || a.location || ''}
                            {a.years_experience != null ? ` · ${a.years_experience}+ yrs` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td><small>{a._jobTitle}</small></td>
                    <td>
                      {Number.isFinite(Number(a.match_score))
                        ? <strong style={{ fontFamily: "'Fraunces',serif" }}>{Math.round(Number(a.match_score))}%</strong>
                        : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                    </td>
                    <td>
                      <span className={`pill ${s.cls}`} data-testid="applicant-status">{s.label}</span>
                    </td>
                    {mode === 'rejected' && (
                      <td>
                        <small>{reason?.label || '—'}</small>
                      </td>
                    )}
                    <td>
                      {isTerminal ? (
                        <span className="muted" style={{ fontSize: 11 }}>—</span>
                      ) : (
                        <div className="row-actions">
                          {a.status !== 'shortlisted' && (
                            <button
                              className="icon-btn success"
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => shortlistApplicant(a.id)}
                              title="Shortlist"
                              data-testid={`shortlist-${a.id}`}
                            >✓</button>
                          )}
                          <button
                            className="icon-btn danger"
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => setRejecting(a)}
                            title="Reject"
                            data-testid={`reject-${a.id}`}
                          >×</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CompanyRejectionModal
        open={!!rejecting}
        candidateName={rejecting?.candidate_name}
        jobTitle={rejecting?._jobTitle}
        onClose={() => setRejecting(null)}
        onConfirm={handleRejectConfirmed}
      />
    </div>
  );
}
