/**
 * TopBar
 *
 * Thin ink-black utility strip above the main nav. Communicates
 * trust signals (live posting count, customer-base claim) and
 * exposes a Help Center link that doubles as a sign-up CTA.
 */
import { useAuthModal } from '../context/AuthModalContext.jsx';

export default function TopBar() {
  const { openAuth } = useAuthModal();
  return (
    <div className="top-bar">
      <div className="container top-bar-inner">
        <span><span className="live-dot"></span>3,247 new jobs posted this week</span>
        <span>Trusted by 12,000+ companies worldwide • From startups to Fortune 500</span>
        <a href="#" onClick={(e) => { e.preventDefault(); openAuth('candidate'); }}>Help Center →</a>
      </div>
    </div>
  );
}
