import { useParams } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { BoardProvider } from '../contexts/BoardContext';
import type { UserRole } from '../contexts/BoardContext';
import { SelectionProvider } from '../contexts/SelectionContext';
import { useAuth } from '../contexts/AuthContext';
import { getBoardMeta } from '../services/boardService';
import type { BoardMeta } from '../services/boardService';
import AccessDenied from './AccessDenied';
import App from '../App';

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';
const skipSync = import.meta.env.VITE_TEST_SKIP_SYNC === 'true';

const LazyPerfBridge = isTestMode
  ? lazy(() => import('../components/PerfBridgeConnector'))
  : null;

export default function BoardLayout() {
  const { boardId } = useParams<{ boardId: string }>();
  const { currentUser } = useAuth();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!boardId || !currentUser) return;

    // Skip access check in test mode
    if (isTestMode || skipSync) {
      setUserRole('owner');
      setChecking(false);
      return;
    }

    let cancelled = false;
    getBoardMeta(boardId).then((meta: BoardMeta | null) => {
      if (cancelled) return;
      if (!meta) {
        // Board doesn't exist — treat as owner for new boards
        setUserRole('owner');
      } else if (meta.ownerId === currentUser.uid) {
        setUserRole('owner');
      } else if (meta.sharedWith?.[currentUser.uid]) {
        setUserRole(meta.sharedWith[currentUser.uid].role);
      } else {
        setUserRole(null);
      }
      setChecking(false);
    }).catch(() => {
      if (!cancelled) {
        setUserRole(null);
        setChecking(false);
      }
    });

    return () => { cancelled = true; };
  }, [boardId, currentUser]);

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fa',
      }}>
        <div style={{ color: '#888', fontSize: 16 }}>Loading board...</div>
      </div>
    );
  }

  if (!userRole) {
    return <AccessDenied />;
  }

  return (
    <BoardProvider boardId={boardId ?? 'default-board'} userRole={userRole}>
      <SelectionProvider>
        <App />
        {LazyPerfBridge && (
          <Suspense fallback={null}>
            <LazyPerfBridge />
          </Suspense>
        )}
      </SelectionProvider>
    </BoardProvider>
  );
}
