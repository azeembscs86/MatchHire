import { jobs } from '../data/jobs.js';
import JobCard from '../components/JobCard.jsx';

export default function Jobs() {
  return (
    <section className="view active" id="view-jobs">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>★ 48,209 open roles</span>
          <h1 className="display">All <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)', fontVariationSettings: '"SOFT" 100,"WONK" 1' }}>opportunities</span>.</h1>
          <p>Filter by what matters: location, salary, stack, company stage. We index roles from 12,400 vetted employers.</p>
        </div>
      </div>

      <div className="container browse-layout">
        <aside className="filters">
          <div className="filter-group">
            <h4>Job type</h4>
            <label className="filter-opt"><span><input type="checkbox" defaultChecked />Full-time</span><span>32,401</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Contract</span><span>9,872</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Part-time</span><span>3,108</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Internship</span><span>2,828</span></label>
          </div>
          <div className="filter-group">
            <h4>Location</h4>
            <label className="filter-opt"><span><input type="checkbox" defaultChecked />Remote</span><span>18,221</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Hybrid</span><span>14,910</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Onsite</span><span>15,078</span></label>
          </div>
          <div className="filter-group">
            <h4>Experience</h4>
            <label className="filter-opt"><span><input type="checkbox" />Entry level</span><span>6,402</span></label>
            <label className="filter-opt"><span><input type="checkbox" defaultChecked />Mid-level</span><span>21,309</span></label>
            <label className="filter-opt"><span><input type="checkbox" defaultChecked />Senior</span><span>14,883</span></label>
            <label className="filter-opt"><span><input type="checkbox" />Lead/Staff</span><span>5,615</span></label>
          </div>
          <div className="filter-group">
            <h4>Salary range</h4>
            <label className="filter-opt"><span>$50K – $80K</span><span>4,201</span></label>
            <label className="filter-opt"><span>$80K – $120K</span><span>11,328</span></label>
            <label className="filter-opt"><span>$120K – $180K</span><span>18,402</span></label>
            <label className="filter-opt"><span>$180K+</span><span>14,278</span></label>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Reset filters</button>
        </aside>

        <div>
          <div className="browse-results-head">
            <div className="results-count"><strong>2,418</strong> matching jobs</div>
            <select className="sort-select">
              <option>Most relevant</option>
              <option>Newest first</option>
              <option>Highest salary</option>
            </select>
          </div>
          <div className="jobs-list">
            {jobs.map((j, i) => <JobCard key={i} job={j} idx={i} featured />)}
          </div>
        </div>
      </div>
    </section>
  );
}
