/**
 * ProfileCompletionCard
 *
 * Renders the per-section completion breakdown returned by
 * `GET /candidates/profile-completion`. Drops into both the
 * candidate dashboard and the profile page.
 *
 * Props:
 *   completion: { score, sections: [...] } — server payload as-is
 *   compact?:   reduced vertical density (used inside the dashboard
 *               side rail)
 *
 * No fetching here — the parent owns the API call and re-fetches
 * after every save so the card always reflects current data.
 */
import { Link } from 'react-router-dom';

function Bar({ value, color = 'var(--coral, #E85D3C)' }) {
  return (
    <div style={{ height: 8, width: '100%', background: '#ede7da', borderRadius: 100, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, background: color, transition: 'width 0.6s' }} />
    </div>
  );
}

export default function ProfileCompletionCard({ completion, compact = false }) {
  if (!completion) {
    return (
      <div style={{
        padding: 18, borderRadius: 14, border: '1px solid var(--line, #ede7da)',
        background: 'var(--paper, #fff)', fontSize: 13, color: 'var(--muted, #6b6b6b)',
      }}>
        Loading profile completion…
      </div>
    );
  }

  const score = Number(completion.score || 0);
  const sections = completion.sections || [];
  const missing = sections.filter((s) => !s.complete);

  return (
    <div
      style={{
        padding: compact ? 16 : 22,
        borderRadius: 16,
        border: '1px solid var(--line, #ede7da)',
        background: 'var(--paper, #fff)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted, #6b6b6b)' }}>
          Profile completion
        </span>
        <strong style={{ fontFamily: "'Fraunces',serif", fontSize: compact ? 22 : 26, color: 'var(--coral, #E85D3C)' }}>
          {score}%
        </strong>
      </div>
      <Bar value={score} />

      {!compact && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 16 }}>
          {sections.map((s) => (
            <div key={s.key} style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: s.complete ? 'var(--ink, #1A1A1A)' : 'var(--muted, #6b6b6b)' }}>
                  {s.complete ? '✓ ' : ''}{s.label}
                </span>
                <span style={{ color: 'var(--muted, #6b6b6b)' }}>{s.percent}%</span>
              </div>
              <Bar value={s.percent} color={s.complete ? '#3f7f59' : 'var(--coral, #E85D3C)'} />
            </div>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <div style={{ marginTop: compact ? 12 : 18, paddingTop: 14, borderTop: '1px dashed #ede7da' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--ink, #1A1A1A)' }}>
            Next up to boost your profile
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {missing.slice(0, compact ? 3 : 6).map((s) => (
              <li key={s.key} style={{ fontSize: 12.5, color: 'var(--ink-soft, #3D3D3D)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--coral, #E85D3C)', marginTop: 1 }}>•</span>
                <span>{s.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Link
          to="/profile"
          className="btn btn-coral"
          style={{ padding: '6px 14px', fontSize: 13, textDecoration: 'none' }}
        >
          Edit profile →
        </Link>
        <Link
          to="/profile/review"
          className="btn btn-ghost"
          style={{ padding: '6px 14px', fontSize: 13, textDecoration: 'none' }}
        >
          Review profile
        </Link>
      </div>
    </div>
  );
}
