import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="foot-grid">
          <div className="foot-col foot-brand">
            <Logo />
            <p>A curated career marketplace for senior talent and the companies smart enough to hire them.</p>
          </div>
          <div className="foot-col">
            <h5>For candidates</h5>
            <ul>
              <li><Link to="/jobs">Browse jobs</Link></li>
              <li><Link to="/profile">Build profile</Link></li>
              <li><Link to="/companies">Companies</Link></li>
              <li><a href="#">Salary guide</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>For employers</h5>
            <ul>
              <li><Link to="/employer-onboarding">Post a job</Link></li>
              <li><Link to="/candidates">Find candidates</Link></li>
              <li><a href="#">Pricing</a></li>
              <li><a href="#">Hiring resources</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Company</h5>
            <ul>
              <li><a href="#">About us</a></li>
              <li><a href="#">Press</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Legal</h5>
            <ul>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
              <li><a href="#">Cookies</a></li>
              <li><a href="#">Security</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 MatchHire Inc. · Karachi · San Francisco · Berlin</span>
          <div className="sl">
            <a href="#" aria-label="X">𝕏</a>
            <a href="#" aria-label="LinkedIn">in</a>
            <a href="#" aria-label="GitHub">⌗</a>
            <a href="#" aria-label="Dribbble">●</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
