/**
 * CandidateNotifications — placeholder for the Notifications
 * tab inside the candidate dashboard. The notifications stream
 * isn't wired yet; render the empty state with the rest of the
 * dashboard shell so the layout stays consistent across every
 * sidebar tab.
 */
import DashEmptyPage from './DashEmptyPage.jsx';

export default function CandidateNotifications() {
  return (
    <DashEmptyPage
      testid="candidate-notifications-page"
      icon="◉"
      eyebrow="Notifications"
      display="The latest from your"
      emphasis="job hunt"
      intro="Application status changes, interview invites, and message replies will surface here."
      emptyTitle="You're all caught up"
      emptyMessage="There are no new notifications right now. We'll let you know when something changes."
    />
  );
}
