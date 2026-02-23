import { useParams } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { BoardProvider } from '../contexts/BoardContext';
import { SelectionProvider } from '../contexts/SelectionContext';
import App from '../App';

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';

const LazyPerfBridge = isTestMode
  ? lazy(() => import('../components/PerfBridgeConnector'))
  : null;

export default function BoardLayout() {
  const { boardId } = useParams<{ boardId: string }>();

  return (
    <BoardProvider boardId={boardId ?? 'default-board'}>
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
