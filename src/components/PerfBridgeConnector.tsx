/**
 * Connects `window.__perfBridge` to the live BoardContext.
 * Rendered only when VITE_TEST_AUTH_BYPASS=true.
 */

import { useEffect, useRef } from 'react';
import { useBoardActions, useBoard } from '../contexts/BoardContext';
import { initPerfBridge } from '../test-bridge';

export default function PerfBridgeConnector() {
  const { batchCreate, deleteAllObjects, getAllObjects } = useBoardActions();
  const { presence } = useBoard();

  // Ref stays current on every render so getPeerCount never reads a stale closure.
  const presenceRef = useRef(presence);
  useEffect(() => { presenceRef.current = presence; });

  useEffect(() => {
    initPerfBridge({
      batchCreate,
      deleteAllObjects,
      getAllObjects,
      // presence contains only OTHER connected peers (self is excluded)
      getPeerCount: () => presenceRef.current?.length ?? 0,
    });
  }, [batchCreate, deleteAllObjects, getAllObjects]);

  return null;
}
