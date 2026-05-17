/**
 * Companies discovery page - grid of `CompanyCard`s sourced from
 * `/public/companies`.  The header count is the live `pagination.total`
 * so the eyebrow ("X companies") stays accurate as the catalogue grows.
 */
import { useEffect, useState } from 'react';
import CompanyCard from '../components/CompanyCard.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState.jsx';
import { publicApi } from '../api/index.js';
import { toCompanyCardShape } from '../api/adapters.js';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await publicApi.companies({ page: 1, limit: 24 });
        if (cancelled) return;
        setCompanies((res?.records || []).map(toCompanyCardShape).filter(Boolean));
        setTotal(res?.pagination?.total ?? null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="view active" id="view-companies">
      <div className="page-header">
        <div className="container">
          <span className="eyebrow" style={{ display: 'block', marginBottom: 18 }}>
            ★ {total != null ? Number(total).toLocaleString() : '—'} companies
          </span>
          <h1 className="display">Companies <span className="ital" style={{ fontStyle: 'italic', color: 'var(--coral)' }}>building</span> what's next.</h1>
          <p>From scrappy two-person startups to public giants — discover where you'd love to spend your next four years.</p>
        </div>
      </div>
      <div className="container" style={{ padding: '40px 0 80px' }}>
        {loading
          ? <LoadingState label="Loading companies…" />
          : error
            ? <ErrorState error={error} />
            : companies.length === 0
              ? <EmptyState title="No companies to show" />
              : (
                <div className="co-grid">
                  {companies.map((c) => <CompanyCard key={c.id} company={c} />)}
                </div>
              )}
      </div>
    </section>
  );
}
