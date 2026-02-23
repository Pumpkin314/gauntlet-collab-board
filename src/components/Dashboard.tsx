import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/** Placeholder dashboard — will be fleshed out in PR 2. */
export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  if (!currentUser) return null;

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>My Boards</h1>
      <p>Welcome, {currentUser.displayName}</p>
      <button
        onClick={() => navigate('/board/default-board')}
        style={{ marginTop: 16, padding: '10px 20px', cursor: 'pointer' }}
      >
        Open Default Board
      </button>
      <button
        onClick={() => void logout()}
        style={{ marginLeft: 12, padding: '10px 20px', cursor: 'pointer' }}
      >
        Sign Out
      </button>
    </div>
  );
}
