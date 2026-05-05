#!/usr/bin/env node
import * as readline from "readline";
import { GRAPH } from "./graph";
import { QUESTIONS } from "./questions";
import type { EngineConfig } from "./types";
import { verifyDownwardClosure } from "./states";
import { DiagnosticEngine } from "./engine";
import { TerminalUI, pickRandom } from "./ui";
import {
  loadPriorData, computePopulationPrior, saveDiagnosticResult, DEFAULT_PRIOR_PATH,
} from "./prior-data";

// ═══════════════════════════════════════════════════════════════════════════
// RUNNER — Main Loop
// ═══════════════════════════════════════════════════════════════════════════

async function runDiagnostic(ui: TerminalUI, priorDataPath: string): Promise<void> {
  const useDefaults = process.argv.includes("--defaults");

  // Step 1: Configure
  ui.showWelcome();

  // Load population prior if available
  const priorData = loadPriorData(priorDataPath);
  let populationPrior: Record<string, number> | undefined;
  if (priorData) {
    populationPrior = computePopulationPrior(priorData);
    console.log(
      `  Population prior loaded from ${priorData.results.length} previous diagnostic(s).\n`
    );
  }

  const config: EngineConfig = useDefaults
    ? { frontierBelief: null, slipRate: 0.1, confThreshold: 0.2, populationPrior }
    : await ui.promptKnobs(populationPrior);
  const engine = new DiagnosticEngine(config);
  ui.showKnobs(config);

  console.log("  ── Initial prior ──");
  ui.showPosterior(engine);
  console.log("");

  // Step 2: Warm start — confirm anchor mastery
  console.log("── Warm Start: Confirming 3rd-grade foundation ──\n");
  const anchorQ = pickRandom(QUESTIONS.anchor);
  if (!anchorQ) {
    console.log("  ERROR: No anchor questions available.");
    return;
  }

  const anchorResult = await ui.askQuestion(anchorQ.item);
  if (anchorResult.response === "idk" || anchorResult.response === "incorrect") {
    const sym = anchorResult.response === "idk" ? "?" : "✗";
    console.log(
      `\n  Anchor: ${anchorResult.response.toUpperCase()} ${sym}`
    );
    console.log(
      "\n  Student does not have anchor mastery (3.OA.A.3)."
    );
    console.log("  Recommendation: 3rd-grade remediation before attempting bridge.\n");
    return;
  }

  console.log("\n  Anchor: CORRECT ✓");
  console.log("  3rd-grade foundation confirmed. Beginning bridge diagnostic.\n");

  // Step 3: Diagnostic loop
  const usedQuestions: Record<string, Set<number>> = {};
  for (const node of GRAPH.nodes) usedQuestions[node] = new Set();

  while (!engine.shouldTerminate()) {
    const selection = engine.selectNext();
    if (!selection) break;

    const nodeId = selection.nodeId;
    const qPick = pickRandom(QUESTIONS[nodeId], usedQuestions[nodeId]);
    if (!qPick) {
      engine.asked.add(nodeId);
      continue;
    }
    usedQuestions[nodeId].add(qPick.index);

    const result = await ui.askQuestion(qPick.item);
    engine.update(nodeId, result.response, qPick.item.guessRate);
    ui.showUpdate(nodeId, result.response, engine);
  }

  // Step 4: Results
  const result = engine.getResult(true);
  ui.showResult(result);
  ui.showGraph(result);

  // Step 5: Save result for future population priors
  saveDiagnosticResult(priorDataPath, {
    timestamp: new Date().toISOString(),
    anchorPassed: true,
    posterior: result.posterior,
  });
  console.log(`  Result saved to ${priorDataPath}\n`);
}

async function main(): Promise<void> {
  if (!verifyDownwardClosure()) {
    console.error("Data integrity check failed. Aborting.");
    process.exit(1);
  }

  // Parse --prior-data flag
  const pdIdx = process.argv.indexOf("--prior-data");
  const priorDataPath =
    pdIdx !== -1 && process.argv[pdIdx + 1]
      ? process.argv[pdIdx + 1]
      : DEFAULT_PRIOR_PATH;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ui = new TerminalUI(rl);

  let again = true;
  while (again) {
    await runDiagnostic(ui, priorDataPath);
    const answer = await new Promise<string>((resolve) =>
      rl.question("Rerun with different settings? (y/n): ", resolve)
    );
    again = answer.trim().toLowerCase().startsWith("y");
    if (again) console.log("\n");
  }

  console.log("\nGoodbye!\n");
  rl.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// BARREL RE-EXPORTS + ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export { GRAPH, NODE_LABELS } from "./graph";
export { QUESTIONS } from "./questions";
export type { Question } from "./questions";
export type { EngineConfig, HistoryEntry, SelectionInfo, DiagnosticResult, PriorDataEntry, PriorDataFile } from "./types";
export {
  PARENTS_MAP, CHILDREN_MAP, VALID_STATES, STATE_COUNT, INNER_FRINGES,
  topologicalSort, generateDownsets, describeState, computeInnerFringe,
  fringeLabel, verifyDownwardClosure,
} from "./states";
export { DiagnosticEngine } from "./engine";
export {
  computeGraphHash, GRAPH_HASH, loadPriorData, computePopulationPrior, saveDiagnosticResult,
} from "./prior-data";

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
