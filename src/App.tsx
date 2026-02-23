import { useState } from 'react';
import { Link } from 'react-router-dom';
import Canvas from './components/Canvas';
import InactivityWarningModal from './components/InactivityWarningModal';
import { useAuth } from './contexts/AuthContext';
import { useBoard } from './contexts/BoardContext';
import './App.css';

function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
  }
  return name.substring(0, 2);
}

function getColorFromName(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? '#4ECDC4';
}

function App() {
  const { currentUser, logout, showInactivityWarning, stayLoggedIn } = useAuth();
  const { presence } = useBoard();
  const [imageError, setImageError] = useState(false);
  const [showPresence, setShowPresence] = useState(false);

  if (!currentUser) return null;

  return (
    <div className="app">
      {/* Top bar with user profile */}
      <div data-testid="top-bar" className="top-bar">
        <div className="back-nav">
          <Link to="/" className="back-to-dashboard">← Boards</Link>
        </div>
        <div className="user-profile-section">
          <div className="user-profile">
            {currentUser.photoURL && !imageError ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName ?? undefined}
                className="user-avatar"
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className="user-avatar-fallback"
                style={{ background: getColorFromName(currentUser.displayName ?? 'User') }}
              >
                {getInitials(currentUser.displayName ?? 'User')}
              </div>
            )}
            <span data-testid="user-name" className="user-name">{currentUser.displayName}</span>
            <button
              data-testid="presence-toggle-btn"
              onClick={() => setShowPresence(!showPresence)}
              className="presence-toggle-btn"
              title="Active users"
            >
              👥 {presence.length + 1}
            </button>
            <button data-testid="logout-btn" onClick={() => void logout()} className="logout-btn">
              Sign Out
            </button>
          </div>

          {showPresence && (
            <div data-testid="presence-list" className="presence-list">
              <div className="presence-header">Active Users</div>

              {/* Current user */}
              <div className="presence-item current-user">
                {currentUser.photoURL && !imageError ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName ?? undefined}
                    className="presence-avatar"
                  />
                ) : (
                  <div
                    className="presence-avatar-fallback"
                    style={{ background: getColorFromName(currentUser.displayName ?? 'User') }}
                  >
                    {getInitials(currentUser.displayName ?? 'User')}
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
                <div className="presence-empty">No other users online</div>
              )}
            </div>
          )}
        </div>
      </div>

      <Canvas />

      {showInactivityWarning && (
        <InactivityWarningModal
          onStayLoggedIn={stayLoggedIn}
          onSignOut={() => void logout()}
        />
      )}
    </div>
  );
}

export default App;
