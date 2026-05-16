export default function CandidateCard({ candidate, rankTop = false }) {
  return (
    <div className="cand-card">
      <span className={`cand-rank${rankTop ? ' top' : ''}`}>{candidate.rank}</span>
      <div className={`cand-avatar ${candidate.cl}`}>{candidate.a}</div>
      <div className="cand-name">{candidate.n}</div>
      <div className="cand-role">{candidate.role}</div>
      <div className="cand-skills">
        {candidate.skills.map((s) => <span key={s} className="cand-skill">{s}</span>)}
      </div>
      <div className="cand-meta">
        <div><span>Based in</span><span>{candidate.loc}</span></div>
        <div><span>Asking</span><span>{candidate.rate}</span></div>
        <div><span>Rated</span><span className="cand-rating">{candidate.rating}</span></div>
      </div>
    </div>
  );
}
