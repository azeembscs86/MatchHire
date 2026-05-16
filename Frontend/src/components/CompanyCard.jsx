export default function CompanyCard({ company }) {
  return (
    <div className="co-card">
      <div className="co-head">
        <div className={`co-logo ${company.cl}`}>{company.l}</div>
        <div>
          <div className="co-name">{company.n}</div>
          <div className="co-industry">{company.ind}</div>
        </div>
      </div>
      <div className="co-desc">{company.d}</div>
      <div className="co-stats">
        <div><span>Open roles</span><span>{company.jobs}</span></div>
        <div><span>Team size</span><span>{company.size}</span></div>
      </div>
    </div>
  );
}
