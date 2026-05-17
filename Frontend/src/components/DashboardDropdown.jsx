/**
 * DashboardDropdown
 *
 * Role-aware quick-launcher for the dashboards.  When the user's role
 * is passed in (from the Header), we hide options they can't access:
 *
 *   - candidate         -> Candidate Hub only
 *   - employer          -> Company Hub only
 *   - admin/super_admin -> all three (admin oversight)
 *   - undefined         -> shows everything (used before auth hydrates)
 *
 * The dropdown closes on outside click via a document listener anchored
 * to the wrapper ref - the menu renders outside the trigger's
 * positioning context, so React's onBlur doesn't bubble up.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ALL_OPTIONS = [
  {
    role: 'candidate',
    path: '/dashboard/candidate',
    iconClass: 'lg-1',
    glyph: '★',
    title: 'Candidate Hub',
    subtitle: 'Manage your job hunt',
  },
  {
    role: 'employer',
    path: '/dashboard/company',
    iconClass: 'lg-2',
    glyph: '◆',
    title: 'Company Hub',
    subtitle: 'Manage hiring & applicants',
  },
  {
    role: 'admin',
    path: '/dashboard/admin',
    iconClass: 'lg-7',
    glyph: '◉',
    title: 'Admin Console',
    subtitle: 'Platform administration',
  },
];

export default function DashboardDropdown({ role }) {
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

  const options = useMemo(() => {
    if (!role) return ALL_OPTIONS;
    if (role === 'admin' || role === 'super_admin') return ALL_OPTIONS;
    return ALL_OPTIONS.filter((o) => o.role === role);
  }, [role]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        className="dash-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        type="button"
      >
        <span className="dot"></span>
        <span>Dashboards</span>
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      <div className={`dash-dropdown${open ? ' open' : ''}`}>
        {options.map((o, i) => (
          <div key={o.path}>
            {i > 0 && o.role === 'admin' && <div className="dash-divider"></div>}
            <div className="dash-opt" onClick={() => go(o.path)}>
              <div className={`dash-opt-icon ${o.iconClass}`}>{o.glyph}</div>
              <div><strong>{o.title}</strong><span>{o.subtitle}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
