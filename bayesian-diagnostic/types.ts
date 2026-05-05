export interface EngineConfig {
  frontierBelief: number | null;
  slipRate: number;
  confThreshold: number;
  populationPrior?: Record<string, number>;
}

export interface HistoryEntry {
  node: string;
  response: "correct" | "incorrect" | "idk";
  posteriorSnapshot: Record<string, number>;
}

export interface SelectionInfo {
  nodeId: string;
  pMastered: number;
  allProbs: Record<string, number>;
}

export interface DiagnosticResult {
  winningState: string;
  winningProb: number;
  posterior: Record<string, number>;
  history: HistoryEntry[];
  masteredNodes: Set<string>;
  anchorPassed: boolean;
}

export interface PriorDataEntry {
  timestamp: string;
  anchorPassed: boolean;
  posterior: Record<string, number>;
}

export interface PriorDataFile {
  graphHash: string;
  results: PriorDataEntry[];
}
