import { useState } from 'react';
import Canvas from './components/Canvas';
import TestSync from './components/TestSync';
import Login from './components/Login';
import { useAuth } from './contexts/AuthContext';
import './App.css';

function App() {
  const { currentUser, logout } = useAuth();
  const [view, setView] = useState('canvas'); // 'canvas' or 'test-sync'
  const [imageError, setImageError] = useState(false);

  // Show login screen if not authenticated
  if (!currentUser) {
    return <Login />;
  }

  // Get user initials for fallback avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0] + parts[parts.length - 1][0];
    }
    return name.substring(0, 2);
  };

  // Generate color from name
  const getColorFromName = (name) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="app">
      {/* User profile and view toggle */}
      <div className="top-bar">
        <div className="view-toggle">
          <button
            className={view === 'canvas' ? 'active' : ''}
            onClick={() => setView('canvas')}
          >
            Canvas (Konva)
          </button>
          <button
            className={view === 'test-sync' ? 'active' : ''}
            onClick={() => setView('test-sync')}
          >
            Test Firestore Sync
          </button>
        </div>

        {/* User profile */}
        <div className="user-profile">
          {currentUser.photoURL && !imageError ? (
            <img
              src={currentUser.photoURL}
              alt={currentUser.displayName}
              className="user-avatar"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="user-avatar-fallback"
              style={{ background: getColorFromName(currentUser.displayName || 'User') }}
            >
              {getInitials(currentUser.displayName || 'User')}
            </div>
          )}
          <span className="user-name">{currentUser.displayName}</span>
          <button onClick={logout} className="logout-btn">
            Sign Out
          </button>
        </div>
      </div>

      {/* Render selected view */}
      {view === 'canvas' ? <Canvas /> : <TestSync />}
    </div>
  );
}

export default App;
