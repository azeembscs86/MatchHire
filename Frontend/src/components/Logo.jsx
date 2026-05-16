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
