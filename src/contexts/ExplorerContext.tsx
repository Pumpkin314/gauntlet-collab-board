import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AgentMessage } from '../agent/types';
import type { Confidence } from '../agent/quizTypes';
import type { ExplorerState, ExplorerEvent } from '../agent/explorerStateMachine';
import { useExplorerStateMachine } from '../hooks/useExplorerStateMachine';

export interface ExplorerContextValue {
  state: ExplorerState;
  dispatch: (event: ExplorerEvent) => void;
  confidenceMap: Map<string, Confidence>;
  kgNodeMap: Map<string, string>;
  messages: AgentMessage[];
}

const ExplorerCtx = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  children,
  getViewportCenter,
}: {
  children: ReactNode;
  getViewportCenter: () => { x: number; y: number; bounds: { width: number } };
}) {
  const sm = useExplorerStateMachine(getViewportCenter);
  return (
    <ExplorerCtx.Provider value={sm}>
      {children}
    </ExplorerCtx.Provider>
  );
}

export function useExplorerOptional(): ExplorerContextValue | null {
  return useContext(ExplorerCtx);
}

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerCtx);
  if (!ctx) throw new Error('useExplorer must be used within an ExplorerProvider');
  return ctx;
}
