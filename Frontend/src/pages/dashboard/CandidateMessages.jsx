/**
 * CandidateMessages — placeholder for the Messages tab inside
 * the candidate dashboard. The product surface (candidate ↔
 * candidate professional messaging) is implemented on
 * candidate detail pages via MessageModal; this tab will host
 * the inbox view once the threading model ships. Until then we
 * render a polite empty state that keeps the dashboard shell
 * intact instead of leaving the route blank.
 */
import DashEmptyPage from './DashEmptyPage.jsx';

export default function CandidateMessages() {
  return (
    <DashEmptyPage
      testid="candidate-messages-page"
      icon="✉"
      eyebrow="Messages"
      display="Your inbox of"
      emphasis="professional threads"
      intro="When another candidate reaches out from your profile, the conversation will land here."
      emptyTitle="No messages yet"
      emptyMessage="Start a conversation from any candidate's profile — your replies will appear in this inbox."
    />
  );
}
