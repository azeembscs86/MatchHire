/**
 * Logo
 *
 * Brand mark + word mark. Used in the main header and the footer.
 * Clicking it always returns to the home route.
 *
 * @param {object} props
 * @param {React.CSSProperties} [props.style] - Inline style override
 *   (the footer variant tweaks margin and colour).
 */
import { useNavigate } from 'react-router-dom';

export default function Logo({ style }) {
  const navigate = useNavigate();
  return (
    <div className="logo" onClick={() => navigate('/')} style={style}>
      <div className="logo-mark">M</div>
      <div className="logo-text">Match<em>Hire</em></div>
    </div>
  );
}
