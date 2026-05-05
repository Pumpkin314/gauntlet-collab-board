import { GRAPH } from "./graph";
import type { EngineConfig, HistoryEntry, SelectionInfo, DiagnosticResult } from "./types";
import { VALID_STATES } from "./states";

export class DiagnosticEngine {
  posterior: Record<string, number>;
  asked: Set<string>;
  history: HistoryEntry[];
  private slipRate: number;
  private confThreshold: number;

  constructor(config: EngineConfig) {
    this.slipRate = config.slipRate;
    this.confThreshold = config.confThreshold;
    this.posterior = this.buildPrior(config);
    this.asked = new Set();
    this.history = [];
  }

  private buildPrior(config: EngineConfig): Record<string, number> {
    const stateIds = Object.keys(VALID_STATES);

    // Priority 1: manual Gaussian override (frontierBelief knob)
    if (config.frontierBelief !== null) {
      const sigma = 1.5;
      const weights = stateIds.map((_, i) =>
        Math.exp(-0.5 * ((i - config.frontierBelief!) / sigma) ** 2)
      );
      const total = weights.reduce((a, b) => a + b, 0);
      const prior: Record<string, number> = {};
      stateIds.forEach((s, i) => (prior[s] = weights[i] / total));
      return prior;
    }

    // Priority 2: population prior from previous diagnostics
    if (config.populationPrior) {
      const prior: Record<string, number> = {};
      let total = 0;
      for (const s of stateIds) {
        prior[s] = config.populationPrior[s] ?? 0;
        total += prior[s];
      }
      if (total > 0) {
        for (const s of stateIds) prior[s] /= total;
        return prior;
      }
    }

    // Priority 3: uniform (default)
    const prior: Record<string, number> = {};
    const p = 1 / stateIds.length;
    for (const s of stateIds) prior[s] = p;
    return prior;
  }

  stateContains(stateId: string, nodeId: string): boolean {
    return VALID_STATES[stateId].has(nodeId);
  }

  update(
    nodeId: string,
    response: "correct" | "incorrect" | "idk",
    guessRate: number
  ): void {
    for (const stateId of Object.keys(this.posterior)) {
      const mastered = this.stateContains(stateId, nodeId);
      let likelihood: number;
      if (response === "correct") {
        likelihood = mastered ? 1 - this.slipRate : guessRate;
      } else if (response === "incorrect") {
        likelihood = mastered ? this.slipRate : 1 - guessRate;
      } else {
        likelihood = mastered ? 0.02 : 0.95;
      }
      this.posterior[stateId] *= likelihood;
    }
    const total = Object.values(this.posterior).reduce((a, b) => a + b, 0);
    for (const s of Object.keys(this.posterior)) {
      this.posterior[s] /= total;
    }
    this.asked.add(nodeId);
    this.history.push({
      node: nodeId,
      response,
      posteriorSnapshot: { ...this.posterior },
    });
  }

  getNodeProbabilities(): Record<string, number> {
    const probs: Record<string, number> = {};
    for (const nodeId of GRAPH.nodes) {
      let p = 0;
      for (const [stateId, prob] of Object.entries(this.posterior)) {
        if (this.stateContains(stateId, nodeId)) p += prob;
      }
      probs[nodeId] = p;
    }
    return probs;
  }

  selectNext(): SelectionInfo | null {
    const probs = this.getNodeProbabilities();
    let bestNode: string | null = null;
    let bestDist = Infinity;
    for (const nodeId of GRAPH.nodes) {
      if (this.asked.has(nodeId)) continue;
      const dist = Math.abs(probs[nodeId] - 0.5);
      if (dist < bestDist) {
        bestDist = dist;
        bestNode = nodeId;
      }
    }
    if (bestNode === null) return null;
    return {
      nodeId: bestNode,
      pMastered: probs[bestNode],
      allProbs: probs,
    };
  }

  entropy(): number {
    let h = 0;
    for (const p of Object.values(this.posterior)) {
      if (p > 0) h -= p * Math.log2(p);
    }
    return h;
  }

  shouldTerminate(): boolean {
    const maxEntropy = Math.log2(Object.keys(VALID_STATES).length);
    return this.entropy() / maxEntropy < this.confThreshold;
  }

  getResult(anchorPassed = false): DiagnosticResult {
    let winningState = "S0";
    let winningProb = 0;
    for (const [s, p] of Object.entries(this.posterior)) {
      if (p > winningProb) {
        winningProb = p;
        winningState = s;
      }
    }
    return {
      winningState,
      winningProb,
      posterior: { ...this.posterior },
      history: [...this.history],
      masteredNodes: new Set(VALID_STATES[winningState]),
      anchorPassed,
    };
  }
}
