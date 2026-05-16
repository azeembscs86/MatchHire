/** Companies discovery page — grid of `CompanyCard`s. */
import { companies } from '../data/companies.js';
import CompanyCard from '../components/CompanyCard.jsx';

export default function Companies() {
  return (
    <section className="view active" id="view-companies">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ 12,400 companies</span>
          <h1 className="display">Companies <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>building</span> what's next.</h1>
          <p>From scrappy two-person startups to public giants — discover where you'd love to spend your next four years.</p>
        </div>
      </div>
      <div className="container" style={{ padding: '40px 0 80px' }}>
        <div className="co-grid">
          {companies.map((c) => <CompanyCard key={c.n} company={c} />)}
        </div>
      </div>
    </section>
  );
}
