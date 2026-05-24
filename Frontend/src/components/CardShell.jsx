/**
 * CardShell
 *
 * Single source of truth for the outer dimensions, border, shadow,
 * hover effect, and click/keyboard semantics that every clickable
 * tile in the app shares — Job cards, Candidate cards, anything
 * else added later. Inner content is the caller's responsibility;
 * only the outer surface lives here.
 *
 * Why a component instead of just a CSS class:
 *   - The role="button" / tabIndex / onKeyDown plumbing is
 *     identical for every clickable card. Centralising it avoids
 *     subtle drift (different keyboard handling on JobCard vs
 *     CandidateCard).
 *   - The keyboard handler skips activation when focus is on an
 *     inner interactive element (button / anchor / input), so
 *     embedded Apply / Favourite / Save / Contact / Download
 *     buttons keep their own activation without callers having to
 *     remember the rule.
 *
 * Props
 *   - onClick    (req)   navigate / open the linked surface
 *   - ariaLabel  (req)   screen-reader label for the card
 *   - featured           toggles a coral-tinted border treatment
 *   - variant            'grid' (default) or 'row' for compact
 *                        horizontal list layouts (Dashboard
 *                        matches rail). Row drops the min-height.
 *   - className          extra classes (e.g. `job-card`,
 *                        `cand-card`) that style inner layout.
 */
export default function CardShell({
  onClick,
  ariaLabel,
  featured = false,
  variant = 'grid',
  className = '',
  testId,
  children,
}) {
  function handleKey(e) {
    // Activate on Enter / Space — but only when focus is on the
    // card itself, not on an inner button / anchor / input.
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select') return;
    e.preventDefault();
    onClick?.();
  }

  const cls = [
    'card-shell',
    'clickable',
    featured ? 'is-featured' : '',
    variant === 'row' ? 'card-shell-row' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKey}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
