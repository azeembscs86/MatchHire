/**
 * CandidateSettings — placeholder for the Settings tab inside
 * the candidate dashboard. The deeper account / password /
 * privacy controls already live on Profile + Preferences;
 * Settings here is the future home for notification + email
 * preferences. Keeping the placeholder inside the dashboard
 * shell means the layout doesn't break for users who click the
 * sidebar row.
 */
import { Link } from 'react-router-dom';
import DashEmptyPage from './DashEmptyPage.jsx';

export default function CandidateSettings() {
  return (
    <div className="view active" data-testid="candidate-settings-page" id="view-candidate-settings">
      <DashEmptyPage
        testid="candidate-settings-content"
        icon="⚙"
        eyebrow="Settings"
        display="Tune your"
        emphasis="account"
        intro="Granular notification + privacy controls are on the way. In the meantime, edit your profile or job preferences from the dedicated pages."
        emptyTitle="Settings hub coming soon"
        emptyMessage="Profile details and job preferences live on their own pages — use the buttons below to update them in the meantime."
      />
      <div className="container" style={{ padding: '0 0 80px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/profile" className="btn btn-coral">Edit profile →</Link>
        <Link to="/preferences" className="btn btn-ghost">Job preferences →</Link>
      </div>
    </div>
  );
}
