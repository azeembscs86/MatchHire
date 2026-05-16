import { candidates } from '../data/candidates.js';
import CandidateCard from '../components/CandidateCard.jsx';

export default function Candidates() {
  return (
    <section className="view active" id="view-candidates">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ For employers · Top talent</span>
          <h1 className="display">Hand-picked <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>talent</span>, ready to interview.</h1>
          <p>Browse our highest-rated open candidates. Every profile is verified, references checked, and actively job-hunting.</p>
        </div>
      </div>
      <div className="container" style={{ padding: '40px 0 80px' }}>
        <div className="cand-grid">
          {candidates.map((c, i) => <CandidateCard key={c.n} candidate={c} rankTop={i < 3} />)}
        </div>
      </div>
    </section>
  );
}
