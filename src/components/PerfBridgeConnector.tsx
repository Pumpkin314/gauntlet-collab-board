/**
 * Connects `window.__perfBridge` to the live BoardContext.
 * Rendered only when VITE_TEST_AUTH_BYPASS=true.
 */

import { useEffect } from 'react';
import { useBoardActions } from '../contexts/BoardContext';
import { initPerfBridge } from '../test-bridge';

export default function PerfBridgeConnector() {
  const { batchCreate, deleteAllObjects, getAllObjects } = useBoardActions();

  useEffect(() => {
    initPerfBridge({ batchCreate, deleteAllObjects, getAllObjects });
  }, [batchCreate, deleteAllObjects, getAllObjects]);

  return null;
}
