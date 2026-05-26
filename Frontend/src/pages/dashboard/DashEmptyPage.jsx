/**
 * DashEmptyPage
 *
 * Shared empty-state shell for candidate dashboard tabs that
 * surface a feature still in development (Messages,
 * Notifications, Settings). Renders the same page-header /
 * container chrome as Applications + Favourites + Saved-for-
 * Later so navigating between tabs feels seamless inside the
 * dashboard layout — the layout never collapses just because a
 * tab has no live data yet.
 *
 * Each placeholder exposes a stable data-testid built from the
 * tab key, so QA can assert the tab mounted without coupling
 * to the headline copy.
 */
import { EmptyState } from '../../components/AsyncState.jsx';

export default function DashEmptyPage({
  testid,
  eyebrow,
  display,
  emphasis,
  intro,
  emptyTitle,
  emptyMessage,
  icon = '○',
}) {
  return (
    <section
      className="view active"
      id={`view-${testid}`}
      data-testid={testid}
    >
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            {icon} {eyebrow}
          </span>
          <h1 className="display">
            {display}{' '}
            <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>{emphasis}</span>
            .
          </h1>
          {intro && <p>{intro}</p>}
        </div>
      </div>

      <div className="container" style={{ padding: '40px 0 80px' }}>
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    </section>
  );
}
