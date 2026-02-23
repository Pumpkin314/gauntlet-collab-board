import { useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { BoardProvider } from '../contexts/BoardContext';
import { SelectionProvider } from '../contexts/SelectionContext';
import { useAuth } from '../contexts/AuthContext';
import { getBoardMeta } from '../services/boardService';
import type { BoardMeta } from '../services/boardService';
import AccessDenied from './AccessDenied';
import App from '../App';

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';

const LazyPerfBridge = isTestMode
  ? lazy(() => import('../components/PerfBridgeConnector'))
  : null;

export type UserRole = 'owner' | 'editor' | 'viewer';

function resolveRole(meta: BoardMeta, uid: string): UserRole | null {
  if (meta.ownerId === uid) return 'owner';
  const shared = meta.sharedWith?.[uid];
  if (shared) return shared.role;
  return null;
}

export default function BoardLayout() {
  const { boardId } = useParams<{ boardId: string }>();
  const { currentUser } = useAuth();
  const [accessState, setAccessState] = useState<'loading' | 'granted' | 'denied'>('loading');
  const [userRole, setUserRole] = useState<UserRole>('owner');

  useEffect(() => {
    if (!currentUser || !boardId) return;

    // Skip access check in test mode
    if (import.meta.env.VITE_TEST_AUTH_BYPASS === 'true') {
      setAccessState('granted');
      setUserRole('owner');
      return;
    }

    // Skip Firestore calls when sync is disabled (test env with stub creds)
    if (import.meta.env.VITE_TEST_SKIP_SYNC === 'true') {
      setAccessState('granted');
      setUserRole('owner');
      return;
    }

    let cancelled = false;
    getBoardMeta(boardId).then((meta) => {
      if (cancelled) return;
      if (!meta) {
        // Board doesn't exist — allow creation (backward compat)
        setUserRole('owner');
        setAccessState('granted');
        return;
      }
      const role = resolveRole(meta, currentUser.uid);
      if (role) {
        setUserRole(role);
        setAccessState('granted');
      } else {
        setAccessState('denied');
      }
    }).catch(() => {
      if (!cancelled) setAccessState('granted');
    });
    return () => { cancelled = true; };
  }, [currentUser, boardId]);

  if (accessState === 'loading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#888',
      }}>
        Loading board...
      </div>
    );
  }

  if (accessState === 'denied') {
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
