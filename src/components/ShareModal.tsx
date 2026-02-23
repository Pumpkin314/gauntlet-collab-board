import { useState, useEffect, useCallback } from 'react';
import { lookupUserByEmail } from '../services/userService';
import {
  shareBoardWith,
  removeBoardShare,
  updateShareRole,
  getBoardMeta,
} from '../services/boardService';
import type { BoardMeta, SharedUser } from '../services/boardService';
import type { UserRole } from '../contexts/BoardContext';

interface Props {
  boardId: string;
  boardMeta: BoardMeta;
  currentUid: string;
  currentRole: UserRole;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ShareModal({ boardId, boardMeta: initialMeta, currentUid, currentRole, onClose, onUpdated }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [boardMeta, setBoardMeta] = useState<BoardMeta | null>(initialMeta);

  const isOwner = currentRole === 'owner';

  const refreshMeta = useCallback(() => {
    getBoardMeta(boardId).then((meta) => {
      setBoardMeta(meta);
      onUpdated();
    }).catch(() => {});
  }, [boardId, onUpdated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleShare = async () => {
    if (!email.trim()) return;
    setError('');
    setSharing(true);
    try {
      const target = await lookupUserByEmail(email.trim());
      if (!target) {
        setError('No user found with that email. They must sign in at least once first.');
        setSharing(false);
        return;
      }
      if (target.uid === currentUid) {
        setError("You can't share a board with yourself.");
        setSharing(false);
        return;
      }
      await shareBoardWith(boardId, target.uid, {
        email: target.email,
        displayName: target.displayName,
        role,
      });
      setEmail('');
      refreshMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    }
    setSharing(false);
  };

  const handleRemove = async (uid: string) => {
    await removeBoardShare(boardId, uid);
    refreshMeta();
  };

  const handleRoleChange = async (uid: string, newRole: 'editor' | 'viewer') => {
    await updateShareRole(boardId, uid, newRole);
    refreshMeta();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const collaborators: Array<{ uid: string } & SharedUser> = boardMeta?.sharedWith
    ? Object.entries(boardMeta.sharedWith).map(([uid, user]) => ({ uid, ...user }))
    : [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 12, padding: 28, width: 440,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Share Board</div>

        {/* Copy link */}
        <button
          onClick={handleCopyLink}
          style={{
            width: '100%', padding: '10px 16px', background: '#f5f7fa',
            border: '2px solid #ddd', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, marginBottom: 20, textAlign: 'left',
          }}
        >
          {copied ? 'Link copied!' : 'Copy board link'}
        </button>

        {/* Add user form — owner only */}
        {isOwner && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>
              Add people
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleShare(); }}
                style={{
                  flex: 1, padding: '8px 12px', border: '2px solid #ddd',
                  borderRadius: 8, fontSize: 14, outline: 'none',
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                style={{
                  padding: '8px 12px', border: '2px solid #ddd',
                  borderRadius: 8, fontSize: 14, background: 'white',
                }}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={() => void handleShare()}
                disabled={sharing || !email.trim()}
                style={{
                  padding: '8px 16px', background: '#4ECDC4', color: 'white',
                  border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14,
                  cursor: sharing ? 'default' : 'pointer',
                  opacity: sharing || !email.trim() ? 0.6 : 1,
                }}
              >
                Share
              </button>
            </div>
            {error && (
              <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 6 }}>{error}</div>
            )}
          </div>
        )}

        {/* Collaborator list */}
        {collaborators.length > 0 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>
              People with access
            </div>
            {collaborators.map((collab) => (
              <div
                key={collab.uid}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid #eee',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{collab.displayName}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{collab.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isOwner ? (
                    <>
                      <select
                        value={collab.role}
                        onChange={(e) =>
                          void handleRoleChange(collab.uid, e.target.value as 'editor' | 'viewer')
                        }
                        style={{
                          padding: '4px 8px', border: '1px solid #ddd',
                          borderRadius: 6, fontSize: 13, background: 'white',
                        }}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => void handleRemove(collab.uid)}
                        style={{
                          background: 'none', border: 'none', color: '#ff6b6b',
                          cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span style={{
                      fontSize: 12, color: '#888', background: '#f0f0f0',
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      {collab.role}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Close button */}
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', background: 'white', border: '2px solid #ddd',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
