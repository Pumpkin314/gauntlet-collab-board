import { useState } from 'react';
import Canvas from './components/Canvas';
import TestSync from './components/TestSync';
import Login from './components/Login';
import { useAuth } from './contexts/AuthContext';
import { useBoard } from './contexts/BoardContext';
import './App.css';

function App() {
  const { currentUser, logout } = useAuth();
  const { presence } = useBoard();
  const [view, setView] = useState('canvas'); // 'canvas' or 'test-sync'
  const [imageError, setImageError] = useState(false);
  const [showPresence, setShowPresence] = useState(false);

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
        <div className="user-profile-section">
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
            <button
              onClick={() => setShowPresence(!showPresence)}
              className="presence-toggle-btn"
              title="Active users"
            >
              👥 {presence.length + 1}
            </button>
            <button onClick={logout} className="logout-btn">
              Sign Out
            </button>
          </div>

          {/* Presence list */}
          {showPresence && (
            <div className="presence-list">
              <div className="presence-header">Active Users</div>

              {/* Current user */}
              <div className="presence-item current-user">
                {currentUser.photoURL && !imageError ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName}
                    className="presence-avatar"
                  />
                ) : (
                  <div
                    className="presence-avatar-fallback"
                    style={{ background: getColorFromName(currentUser.displayName || 'User') }}
                  >
                    {getInitials(currentUser.displayName || 'User')}
                  </div>
                )}
                <span className="presence-name">{currentUser.displayName} (you)</span>
              </div>

              {/* Other users */}
              {presence.map((user) => (
                <div key={user.id} className="presence-item">
                  <div
                    className="presence-avatar-fallback"
                    style={{ background: user.userColor }}
                  >
                    {getInitials(user.userName)}
                  </div>
                  <span className="presence-name">{user.userName}</span>
                  <div
                    className="presence-color-indicator"
                    style={{ background: user.userColor }}
                    title="Cursor color"
                  />
                </div>
              ))}

              {presence.length === 0 && (
                <div className="presence-empty">
                  No other users online
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Render selected view */}
      {view === 'canvas' ? <Canvas /> : <TestSync />}
    </div>
  );
}

export default App;
