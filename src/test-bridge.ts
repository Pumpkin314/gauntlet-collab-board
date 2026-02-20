/**
 * Performance test bridge — exposes board actions and metrics to Playwright's
 * `page.evaluate()`. Only loaded when VITE_TEST_AUTH_BYPASS=true.
 */

import type { BoardObject, ShapeType } from './types/board';

export interface PerfBridge {
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
  deleteAllObjects(): void;
  getObjects(): BoardObject[];
  getKonvaNodeCount(): number;
  renderCount: number;
  resetRenderCount(): void;
}

declare global {
  interface Window {
    __perfBridge?: PerfBridge;
  }
}

let renderCount = 0;

/** Called from PerfBridgeConnector after BoardContext mounts. */
export function initPerfBridge(ctx: {
  batchCreate: PerfBridge['batchCreate'];
  deleteAllObjects: PerfBridge['deleteAllObjects'];
  getAllObjects: () => BoardObject[];
}) {
  window.__perfBridge = {
    batchCreate: ctx.batchCreate,
    deleteAllObjects: ctx.deleteAllObjects,
    getObjects: ctx.getAllObjects,
    getKonvaNodeCount: () => {
      const K = (window as any).Konva;
      return K?.stages?.[0]?.getLayers()?.[0]?.getChildren()?.length ?? 0;
    },
    get renderCount() { return renderCount; },
    set renderCount(v: number) { renderCount = v; },
    resetRenderCount: () => { renderCount = 0; },
  };
}

export function incrementRenderCount() {
  renderCount++;
}
