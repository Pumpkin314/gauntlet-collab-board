import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserBoards, getSharedBoards, createBoard, deleteBoard } from '../services/boardService';
import type { BoardMeta } from '../services/boardService';
import ConfirmDialog from './ConfirmDialog';
import './Dashboard.css';

function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
  return name.substring(0, 2);
}

function getColorFromName(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length] ?? '#4ECDC4';
}

function timeAgo(ts: { toDate(): Date } | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [sharedBoards, setSharedBoards] = useState<BoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = getUserBoards(currentUser.uid, (b) => {
      setBoards(b);
      setLoading(false);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (import.meta.env.VITE_TEST_SKIP_SYNC === 'true') return;
    const unsub = getSharedBoards(currentUser.uid, setSharedBoards);
    return unsub;
  }, [currentUser]);

  const atBoardLimit = boards.length >= 10;

  const handleCreate = useCallback(async () => {
    if (!currentUser) return;
    const id = await createBoard(currentUser.uid, currentUser.displayName || 'Anonymous');
    navigate(`/board/${id}`);
  }, [currentUser, navigate]);

  const handleDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteBoard(deletingId);
    setDeletingId(null);
  }, [deletingId]);

  if (!currentUser) return null;

  const displayName = currentUser.displayName ?? 'User';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">My Boards</h1>
        <div className="dashboard-user">
          {currentUser.photoURL && !imageError ? (
            <img
              src={currentUser.photoURL}
              alt={displayName}
              className="dashboard-avatar"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="dashboard-avatar-fallback"
              style={{ background: getColorFromName(displayName) }}
            >
              {getInitials(displayName)}
            </div>
          )}
          <span className="dashboard-user-name">{displayName}</span>
          <button onClick={() => void logout()} className="dashboard-logout-btn">
            Sign Out
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <button
          className="board-card new-board-card"
          onClick={() => void handleCreate()}
          disabled={atBoardLimit}
          title={atBoardLimit ? 'Board limit reached (max 10)' : undefined}
          style={atBoardLimit ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        >
          <div className="new-board-icon">+</div>
          <div className="new-board-label">{atBoardLimit ? 'Limit Reached' : 'New Board'}</div>
        </button>

        {boards.map((board) => (
          <div
            key={board.id}
            className="board-card"
            onClick={() => navigate(`/board/${board.id}`)}
          >
            <div className="board-card-preview" />
            <div className="board-card-info">
              <div className="board-card-title">{board.title}</div>
              <div className="board-card-meta">{timeAgo(board.updatedAt)}</div>
            </div>
            <button
              className="board-card-delete"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingId(board.id);
              }}
              title="Delete board"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {sharedBoards.length > 0 && (
        <>
          <h2 className="dashboard-section-title">Shared with me</h2>
          <div className="dashboard-grid">
            {sharedBoards.map((board) => {
              const myShare = board.sharedWith?.[currentUser.uid];
              return (
                <div
                  key={board.id}
                  className="board-card"
                  onClick={() => navigate(`/board/${board.id}`)}
                >
                  <div className="board-card-preview" />
                  <div className="board-card-info">
                    <div className="board-card-title">{board.title}</div>
                    <div className="board-card-meta">
                      {board.ownerName}
                      {myShare && (
                        <span className="board-card-role-badge">{myShare.role}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {sharedBoards.length > 0 && (
        <>
          <h2 className="dashboard-section-title">Shared with me</h2>
          <div className="dashboard-grid">
            {sharedBoards.map((board) => {
              const myRole = board.sharedWith?.[currentUser.uid]?.role;
              return (
                <div
                  key={board.id}
                  className="board-card"
                  onClick={() => navigate(`/board/${board.id}`)}
                >
                  <div className="board-card-preview" />
                  <div className="board-card-info">
                    <div className="board-card-title">{board.title}</div>
                    <div className="board-card-meta">
                      {board.ownerName}
                      {myRole && (
                        <span className="board-card-role-badge">{myRole}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete Board"
          message="This board and all its contents will be permanently deleted."
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
