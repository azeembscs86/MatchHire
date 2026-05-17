/**
 * AsyncState helpers
 *
 * Tiny, design-neutral wrappers used by every page that fetches from
 * the API. They reuse existing CSS classes (`.muted`, `.container`)
 * rather than introducing new styling, so the surrounding page design
 * stays exactly as it was.
 *
 *   <LoadingState label="Loading jobs…" />
 *   <ErrorState error={err} onRetry={refetch} />
 *   <EmptyState title="No jobs yet" message="Try a different filter." />
 */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="async-state" style={{ padding: '24px 0' }}>
      <p className="muted" aria-live="polite">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry, label }) {
  const message = label
    || error?.message
    || 'Something went wrong while loading this section.';
  return (
    <div className="async-state" role="alert" style={{ padding: '20px 0' }}>
      <p className="muted" style={{ color: 'var(--coral, #e8593b)' }}>{message}</p>
      {Array.isArray(error?.errors) && error.errors.length > 0 && (
        <ul className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          {error.errors.map((e, i) => (
            <li key={i}>{e.field ? `${e.field}: ` : ''}{e.message}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button className="btn btn-ghost" onClick={onRetry} style={{ marginTop: 12 }}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = 'Nothing to show yet', message, action }) {
  return (
    <div className="async-state" style={{ padding: '32px 0', textAlign: 'center' }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
