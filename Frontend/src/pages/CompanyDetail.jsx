/**
 * CompanyDetail page (/companies/:id)
 *
 * Public company profile — the destination for the whole-card click
 * on the Companies discovery page. Data: `GET /public/companies/:id`
 * which already bundles the company row plus its non-expired open
 * jobs (filtered by `exclude_expired:true` in the service layer).
 *
 * Layout mirrors JobDetail / CandidateDetail so all three detail
 * pages share one design language:
 *   - hero (logo + name + industry + meta-chips, verification badge)
 *   - two-column body: main (about + active jobs grid) + side
 *     (quick facts, website CTA)
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { publicApi } from '../api/index.js';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import JobCard from '../components/JobCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { viewerForRole } from '../lib/viewer.js';
import { filterActiveJobs } from '../api/adapters.js';

function firstLetter(s) { return (s || '·').trim()[0]?.toUpperCase() || '·'; }

// Reuse the JobCard logo-tone palette so the company hero's logo
// swatch matches the swatch on its job cards. Keeping the tone
// computation here (rather than importing from adapters) avoids
// pulling a private helper across module boundaries.
const LOGO_TONES = ['lg-1', 'lg-2', 'lg-3', 'lg-4', 'lg-5', 'lg-6', 'lg-7', 'lg-8'];
function toneFor(id) {
  const n = Math.abs(Number(id) || 0);
  return LOGO_TONES[n % LOGO_TONES.length];
}

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  // Pass through to every JobCard so employer / admin / guest
  // viewers don't see candidate-only affordances (heart, save,
  // Apply) on a company's job grid.
  const viewer = viewerForRole(role);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    publicApi.company(Number(id))
      .then((data) => { if (!cancelled) setCompany(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '60px 0' }}>
          <LoadingState label="Loading company…" />
        </div>
      </section>
    );
  }

  const notFound = error?.httpStatus === 404 || (!error && !company);
  if (notFound) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '40px 0' }}>
          <EmptyState
            title="Company not found"
            message="This company may have closed its profile, or the link is out of date."
          />
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" type="button" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '40px 0' }}>
          <ErrorState error={error} />
        </div>
      </section>
    );
  }

  const c = company;
  const jobs = filterActiveJobs(c.jobs);
  const isVerified = c.verification_status === 'verified' || c.verification_status === 'approved';

  return (
    <section className="view active" id="view-company-detail">
      <div className="container" style={{ padding: '32px 0 80px' }}>

        <div className="jd-breadcrumb">
          <Link to="/companies">← All companies</Link>
        </div>

        <header className="jd-hero">
          <div className="jd-hero-main">
            <div className={`jd-logo ${toneFor(c.id)}`} aria-hidden="true">
              {c.logo_url
                ? <img src={c.logo_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                : firstLetter(c.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="jd-eyebrow">
                {c.industry || 'Company'}
                {isVerified && <span className="jd-eyebrow-badge">✓ Verified</span>}
                {c.is_featured ? <span className="jd-eyebrow-badge">Featured</span> : null}
              </div>
              <h1 className="jd-title">{c.name}</h1>
              <div className="jd-meta-row">
                {c.location && <span className="meta-chip">{c.location}</span>}
                {c.country && c.country !== c.location && <span className="meta-chip">{c.country}</span>}
                {c.size && <span className="meta-chip">{c.size} employees</span>}
                {c.founded_year && <span className="meta-chip">Founded {c.founded_year}</span>}
              </div>
            </div>
          </div>
        </header>

        <div className="jd-grid">
          <div className="jd-main">
            <section className="jd-section">
              <h2>About {c.name}</h2>
              {c.tagline && (
                <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>{c.tagline}</p>
              )}
              {c.description
                ? <p style={{ whiteSpace: 'pre-line' }}>{c.description}</p>
                : <p className="muted">No description provided.</p>}
            </section>

            <section className="jd-section">
              <h2>Active jobs <small className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {jobs.length} open</small></h2>
              {jobs.length === 0 ? (
                <EmptyState
                  title="No active jobs right now"
                  message="This company isn't actively hiring at the moment. Check back later or follow them for updates."
                />
              ) : (
                <div className="jobs-grid">
                  {jobs.map((j) => (
                    <JobCard key={j.id} job={j} featured viewer={viewer} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="jd-side">
            <div className="jd-card">
              <h3>Quick facts</h3>
              <dl className="jd-facts">
                <div><dt>Industry</dt><dd>{c.industry || '—'}</dd></div>
                <div><dt>Size</dt><dd>{c.size || '—'}</dd></div>
                <div><dt>Founded</dt><dd>{c.founded_year || '—'}</dd></div>
                <div><dt>Location</dt><dd>{c.location || '—'}</dd></div>
                <div><dt>Country</dt><dd>{c.country || '—'}</dd></div>
                <div><dt>Status</dt><dd>{isVerified ? 'Verified' : (c.verification_status || '—')}</dd></div>
                <div><dt>Open roles</dt><dd>{jobs.length}</dd></div>
              </dl>
            </div>

            {c.website && (
              <div className="jd-card">
                <h3>Visit</h3>
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-coral"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Company website ↗
                </a>
              </div>
            )}
          </aside>
        </div>

      </div>
    </section>
  );
}
