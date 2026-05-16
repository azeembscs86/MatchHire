/**
 * DashboardDropdown
 *
 * Top-right menu that exposes the three dashboards (candidate hub,
 * company hub, admin console). Closes on outside click via a document
 * listener anchored to the wrapper ref — necessary because the menu
 * is rendered outside the trigger's positioning context and React's
 * onBlur doesn't bubble up from arbitrary children.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DashboardDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        className="dash-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className="dot"></span>
        <span>Dashboards</span>
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      <div className={`dash-dropdown${open ? ' open' : ''}`}>
        <div className="dash-opt" onClick={() => go('/dashboard/candidate')}>
          <div className="dash-opt-icon lg-1">★</div>
          <div><strong>Candidate Hub</strong><span>Manage your job hunt</span></div>
        </div>
        <div className="dash-opt" onClick={() => go('/dashboard/company')}>
          <div className="dash-opt-icon lg-2">◆</div>
          <div><strong>Company Hub</strong><span>Manage hiring & applicants</span></div>
        </div>
        <div className="dash-divider"></div>
        <div className="dash-opt" onClick={() => go('/dashboard/admin')}>
          <div className="dash-opt-icon lg-7">◉</div>
          <div><strong>Admin Console</strong><span>Platform administration</span></div>
        </div>
      </div>
    </div>
  );
}
