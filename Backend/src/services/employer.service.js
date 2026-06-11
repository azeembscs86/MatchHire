'use strict';

/**
 * Employer service
 * ----------------
 * Business logic for employer-only flows. Responsible for:
 *
 *   - Looking up the employer's company (owner_user_id or employer_profiles)
 *   - Enforcing job ownership on every mutation
 *   - Job lifecycle: create / update / soft-delete / close
 *   - Applicant pipeline: shortlist / reject / schedule interview
 *   - Cache invalidation on writes (job detail/list, dashboard stats)
 */

const companyRepo = require('../repositories/company.repository');
const employerRepo = require('../repositories/employer.repository');
const jobRepo = require('../repositories/job.repository');
const candidateRepo = require('../repositories/candidate.repository');
const appRepo = require('../repositories/application.repository');
const interviewRepo = require('../repositories/interview.repository');
const matchService = require('./match.service');
const cache = require('../cache/cache.helper');
const notificationQueue = require('../queues/notification.queue');
const AppError = require('../utils/AppError');

// Match floor for the "Matching Jobs From Your Company" carousel on
// the candidate detail page. Lowered to 50 (was 60) to align with
// the unified 50% recommendation floor used by /recommended-
// candidates — both surfaces now show the same set when sorted.
const MATCH_FLOOR = 50;

async function getCompanyForUser(user_id) {
  const company = await companyRepo.findByOwner(user_id);
  if (!company) throw new AppError('No company associated with this employer', 404);
  return company;
}

async function getCompanyProfile(user_id) {
  return getCompanyForUser(user_id);
}

async function updateCompanyProfile(user_id, payload) {
  const company = await getCompanyForUser(user_id);
  await companyRepo.updateById(company.id, payload);
  await cache.deleteByPattern(cache.Patterns.companiesList);
  await cache.deleteCache(cache.Keys.companyDetail(company.id));
  return companyRepo.findById(company.id);
}

async function createJob(user_id, payload) {
  const company = await getCompanyForUser(user_id);
  const { id } = await jobRepo.create({
    ...payload,
    company_id: company.id,
    posted_by_user_id: user_id,
  });
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  const job = await jobRepo.findById(id);
  // Pings the moderation queue ONLY when the row lands as pending —
  // drafts and admin-injected `admin_status='approved'` paths skip
  // the notification because they don't actually need super-admin
  // review. Best-effort: a queue failure must never tip a successful
  // create into a 500, so we swallow the error and log.
  if (job?.admin_status === 'pending') {
    try {
      await notificationQueue.add('job-approval-required', {
        job_id: id,
        job_title: job.title,
        company_name: company.name,
      });
    } catch (_e) { /* non-blocking */ }
  }
  return job;
}

async function updateJob(user_id, jobId, payload) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.update(jobId, payload);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return jobRepo.findById(jobId);
}

async function deleteJob(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.softDelete(jobId);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return true;
}

async function closeJob(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);
  await jobRepo.closeJob(jobId);
  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  return jobRepo.findById(jobId);
}

/**
 * Reactivate an expired (or otherwise inactive) job posting.
 *
 * Two auto-approval branches:
 *
 *   1. Date-only change — the company simply extends the
 *      `application_deadline` without touching any content. The
 *      job goes back into the public feed instantly because
 *      `activeJobWhere()` accepts any row with a future deadline,
 *      `status='open'`, and `admin_status='approved'`. No super-
 *      admin review needed since nothing changed except the cutoff.
 *
 *   2. Content change — the company also updates one or more of
 *      title / description / responsibilities / requirements /
 *      benefits / skills_tags / salary / experience_level /
 *      work_mode / location / job_type. Those changes need
 *      super-admin re-moderation, so we flip `admin_status` to
 *      `'pending'` while keeping `status='open'` — the job is
 *      under review and will reappear publicly once the admin
 *      flips it to `approved` via /admin/jobs/:id/status.
 *
 * Ownership is enforced server-side via `jobRepo.ownsJob()`. The
 * deadline validator also rejects past dates (Joi-level) so a
 * "reactivate with yesterday's date" call can't slip through.
 *
 * Returns: { job, requires_approval, fields_changed[] }
 */
const REACTIVATE_CONTENT_FIELDS = [
  'title', 'description', 'responsibilities', 'requirements', 'benefits',
  'skills_tags', 'salary_min', 'salary_max', 'salary_currency', 'salary_period',
  'experience_level', 'work_mode', 'is_remote', 'is_global_remote',
  'location', 'country', 'job_type', 'category_id', 'vacancies',
];

async function reactivateJob(user_id, jobId, payload = {}) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);

  const existing = await jobRepo.findById(jobId);
  if (!existing) throw new AppError('Job not found', 404);

  // Deadline is required. Joi has already rejected non-ISO and
  // past values; this is a defence-in-depth backstop.
  const newDeadline = payload.application_deadline
    ? new Date(payload.application_deadline)
    : null;
  if (!newDeadline || Number.isNaN(newDeadline.getTime()) || newDeadline.getTime() <= Date.now()) {
    throw new AppError('Reactivation requires a future application_deadline', 400);
  }

  // Detect content changes by comparing every reactivate-relevant
  // field on the payload to its current persisted value. A field
  // is "changed" when it appears on the payload AND its value
  // differs from the existing row. `skills_tags` is normalised
  // to comma-joined form (the persisted column shape) before
  // comparing so a "Node.js,React" vs ["Node.js","React"] mismatch
  // doesn't false-trigger the admin-pending path.
  const fieldsChanged = [];
  const updates = { application_deadline: newDeadline };
  for (const key of REACTIVATE_CONTENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    let next = payload[key];
    let prev = existing[key];
    if (key === 'skills_tags' && Array.isArray(next)) next = next.join(',');
    // Loose equality so null / '' / 0 don't false-trigger.
    const a = next == null ? '' : String(next);
    const b = prev == null ? '' : String(prev);
    if (a !== b) {
      updates[key] = payload[key];
      fieldsChanged.push(key);
    }
  }

  const requiresApproval = fieldsChanged.length > 0;
  // status='open' regardless — the job is back in the active
  // pipeline. admin_status flips to 'pending' only when content
  // changed; otherwise stays 'approved' so the public feed
  // picks the job up instantly.
  updates.status = 'open';
  updates.admin_status = requiresApproval ? 'pending' : 'approved';

  await jobRepo.update(jobId, updates);

  await cache.deleteCache(cache.Keys.jobDetail(jobId));
  await cache.deleteByPattern(cache.Patterns.jobsList);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));

  return {
    job: await jobRepo.findById(jobId),
    requires_approval: requiresApproval,
    fields_changed: fieldsChanged,
  };
}

async function listMyJobs(user_id, paging) {
  const company = await getCompanyForUser(user_id);
  const result = await jobRepo.listByCompany(company.id, paging);
  // Decorate each row with the latest admin rejection reason, if
  // any. The reason is captured in `admin_audit_logs.meta` when a
  // super-admin flips `admin_status` to 'rejected' via
  // /admin/jobs/:id/status; there's no `jobs.rejection_reason`
  // column today (would need a migration). Pulling the most recent
  // matching audit row per job lets the company's My Jobs surface
  // render the rejection reason inline without that migration.
  // Single round-trip even with many jobs — narrow IN clause.
  const rejectedJobs = (result.rows || []).filter((j) => j.admin_status === 'rejected');
  if (rejectedJobs.length > 0) {
    const ids = rejectedJobs.map((j) => j.id);
    const placeholders = ids.map(() => '?').join(',');
    const reasonRows = await require('../config/database').query(
      `SELECT entity_id, meta, created_at
         FROM admin_audit_logs
        WHERE entity_type = 'job'
          AND action = 'update_job_status'
          AND entity_id IN (${placeholders})
        ORDER BY created_at DESC`,
      ids
    );
    // Map: jobId → most recent rejection-reason audit entry.
    const byJob = new Map();
    for (const row of reasonRows) {
      if (byJob.has(row.entity_id)) continue; // keep the latest only
      let meta = row.meta;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = {}; }
      }
      if (meta?.admin_status === 'rejected' && meta?.reason) {
        byJob.set(row.entity_id, {
          reason: String(meta.reason),
          at: row.created_at,
        });
      }
    }
    for (const job of result.rows) {
      const entry = byJob.get(job.id);
      job.rejection_reason = entry?.reason || null;
      job.rejected_at = entry?.at || null;
    }
  }
  return result;
}

/**
 * Engagement tier per applicant.
 *
 *   hot   — actively in the employer's hands: shortlisted, interview,
 *           offered, hired, OR the application landed in the last 7 days.
 *   cold  — > 30 days since the latest activity and the row is still
 *           in the early-funnel statuses (applied / reviewing).
 *   warm  — everything in between.
 *
 * Pure derivation from `status` + `applied_at` / `updated_at` — no
 * new column. Drives the Hot / Warm / Cold chip on the company
 * applicants table so the recruiter can triage at a glance without
 * sorting by date.
 */
function applicantEngagement(row) {
  const status = String(row.status || '').toLowerCase();
  const ACTIVE = new Set(['shortlisted', 'interview', 'offered', 'hired']);
  const EARLY = new Set(['applied', 'reviewing', 'under_review']);
  const latest = row.applied_at || row.updated_at || null;
  const ageDays = latest ? Math.floor((Date.now() - new Date(latest).getTime()) / 86400000) : null;
  if (ACTIVE.has(status)) return 'hot';
  if (Number.isFinite(ageDays) && ageDays <= 7) return 'hot';
  if (EARLY.has(status) && Number.isFinite(ageDays) && ageDays > 30) return 'cold';
  return 'warm';
}

async function listApplicants(user_id, jobId, paging) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);

  const { rows, total } = await appRepo.listApplicantsForJob(jobId, paging);
  if (rows.length === 0) return { rows, total };

  // Decorate each applicant with:
  //   - `match_score` — live score vs. THIS job using the same scorer
  //     the apply-validate path uses. Lets the employer-side table
  //     render the same "Match" column the auto-shortlist uses.
  //   - `engagement` — Hot / Warm / Cold tier derived from status +
  //     time-since-activity. Pure UI hint; no schema change.
  //
  // The match-score fanout is one `loadCandidateContext` per
  // applicant (small queries). At the cap of 100 rows per page that
  // costs ~100 round-trips, which the typical employer dashboard
  // tolerates; if we ever cross that threshold the right fix is a
  // batched candidate-context loader, not a column on `applications`.
  let job = null;
  try { job = await jobRepo.findById(jobId); } catch (_e) { /* leave match_score null */ }

  const decorated = await Promise.all(rows.map(async (row) => {
    const engagement = applicantEngagement(row);
    if (!job) return { ...row, engagement };
    try {
      const candidate = await jobRepo.loadCandidateContext(row.candidate_id);
      if (!candidate) return { ...row, engagement };
      const { score } = matchService.scoreJob(job, candidate);
      return { ...row, engagement, match_score: Number.isFinite(score) ? Math.round(score) : null };
    } catch (_e) {
      return { ...row, engagement };
    }
  }));

  return { rows: decorated, total };
}

async function shortlistApplication(user_id, applicationId) {
  const application = await appRepo.findById(applicationId);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  await appRepo.setStatus(applicationId, 'shortlisted');
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(applicationId);
}

async function rejectApplication(user_id, applicationId, reason) {
  const application = await appRepo.findById(applicationId);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  await appRepo.setStatus(applicationId, 'rejected', reason);
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return appRepo.findById(applicationId);
}

/**
 * Bulk-shortlist every actionable applicant for a job whose AI
 * match score against the job clears the 60% threshold.
 *
 * Used by the company dashboard's "AI Shortlist" CTA — the
 * employer fires it once per job and the service walks the
 * applicant set, scores each candidate against the role, and
 * flips eligible rows to status='shortlisted'.
 *
 * Idempotent: rows already in a downstream state (`shortlisted`,
 * `interview`, `offered`, `hired`, `rejected`, `withdrawn`) are
 * skipped. Re-running the action never undoes a manual decision.
 *
 * Ownership: enforced via `jobRepo.ownsJob()` — an employer can
 * only auto-shortlist applicants for jobs their own company posted.
 *
 * Returns:
 *   {
 *     job_id, threshold,
 *     actionable,                 // applicants the action considered
 *     shortlisted,                // newly flipped to shortlisted
 *     skipped_below_threshold,    // scored under 60 OR no candidate context
 *     shortlisted_application_ids // ids the caller can refetch
 *   }
 */
async function autoShortlistApplicants(user_id, jobId) {
  const owns = await jobRepo.ownsJob(jobId, user_id);
  if (!owns) throw new AppError('Job not found or access denied', 404);

  const job = await jobRepo.findById(jobId);
  if (!job) throw new AppError('Job not found', 404);

  // Over-fetch up to 100 applicants — large enough to cover the
  // active pipeline of every realistic posting; truncated batches
  // can re-run the action without side effects (idempotent).
  const { rows: applicants } = await appRepo.listApplicantsForJob(jobId, {
    page: 1, limit: 100,
  });

  // Only act on rows the employer still owes a decision on.
  // Already-shortlisted/interview/offered/hired/rejected/withdrawn
  // rows are intentionally untouched.
  const ACTIONABLE = new Set(['applied', 'reviewing', 'under_review']);
  const eligible = applicants.filter((a) =>
    ACTIONABLE.has(String(a.status || '').toLowerCase())
  );

  const shortlistedIds = [];
  let belowThreshold = 0;

  for (const app of eligible) {
    const candidate = await jobRepo.loadCandidateContext(app.candidate_id);
    if (!candidate) { belowThreshold += 1; continue; }
    const result = matchService.scoreJob(job, candidate);
    if (result.score >= matchService.ACCEPT_THRESHOLD) {
      await appRepo.setStatus(app.id, 'shortlisted');
      shortlistedIds.push(app.id);
    } else {
      belowThreshold += 1;
    }
  }

  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));

  return {
    job_id: Number(jobId),
    threshold: matchService.ACCEPT_THRESHOLD,
    actionable: eligible.length,
    shortlisted: shortlistedIds.length,
    skipped_below_threshold: belowThreshold,
    shortlisted_application_ids: shortlistedIds,
  };
}

async function scheduleInterview(user_id, payload) {
  const application = await appRepo.findById(payload.application_id);
  if (!application) throw new AppError('Application not found', 404);
  const owns = await jobRepo.ownsJob(application.job_id, user_id);
  if (!owns) throw new AppError('Access denied', 403);
  const id = await interviewRepo.create({
    application_id: payload.application_id,
    job_id: application.job_id,
    company_id: application.company_id,
    candidate_user_id: application.candidate_user_id,
    employer_user_id: user_id,
    scheduled_at: payload.scheduled_at,
    duration_minutes: payload.duration_minutes,
    mode: payload.mode,
    location: payload.location,
    meeting_url: payload.meeting_url,
    notes: payload.notes,
  });
  await appRepo.setStatus(payload.application_id, 'interview');
  await cache.deleteByPattern(cache.Patterns.dashboardStats('employer'));
  return { id, ...payload };
}

async function dashboardStats(user_id) {
  const company = await getCompanyForUser(user_id);
  const key = cache.Keys.dashboardStats('employer', company.id);
  return cache.rememberCache(key, cache.TTL.DASHBOARD_STATS, async () => {
    const apps = await appRepo.statsForCompany(company.id);
    const interviews = await interviewRepo.statsForCompany(company.id);
    const jobs = await jobRepo.listByCompany(company.id, { page: 1, limit: 1 });

    // Time-to-Hire (days). Average of `applied_at → updated_at` deltas
    // for every application currently in `status='hired'`. Updated_at
    // is a reasonable proxy for the moment the row landed in hired
    // because the only employer write that flips an application to
    // hired (`shortlistApplication`/`scheduleInterview`/etc. all
    // touch `updated_at`) sets that timestamp. Returns null when no
    // hires exist yet so the UI hides the tile rather than showing
    // a misleading zero.
    let time_to_hire_days = null;
    try {
      const row = await require('../config/database').queryOne(
        `SELECT AVG(TIMESTAMPDIFF(DAY, applied_at, updated_at)) AS d
           FROM applications
          WHERE company_id = ? AND status = 'hired'
            AND applied_at IS NOT NULL AND updated_at IS NOT NULL`,
        [company.id]
      );
      const n = Number(row?.d);
      if (Number.isFinite(n)) time_to_hire_days = Math.max(0, Math.round(n));
    } catch (_e) { /* leave null on best-effort failure */ }

    return {
      company: { id: company.id, name: company.name, verification_status: company.verification_status },
      applications: apps,
      interviews,
      jobs_total: jobs.total,
      time_to_hire_days,
    };
  });
}

/**
 * "Matching jobs from your company" — used by the candidate detail
 * page when the viewer is the logged-in employer.
 *
 * Steps:
 *   1. Resolve the viewer's company (404 if they're not an owner).
 *   2. Fetch the candidate's PUBLIC profile (404 if they don't exist
 *      or have set the profile private — we don't leak existence).
 *   3. Load the candidate's full match context (skills + experience +
 *      preferences) so `match.service#scoreJob` has everything it
 *      needs.
 *   4. List the company's active, non-expired, approved jobs.
 *   5. Score each, keep only `score > MATCH_FLOOR` (60), sort desc.
 *   6. Decorate each row with the matched-skills overlap (which the
 *      match service doesn't return on its own) so the UI can show
 *      "Matched skills: …" alongside "Missing skills: …".
 *
 * Security: ownership is enforced by sourcing the company id from
 * the auth context (never the request body). A company can only see
 * its own jobs scored against any candidate they're allowed to view.
 */
async function matchingJobsForCandidate(user_id, candidateUserId) {
  const company = await getCompanyForUser(user_id);

  const candidatePublic = await candidateRepo.getPublicCandidate(Number(candidateUserId));
  if (!candidatePublic) throw new AppError('Candidate not found', 404);

  const candidate = await jobRepo.loadCandidateContext(Number(candidateUserId));
  if (!candidate) throw new AppError('Candidate not found', 404);

  // Active jobs only — `exclude_expired:true` filters past-deadline
  // postings AND inactive companies. We over-fetch (limit 100) so the
  // panel doesn't miss a strong match when a company has many roles.
  const { rows: jobs } = await jobRepo.listByCompany(company.id, {
    page: 1, limit: 100, status: 'open', exclude_expired: true,
  });
  if (jobs.length === 0) return { records: [], company_id: company.id };

  const candidateSkillsLower = new Set(
    (candidate.skills || []).map((s) => String(s.name || s).toLowerCase())
  );

  const scored = jobs.map((job) => {
    const result = matchService.scoreJob(job, candidate);
    // Compute the overlap inline — the match service exposes
    // `missing` but not the matched set. Same tokenisation /
    // case-insensitive contains logic as `pickSkillsMatch` so the
    // counts on both sides stay consistent.
    const required = String(job.skills_tags || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const matchedSkills = required.filter((r) =>
      [...candidateSkillsLower].some((h) => h === r || h.includes(r) || r.includes(h))
    );
    return {
      job_id: job.id,
      job_title: job.title,
      company_id: job.company_id,
      company_name: job.company_name,
      match_score: result.score,
      matched_skills: matchedSkills,
      missing_skills: result.missing || [],
      match_reasons: result.reasons || [],
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_currency: job.salary_currency,
      salary_period: job.salary_period,
      location: job.location || job.city || null,
      country: job.country,
      work_mode: job.work_mode,
      is_remote: !!job.is_remote,
      job_type: job.job_type,
      experience_level: job.experience_level,
      category_name: job.category_name,
      application_deadline: job.application_deadline,
      // Carry the carousel-side rendering fields too so the
      // frontend can reuse the shared `<JobCard>` without a
      // second round-trip for full job details.
      is_featured: !!job.is_featured,
      is_global_remote: !!job.is_global_remote,
      published_at: job.published_at || job.created_at || null,
      skills_tags: job.skills_tags,
    };
  })
    .filter((r) => r.match_score > MATCH_FLOOR)
    .sort((a, b) => b.match_score - a.match_score);

  return {
    company_id: company.id,
    candidate_id: Number(candidateUserId),
    floor: MATCH_FLOOR,
    records: scored,
  };
}

/**
 * "Recommended candidates" — the AI-ranked list of candidates that
 * match THIS employer's active jobs above the recommendation floor
 * (50%). Replaces the generic candidate browse for employer viewers.
 *
 * Pipeline (one query per stage — no N+1):
 *
 *   1. Load the company's active, non-expired, approved jobs.
 *   2. Union the skill_tags across all of them to get a search set.
 *   3. SELECT distinct candidate_user_id from candidate_skills where
 *      the skill name overlaps that set AND the candidate's profile
 *      is public — this is the prefilter that keeps the scoring loop
 *      bounded.
 *   4. Bulk-load all candidate profiles + skills + preferences
 *      in three queries (one each) — never per-candidate.
 *   5. In memory: for each candidate, score against every company
 *      job and keep the top 3 matches. Drop candidates whose best
 *      score is at or below 50.
 *   6. Sort by best score desc and return.
 *
 * The endpoint is heavy when a company has many candidates that
 * skill-overlap their jobs — practical caps:
 *   - candidate pool prefilter: 500 candidates max
 *   - jobs scored against: 100 jobs max
 *   - top-3 sub-matches per candidate kept in the response
 */
const RECOMMEND_FLOOR = 50;
const CANDIDATE_PREFILTER_CAP = 500;

async function recommendedCandidates(user_id, { limit = 50 } = {}) {
  const db = require('../config/database');
  const matchService = require('./match.service');

  const company = await getCompanyForUser(user_id);

  // Active company jobs, capped so a runaway dataset can't lock the
  // event loop on scoring.
  const { rows: jobs } = await jobRepo.listByCompany(company.id, {
    page: 1, limit: 100, status: 'open', exclude_expired: true,
  });
  if (jobs.length === 0) {
    return { company_id: company.id, floor: RECOMMEND_FLOOR, records: [] };
  }

  // Gather the union of skill tokens across all company jobs.
  const skillSet = new Set();
  for (const j of jobs) {
    String(j.skills_tags || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .forEach((s) => skillSet.add(s));
  }
  const skillList = [...skillSet];

  // Prefilter: candidates whose listed skills overlap any of the
  // company's job skills. `LOWER(s.name)` so case differences don't
  // miss matches. Returns distinct candidate_user_id only.
  let candidateIds = [];
  if (skillList.length > 0) {
    const placeholders = skillList.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT DISTINCT cs.candidate_user_id
       FROM candidate_skills cs
       INNER JOIN skills s ON s.id = cs.skill_id
       INNER JOIN users u ON u.id = cs.candidate_user_id
       INNER JOIN candidate_profiles cp ON cp.user_id = u.id
       WHERE LOWER(s.name) IN (${placeholders})
         AND u.role = 'candidate'
         AND u.status = 'active'
         AND u.deleted_at IS NULL
         AND cp.is_public = 1
       LIMIT ?`,
      [...skillList, CANDIDATE_PREFILTER_CAP]
    );
    candidateIds = rows.map((r) => Number(r.candidate_user_id));
  }
  if (candidateIds.length === 0) {
    return { company_id: company.id, floor: RECOMMEND_FLOOR, records: [] };
  }

  // Bulk-load context: profiles + skills + preferences in 3 queries
  // total, indexed in memory by user_id. Avoids the N+1 trap of
  // calling jobRepo.loadCandidateContext() per candidate.
  const idPlaceholders = candidateIds.map(() => '?').join(',');
  const [profiles, skillRows, prefRows] = await Promise.all([
    db.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.email,
              cp.headline, cp.current_title, cp.years_experience,
              cp.location, cp.city, cp.country, cp.open_to_remote,
              cp.expected_salary_min, cp.expected_salary_max, cp.salary_currency,
              cp.profile_strength
       FROM users u
       INNER JOIN candidate_profiles cp ON cp.user_id = u.id
       WHERE u.id IN (${idPlaceholders})`,
      candidateIds
    ),
    db.query(
      `SELECT cs.candidate_user_id, s.name
       FROM candidate_skills cs
       INNER JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_user_id IN (${idPlaceholders})`,
      candidateIds
    ),
    db.query(
      `SELECT user_id, preferred_categories, desired_titles, preferred_locations,
              preferred_job_types, job_scope, remote_only
       FROM preferences WHERE user_id IN (${idPlaceholders})`,
      candidateIds
    ),
  ]);

  const skillByUser = new Map();
  for (const r of skillRows) {
    const arr = skillByUser.get(r.candidate_user_id) || [];
    arr.push({ name: r.name });
    skillByUser.set(r.candidate_user_id, arr);
  }
  const prefByUser = new Map(prefRows.map((p) => [p.user_id, p]));

  // Score loop. For each candidate, walk every company job, keep the
  // top 3 sub-matches. ~500 × 100 = 50k score calls; each is pure
  // JS over already-loaded data, so this completes in well under a
  // second for realistic seeds.
  const out = [];
  for (const p of profiles) {
    const skills = skillByUser.get(p.id) || [];
    const prefs = prefByUser.get(p.id) || {};
    const ctx = {
      ...p,
      skills,
      preferred_categories: prefs.preferred_categories || '',
      desired_titles: prefs.desired_titles || '',
      preferred_locations: prefs.preferred_locations || '',
      preferred_job_types: prefs.preferred_job_types || '',
      job_scope: prefs.job_scope || 'hybrid',
      open_to_remote: p.open_to_remote ?? (prefs.remote_only ? 1 : 1),
    };

    const subs = [];
    for (const job of jobs) {
      const res = matchService.scoreJob(job, ctx);
      if (res.score <= RECOMMEND_FLOOR) continue;
      // Compute matched skills overlap inline — match service exposes
      // missing but not matched.
      const required = String(job.skills_tags || '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const have = new Set(skills.map((s) => String(s.name).toLowerCase()));
      const matched = required.filter((r) =>
        [...have].some((h) => h === r || h.includes(r) || r.includes(h))
      );
      subs.push({
        job_id: job.id,
        job_title: job.title,
        match_score: res.score,
        matched_skills: matched,
        missing_skills: res.missing || [],
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_currency: job.salary_currency,
        salary_period: job.salary_period,
        location: job.location || job.city || null,
        work_mode: job.work_mode,
        job_type: job.job_type,
      });
    }
    if (subs.length === 0) continue;
    subs.sort((a, b) => b.match_score - a.match_score);
    const best = subs[0];

    out.push({
      candidate_id: p.id,
      candidate_name: p.full_name,
      profile_image: p.avatar_url,
      title: p.current_title || p.headline || null,
      experience: p.years_experience,
      location: p.location || p.city || p.country || null,
      country: p.country,
      // Email goes in the response for employer viewers — this is an
      // employer-only endpoint so the visibility gate is the role
      // middleware on the route. Phone could go here too once the
      // profile schema exposes it.
      email: p.email,
      profile_strength: p.profile_strength,
      candidate_skills: skills.map((s) => s.name),
      matched_job: best,
      match_score: best.match_score,
      matched_skills: best.matched_skills,
      missing_skills: best.missing_skills,
      top_matching_jobs: subs.slice(0, 3),
    });
  }

  out.sort((a, b) => b.match_score - a.match_score);
  return {
    company_id: company.id,
    floor: RECOMMEND_FLOOR,
    total: out.length,
    records: out.slice(0, limit),
  };
}

module.exports = {
  getCompanyProfile,
  updateCompanyProfile,
  createJob,
  updateJob,
  reactivateJob,
  deleteJob,
  closeJob,
  listMyJobs,
  listApplicants,
  shortlistApplication,
  autoShortlistApplicants,
  rejectApplication,
  scheduleInterview,
  dashboardStats,
  matchingJobsForCandidate,
  recommendedCandidates,
};
