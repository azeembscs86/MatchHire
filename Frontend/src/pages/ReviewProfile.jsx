/**
 * Review Profile page (route: /profile/review)
 *
 * Read-only consolidated view of everything a candidate has filled
 * in — meant for the candidate to "preview" their public-facing
 * profile before hitting Save. Fetches the composite payload from
 * `GET /candidates/review-profile` in one round-trip.
 *
 * Sections (rendered top-down):
 *   1. Header — image + name + headline + completion%
 *   2. Missing sections banner (only when there's at least one)
 *   3. Profile completion breakdown
 *   4. Contact info
 *   5. About / bio
 *   6. Skills (chips)
 *   7. Work experience (current title + years; parsed-resume entries)
 *   8. Education (parsed-resume entries + candidate_profiles.languages)
 *   9. Resume (file name + parse status)
 *   10. Job preferences (desired titles + locations)
 *   11. Social links / portfolio
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { candidatesApi } from '../api/index.js';
import { LoadingState, ErrorState } from '../components/AsyncState.jsx';
import ProfileCompletionCard from '../components/ProfileCompletionCard.jsx';

function Card({ title, hint, children, action }) {
  return (
    <section style={{
      background: 'var(--paper, #fff)', border: '1px solid var(--line, #ede7da)',
      borderRadius: 16, padding: 22, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 18, margin: 0 }}>{title}</h3>
        {action}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted, #6b6b6b)', marginBottom: 10 }}>{hint}</div>}
      {children}
    </section>
  );
}

function EmptyHint({ children }) {
  return (
    <div style={{
      fontSize: 13, color: 'var(--muted, #6b6b6b)',
      background: 'var(--bone, #f5f0e6)', borderRadius: 10, padding: '10px 12px',
    }}>{children}</div>
  );
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '··';
}

function csv(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export default function ReviewProfile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await candidatesApi.reviewProfile();
      setData(d);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '48px 0' }}>
          <LoadingState label="Loading your profile preview…" />
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="view active">
        <div className="container" style={{ padding: '48px 0' }}>
          <ErrorState error={error} onRetry={load} />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const {
    user, profile, image_url, skills = [], preferences,
    resume, parsed, completion, missing = [],
  } = data;
  const desiredTitles = csv(preferences?.desired_titles);
  const preferredLocations = csv(preferences?.preferred_locations);
  const preferredJobTypes = csv(preferences?.preferred_job_types);
  const preferredCategories = csv(preferences?.preferred_categories);

  return (
    <section className="view active">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ Review profile</span>
          <h1 className="display">Preview your <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>public</span> profile.</h1>
          <p>This is what recruiters see. Spot anything missing? Edit and come back.</p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 980, margin: '0 auto', padding: '0 16px 80px' }}>
        {/* Header card with image + identity */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 22, alignItems: 'center',
          background: 'var(--paper, #fff)', border: '1px solid var(--line, #ede7da)',
          borderRadius: 16, padding: 24, marginBottom: 18,
        }}>
          <div
            style={{
              width: 140, height: 140, borderRadius: '50%',
              background: image_url
                ? `center / cover no-repeat url("${image_url}")`
                : 'var(--coral, #E85D3C)',
              color: '#fff', fontFamily: "'Fraunces',serif", fontSize: 44, fontWeight: 500,
              display: 'grid', placeItems: 'center',
              boxShadow: '0 2px 8px rgba(26,26,26,0.08)',
            }}
            aria-label={image_url ? 'Profile image' : `Avatar for ${user?.full_name}`}
          >
            {!image_url && initials(user?.full_name)}
          </div>
          <div>
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, margin: 0, marginBottom: 4 }}>
              {user?.full_name || 'Unnamed candidate'}
            </h2>
            <div style={{ fontSize: 15, color: 'var(--muted, #6b6b6b)', marginBottom: 6 }}>
              {profile?.headline || profile?.current_title || <em>Add a headline to make a strong first impression</em>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted, #6b6b6b)' }}>
              {[profile?.location, profile?.country].filter(Boolean).join(' · ') || '— Location not set —'}
              {profile?.open_to_remote ? ' · Open to remote' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted, #6b6b6b)' }}>
              Profile strength
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 40, color: 'var(--coral, #E85D3C)', lineHeight: 1 }}>
              {completion?.score ?? 0}%
            </div>
            <Link to="/profile" className="btn btn-coral" style={{ marginTop: 14, padding: '6px 14px', fontSize: 13 }}>
              Edit profile →
            </Link>
          </div>
        </div>

        {/* Missing-sections banner */}
        {missing.length > 0 && (
          <div style={{
            background: '#fff7e6', border: '1px solid #e8b574', borderRadius: 12,
            padding: '14px 16px', marginBottom: 18,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#7a4a14' }}>
              {missing.length} section{missing.length === 1 ? '' : 's'} need attention
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {missing.map((m) => (
                <li key={m.key} style={{ fontSize: 13, color: '#7a4a14' }}>
                  <strong>{m.label}</strong> — {m.hint}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Completion breakdown */}
        <div style={{ marginBottom: 18 }}>
          <ProfileCompletionCard completion={completion} />
        </div>

        {/* Contact */}
        <Card title="Contact info">
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, fontSize: 14 }}>
            <span style={{ color: 'var(--muted, #6b6b6b)' }}>Email</span><span>{user?.email}</span>
            <span style={{ color: 'var(--muted, #6b6b6b)' }}>Phone</span>
            <span>{user?.phone || <span style={{ color: 'var(--muted, #6b6b6b)' }}>— not set —</span>}</span>
            <span style={{ color: 'var(--muted, #6b6b6b)' }}>Location</span>
            <span>{[profile?.city, profile?.country].filter(Boolean).join(', ') || profile?.location || <span style={{ color: 'var(--muted, #6b6b6b)' }}>— not set —</span>}</span>
          </div>
        </Card>

        {/* About */}
        <Card title="About">
          {profile?.summary
            ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft, #3D3D3D)' }}>{profile.summary}</p>
            : <EmptyHint>Write 2–4 sentences about your work so recruiters get the gist quickly.</EmptyHint>}
        </Card>

        {/* Skills */}
        <Card
          title={`Skills (${skills.length})`}
          action={skills.length === 0 && (
            <Link to="/profile" style={{ fontSize: 13, color: 'var(--coral, #E85D3C)' }}>Add skills →</Link>
          )}
        >
          {skills.length === 0
            ? <EmptyHint>Add at least 3 skills to get better job matches.</EmptyHint>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {skills.map((s) => (
                  <span key={s.id} style={{
                    padding: '4px 10px', borderRadius: 100, fontSize: 13,
                    background: 'var(--bone, #f5f0e6)', border: '1px solid #e2e0db',
                  }}
                    title={s.proficiency ? `${s.proficiency}${s.years_experience ? ` · ${s.years_experience}y` : ''}` : ''}>
                    {s.name}
                  </span>
                ))}
              </div>
            )}
        </Card>

        {/* Work experience */}
        <Card title="Work experience">
          {!profile?.current_title && (parsed?.experience || []).length === 0
            ? <EmptyHint>Add your current title and years of experience to increase your profile strength.</EmptyHint>
            : (
              <>
                {profile?.current_title && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{profile.current_title}</div>
                    {profile.years_experience != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b6b6b)' }}>
                        {profile.years_experience}+ years of experience
                      </div>
                    )}
                  </div>
                )}
                {Array.isArray(parsed?.experience) && parsed.experience.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted, #6b6b6b)', marginBottom: 6 }}>
                      Extracted from your resume
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {parsed.experience.slice(0, 6).map((line, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--ink-soft, #3D3D3D)', padding: '4px 0' }}>· {line}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
        </Card>

        {/* Education */}
        <Card title="Education">
          {(parsed?.education || []).length === 0 && !profile?.languages
            ? <EmptyHint>Add education by uploading your resume — we extract it automatically.</EmptyHint>
            : (
              <>
                {Array.isArray(parsed?.education) && parsed.education.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 10 }}>
                    {parsed.education.slice(0, 4).map((line, i) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--ink-soft, #3D3D3D)', padding: '4px 0' }}>· {line}</li>
                    ))}
                  </ul>
                )}
                {profile?.languages && (
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: 'var(--muted, #6b6b6b)', fontWeight: 500 }}>Languages: </strong>
                    {profile.languages}
                  </div>
                )}
              </>
            )}
        </Card>

        {/* Resume */}
        <Card title="Resume">
          {resume
            ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <div>
                  <div>📄 {resume.original_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted, #6b6b6b)' }}>
                    {resume.parse_status} · uploaded {new Date(resume.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
                <Link to="/profile" style={{ fontSize: 13, color: 'var(--coral, #E85D3C)' }}>Manage →</Link>
              </div>
            )
            : <EmptyHint>Upload your resume so companies can review your experience.</EmptyHint>}
        </Card>

        {/* Job preferences */}
        <Card title="Job preferences">
          {!preferences || (desiredTitles.length === 0 && preferredLocations.length === 0)
            ? <EmptyHint>Complete job preferences to receive relevant openings.</EmptyHint>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, fontSize: 14 }}>
                {desiredTitles.length > 0 && (
                  <>
                    <span style={{ color: 'var(--muted, #6b6b6b)' }}>Desired titles</span>
                    <span>{desiredTitles.join(', ')}</span>
                  </>
                )}
                {preferredLocations.length > 0 && (
                  <>
                    <span style={{ color: 'var(--muted, #6b6b6b)' }}>Preferred locations</span>
                    <span>{preferredLocations.join(', ')}</span>
                  </>
                )}
                {preferredJobTypes.length > 0 && (
                  <>
                    <span style={{ color: 'var(--muted, #6b6b6b)' }}>Job types</span>
                    <span>{preferredJobTypes.join(', ')}</span>
                  </>
                )}
                {preferredCategories.length > 0 && (
                  <>
                    <span style={{ color: 'var(--muted, #6b6b6b)' }}>Categories</span>
                    <span>{preferredCategories.join(', ')}</span>
                  </>
                )}
              </div>
            )}
        </Card>

        {/* Social links */}
        <Card title="Social links & portfolio">
          {!profile?.linkedin_url && !profile?.portfolio_url && !profile?.github_url
            ? <EmptyHint>Add LinkedIn, portfolio, or GitHub links so recruiters can verify your work.</EmptyHint>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 8, fontSize: 14 }}>
                {profile.linkedin_url && (<><span style={{ color: 'var(--muted, #6b6b6b)' }}>LinkedIn</span><a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--coral, #E85D3C)' }}>{profile.linkedin_url}</a></>)}
                {profile.portfolio_url && (<><span style={{ color: 'var(--muted, #6b6b6b)' }}>Portfolio</span><a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--coral, #E85D3C)' }}>{profile.portfolio_url}</a></>)}
                {profile.github_url && (<><span style={{ color: 'var(--muted, #6b6b6b)' }}>GitHub</span><a href={profile.github_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--coral, #E85D3C)' }}>{profile.github_url}</a></>)}
              </div>
            )}
        </Card>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Link to="/profile" className="btn btn-coral" style={{ padding: '8px 18px' }}>
            Back to edit →
          </Link>
        </div>
      </div>
    </section>
  );
}
