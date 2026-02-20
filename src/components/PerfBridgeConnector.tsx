/**
 * Connects `window.__perfBridge` to the live BoardContext.
 * Rendered only when VITE_TEST_AUTH_BYPASS=true.
 */

import { useEffect } from 'react';
import { useBoard } from '../contexts/BoardContext';
import { initPerfBridge } from '../test-bridge';

export default function PerfBridgeConnector() {
  const { batchCreate, deleteAllObjects, getAllObjects } = useBoard();

  useEffect(() => {
    initPerfBridge({ batchCreate, deleteAllObjects, getAllObjects });
  }, [batchCreate, deleteAllObjects, getAllObjects]);

  return null;
}
