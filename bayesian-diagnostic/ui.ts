import * as readline from "readline";
import { GRAPH, NODE_LABELS } from "./graph";
import type { Question } from "./questions";
import type { EngineConfig, DiagnosticResult } from "./types";
import { DiagnosticEngine } from "./engine";
import {
  PARENTS_MAP, CHILDREN_MAP, VALID_STATES, STATE_COUNT, INNER_FRINGES,
  describeState, fringeLabel,
} from "./states";

export class TerminalUI {
  private rl: readline.Interface;

  constructor(rl: readline.Interface) {
    this.rl = rl;
  }

  private prompt(query: string): Promise<string> {
    return new Promise((resolve) => this.rl.question(query, resolve));
  }

  showWelcome(): void {
    console.log(
      "\n╔══════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║    Learnie Diagnostic: 3.OA.A.3 → 4.OA.A.1 Bridge     ║"
    );
    console.log(
      "╚══════════════════════════════════════════════════════════╝"
    );
    console.log(
      "\nThis diagnostic pinpoints where a student is on the bridge"
    );
    console.log("from 3rd-grade multiplication word problems to 4th-grade");
    console.log("multiplicative comparison reasoning.\n");
    console.log("You'll answer a few questions. After each one, you'll see");
    console.log("the Bayesian posterior update in real time.\n");
  }

  showKnobs(config: EngineConfig): void {
    const priorLabel = config.populationPrior
      ? "population"
      : config.frontierBelief !== null
        ? `Gaussian(${fringeLabel(`S${config.frontierBelief}`)})`
        : "uniform";
    console.log(
      "┌─────────────────────────────────────────────────────────┐"
    );
    console.log(
      `│  Prior: ${priorLabel}  │  Slip: ${config.slipRate.toFixed(2)}  │  Conf: ${config.confThreshold.toFixed(2)}  │`
    );
    console.log(
      "└─────────────────────────────────────────────────────────┘\n"
    );
  }

  async promptKnobs(
    populationPrior?: Record<string, number>
  ): Promise<EngineConfig> {
    console.log("── Configure diagnostic knobs ──\n");

    if (populationPrior) {
      console.log("  Prior: population-based (from previous diagnostics).");
      console.log("    Enter a number below to override with a manual Gaussian,");
      console.log("    or press Enter to use the population prior.\n");
    } else {
      console.log("  Prior: uniform (no previous diagnostic data).");
      console.log("    Enter a number below to override with a manual Gaussian,");
      console.log("    or press Enter for uniform.\n");
    }

    console.log("  frontierBelief: manual prior override (optional).");
    for (let i = 0; i < STATE_COUNT; i++) {
      const sid = `S${i}`;
      const fl = fringeLabel(sid).padEnd(12);
      const desc =
        i === 0
          ? "no bridge mastery"
          : i === STATE_COUNT - 1
            ? "full bridge mastery"
            : INNER_FRINGES[sid]
                .map((n) => NODE_LABELS[n] || n)
                .join(", ");
      console.log(`    ${i}: ${fl} (${desc})`);
    }
    console.log("");
    console.log("  slipRate (0.05–0.20): P(wrong answer | actually mastered).");
    console.log("    Higher = more forgiving of mistakes. Default: 0.10\n");
    console.log("  confThreshold (0.05–0.40): normalized entropy threshold.");
    console.log(
      "    Lower = more questions before stopping. Default: 0.20\n"
    );

    const fb = await this.prompt(
      `  frontierBelief [${populationPrior ? "population" : "uniform"}]: `
    );
    const sr = await this.prompt("  slipRate [0.10]: ");
    const ct = await this.prompt("  confThreshold [0.20]: ");

    const hasFb = fb.trim() !== "";
    return {
      frontierBelief: hasFb
        ? clamp(parseInt(fb, 10), 0, STATE_COUNT - 1)
        : null,
      slipRate: sr.trim() ? clamp(parseFloat(sr), 0.05, 0.2) : 0.1,
      confThreshold: ct.trim() ? clamp(parseFloat(ct), 0.05, 0.4) : 0.2,
      populationPrior: hasFb ? undefined : populationPrior,
    };
  }

  async askQuestion(
    question: Question
  ): Promise<{ response: "correct" | "incorrect" | "idk" }> {
    console.log(`\n  ${question.prompt}`);
    const input = await this.prompt("\n  Your answer (or 'idk'): ");
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "idk" || lower === "i don't know" || lower === "i dont know") {
      return { response: "idk" };
    }

    if (Array.isArray(question.answer)) {
      if (question.type === "select_all") {
        const userParts = lower
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
          .sort();
        const correct = [...question.answer].map((a) => a.toUpperCase()).sort();
        const match =
          userParts.length === correct.length &&
          userParts.every((v, i) => v === correct[i]);
        return { response: match ? "correct" : "incorrect" };
      } else {
        const userParts = trimmed.split(",").map((s) => s.trim());
        const match =
          userParts.length === question.answer.length &&
          question.answer.every(
            (a, i) => userParts[i]?.toLowerCase() === a.toLowerCase()
          );
        return { response: match ? "correct" : "incorrect" };
      }
    }

    const match = lower === question.answer.toLowerCase();
    return { response: match ? "correct" : "incorrect" };
  }

  showPosterior(engine: DiagnosticEngine): void {
    const BAR_W = 25;
    let maxState = "S0";
    let maxProb = 0;
    for (const [s, p] of Object.entries(engine.posterior)) {
      if (p > maxProb) {
        maxProb = p;
        maxState = s;
      }
    }

    const stateIds = Object.keys(VALID_STATES);
    const maxLabelW = Math.max(...stateIds.map((s) => fringeLabel(s).length));

    console.log("");
    for (const s of stateIds) {
      const p = engine.posterior[s];
      const filled = Math.round(p * BAR_W);
      const bar = "█".repeat(filled) + "░".repeat(BAR_W - filled);
      const pct = (p * 100).toFixed(1).padStart(5);
      const label = fringeLabel(s).padEnd(maxLabelW);
      const marker = s === maxState ? "  ← most likely" : "";
      console.log(`    ${label}: ${bar} ${pct}%${marker}`);
    }

    const maxEntropy = Math.log2(STATE_COUNT);
    const certainty = ((1 - engine.entropy() / maxEntropy) * 100).toFixed(0);
    console.log(`\n    Certainty: ${certainty}%`);
  }

  showUpdate(
    nodeId: string,
    response: "correct" | "incorrect" | "idk",
    engine: DiagnosticEngine
  ): void {
    const sym =
      response === "correct" ? "✓" : response === "incorrect" ? "✗" : "?";
    console.log(
      `\n  ── ${nodeId} (${NODE_LABELS[nodeId]}): ${response.toUpperCase()} ${sym} ──`
    );

    this.showPosterior(engine);

    const next = engine.selectNext();
    if (next && !engine.shouldTerminate()) {
      console.log(
        `\n  Next probe → ${next.nodeId} (P(mastered) = ${next.pMastered.toFixed(2)} — closest to 0.50)`
      );
    }
    console.log("");
  }

  showResult(result: DiagnosticResult): void {
    console.log("\n══════════════════════════════════════════════════════");
    console.log("  DIAGNOSTIC COMPLETE");
    console.log("══════════════════════════════════════════════════════\n");

    const fl = fringeLabel(result.winningState);
    console.log(
      `  Most likely state: ${fl} (${(result.winningProb * 100).toFixed(1)}%)`
    );
    console.log(`  ${describeState(result.winningState)}\n`);

    const fringe = INNER_FRINGES[result.winningState];
    if (fringe.length > 0 && result.masteredNodes.size < GRAPH.nodes.length) {
      const nextSteps = new Set<string>();
      for (const f of fringe)
        for (const c of CHILDREN_MAP[f])
          if (!result.masteredNodes.has(c)) nextSteps.add(c);
      if (nextSteps.size > 0) {
        const nextStr = [...nextSteps]
          .map((n) => `${n} (${NODE_LABELS[n] || n})`)
          .join(", ");
        console.log(`  Frontier at: ${fringe.join(", ")}`);
        console.log(`  Next to teach: ${nextStr}`);
      } else {
        console.log(`  Frontier at: ${fringe.join(", ")} (leaf nodes — mastery boundary)`);
      }
    } else if (result.masteredNodes.size === 0) {
      if (result.anchorPassed) {
        const roots = GRAPH.nodes.filter((n) => PARENTS_MAP[n].length === 0);
        console.log(`  Anchor confirmed, but no bridge nodes mastered.`);
        console.log(`  Start instruction at: ${roots.join(", ")}`);
      } else {
        console.log("  No bridge nodes mastered.");
      }
    } else {
      console.log("  All bridge nodes mastered — full mastery!");
    }

    console.log("\n  ── Final posterior ──");
    const stateIds = Object.keys(VALID_STATES);
    const maxLabelW = Math.max(...stateIds.map((s) => fringeLabel(s).length));
    const BAR_W = 25;
    for (const s of stateIds) {
      const p = result.posterior[s];
      const filled = Math.round(p * BAR_W);
      const bar = "█".repeat(filled) + "░".repeat(BAR_W - filled);
      const pct = (p * 100).toFixed(1).padStart(5);
      const label = fringeLabel(s).padEnd(maxLabelW);
      console.log(`    ${label}: ${bar} ${pct}%`);
    }

    console.log("\n  ── Question history ──");
    result.history.forEach((h, i) => {
      const sym =
        h.response === "correct" ? "✓" : h.response === "incorrect" ? "✗" : "?";
      console.log(
        `    ${i + 1}. ${h.node} (${NODE_LABELS[h.node]}): ${h.response} ${sym}`
      );
    });
  }

  showGraph(result: DiagnosticResult): void {
    const m = result.masteredNodes;
    const assessed = new Set(result.history.map((h) => h.node));

    function tag(node: string): string {
      if (m.has(node)) return "✓";
      if (assessed.has(node)) return "✗";
      return "?";
    }

    function frontierMark(node: string): string {
      if (!m.has(node)) return "";
      if (CHILDREN_MAP[node]?.some((c) => !m.has(c))) return "  ← FRONTIER";
      return "";
    }

    // Compute layer depth for each node (longest path from any root)
    const depth: Record<string, number> = {};
    function getDepth(n: string): number {
      if (depth[n] !== undefined) return depth[n];
      const pars = PARENTS_MAP[n];
      if (!pars || pars.length === 0) {
        depth[n] = 0;
        return 0;
      }
      depth[n] = Math.max(...pars.map(getDepth)) + 1;
      return depth[n];
    }
    GRAPH.nodes.forEach(getDepth);

    const maxD = Math.max(0, ...Object.values(depth));
    const layers: string[][] = [];
    for (let d = 0; d <= maxD; d++) {
      layers.push(GRAPH.nodes.filter((n) => depth[n] === d));
    }

    const W = 50;
    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return " ".repeat(pad) + s;
    };

    /** Draw connector lines between two adjacent layers based on actual edges. */
    function connector(above: string[], below: string[]): void {
      if (above.length === 1 && below.length === 1) {
        console.log(center("│"));
      } else if (above.length === 1 && below.length > 1) {
        const gap = " ".repeat(Math.max(1, below.length * 4 - 1));
        console.log(center("/" + gap + "\\"));
      } else if (above.length > 1 && below.length === 1) {
        const gap = " ".repeat(Math.max(1, above.length * 4 - 1));
        console.log(center("\\" + gap + "/"));
      } else {
        const pipes = above.map(() => "│").join("   ");
        console.log(center(pipes));
      }
    }

    console.log("\n  ── Knowledge Graph ──\n");

    // Anchor
    const anchorLabel = NODE_LABELS.anchor?.split(" — ")[0] || "Anchor";
    console.log(center(`[${anchorLabel}] ${result.anchorPassed ? "✓" : "✗"}`));

    // Layers
    for (let d = 0; d <= maxD; d++) {
      const above = d === 0 ? ["_anchor"] : layers[d - 1];
      connector(above, layers[d]);

      const line = layers[d]
        .map((n) => `[${n}] ${tag(n)}${frontierMark(n)}`)
        .join("   ");
      console.log(center(line));
    }

    // Target
    const allMastered = GRAPH.nodes.every((n) => m.has(n));
    connector(layers[maxD], ["_target"]);
    const targetLabel = NODE_LABELS.target?.split(" — ")[0] || "Target";
    console.log(center(`[${targetLabel}] ${allMastered ? "✓" : "✗"}`));
    console.log("");
  }
}

function clamp(value: number, min: number, max: number): number {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function pickRandom<T>(arr: T[], exclude?: Set<number>): { item: T; index: number } | null {
  const available = arr
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !exclude?.has(index));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}
