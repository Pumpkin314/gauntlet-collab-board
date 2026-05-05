#!/usr/bin/env node
/**
 * Headless engine tests — no UI, no stdin.
 * Simulates two student profiles and verifies posterior convergence.
 * Also tests auto-generation of valid states from graph topology.
 */

import {
  DiagnosticEngine,
  VALID_STATES,
  STATE_COUNT,
  GRAPH,
  QUESTIONS,
  PARENTS_MAP,
  CHILDREN_MAP,
  GRAPH_HASH,
  verifyDownwardClosure,
  generateDownsets,
  topologicalSort,
  describeState,
  computePopulationPrior,
} from "./diagnostic";
import type { EngineConfig } from "./diagnostic";

const PASS = "✓ PASS";
const FAIL = "✗ FAIL";
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ${PASS}: ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}: ${label}`);
    failed++;
  }
}

function printPosterior(engine: DiagnosticEngine, label: string): void {
  console.log(`\n    [${label}]`);
  for (const s of Object.keys(VALID_STATES)) {
    const p = engine.posterior[s];
    const bar = "█".repeat(Math.round(p * 30)) + "░".repeat(30 - Math.round(p * 30));
    console.log(`      ${s}: ${bar} ${(p * 100).toFixed(1)}%`);
  }
  const maxE = Math.log2(STATE_COUNT);
  console.log(`      Certainty: ${((1 - engine.entropy() / maxE) * 100).toFixed(0)}%`);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ── Test 1: Auto-generated states match expected ──────────────────────

console.log("\n═══ Test 1: Data integrity + auto-generation ═══\n");
assert(verifyDownwardClosure(), "All auto-generated states are downward-closed");
assert(STATE_COUNT === 23, `Expected 23 valid states for this graph, got ${STATE_COUNT}`);

const prefix = ["EQ1", "EQ2a", "EQ2b", "EQ3"];
const full = [...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a", "SYM1b", "SYM2", "SYM3a", "SYM3b"];
const expectedStates: Set<string>[] = [
  new Set(),                                                              // S0
  new Set(["EQ1"]),                                                        // S1
  new Set(["EQ1", "EQ2a"]),                                                // S2
  new Set(["EQ1", "EQ2b"]),                                                // S3
  new Set(["EQ1", "EQ2a", "EQ2b"]),                                        // S4
  new Set(prefix),                                                         // S5: ..EQ3
  new Set([...prefix, "COMP1"]),                                           // S6: COMP1 branch
  new Set([...prefix, "DISC1"]),                                           // S7: DISC1 branch
  new Set([...prefix, "COMP1", "COMP2"]),                                  // S8
  new Set([...prefix, "COMP1", "DISC1"]),                                  // S9
  new Set([...prefix, "COMP1", "COMP2", "COMP3"]),                         // S10
  new Set([...prefix, "COMP1", "COMP2", "DISC1"]),                         // S11
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4"]),                // S12
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "DISC1"]),                // S13
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1"]),       // S14: both branches complete
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2"]), // S15: ..DISC2
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a"]),               // S16
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1b"]),               // S17
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a", "SYM1b"]),      // S18
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a", "SYM1b", "SYM2"]), // S19
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a", "SYM1b", "SYM2", "SYM3a"]),  // S20
  new Set([...prefix, "COMP1", "COMP2", "COMP3", "COMP4", "DISC1", "DISC2", "SYM1a", "SYM1b", "SYM2", "SYM3b"]),  // S21
  new Set(full),                                                           // S22: all
];
for (let i = 0; i < expectedStates.length; i++) {
  const stateId = `S${i}`;
  assert(
    setsEqual(VALID_STATES[stateId], expectedStates[i]),
    `${stateId} = {${[...expectedStates[i]].join(", ")}} ✓`
  );
}

const topo = topologicalSort();
assert(topo.length === GRAPH.nodes.length, `Topo sort covers all ${GRAPH.nodes.length} nodes`);
// Verify topological ordering: for every edge u→v, u appears before v
for (const [u, v] of GRAPH.edges) {
  assert(
    topo.indexOf(u) < topo.indexOf(v),
    `Topo order: ${u} before ${v}`
  );
}

for (const nodeId of GRAPH.nodes) {
  const qs = QUESTIONS[nodeId];
  assert(
    qs && qs.length >= 2,
    `${nodeId} has ${qs?.length ?? 0} questions (need ≥ 2)`
  );
}
assert(
  QUESTIONS.anchor && QUESTIONS.anchor.length >= 1,
  `Anchor has ${QUESTIONS.anchor?.length ?? 0} questions (need ≥ 1)`
);

// ── Test 2: Auto-generated state descriptions ─────────────────────────

console.log("\n═══ Test 2: State descriptions ═══\n");

const d0 = describeState("S0");
assert(d0.includes("No bridge"), `S0 description mentions no mastery: "${d0}"`);

const dMax = describeState(`S${STATE_COUNT - 1}`);
assert(dMax.includes("Full bridge mastery"), `S${STATE_COUNT - 1} description: "${dMax}"`);

const d2 = describeState("S2");
assert(d2.includes("SYM2") || d2.includes("Next"), `S2 description mentions next steps: "${d2}"`);

for (let i = 0; i < STATE_COUNT; i++) {
  const desc = describeState(`S${i}`);
  assert(desc.length > 0, `S${i} has description: "${desc}"`);
}

// ── Test 3: Prior distribution ────────────────────────────────────────

console.log("\n═══ Test 3: Prior distribution ═══\n");

const defaultConfig: EngineConfig = {
  frontierBelief: 2,
  slipRate: 0.1,
  confThreshold: 0.2,
};
const e1 = new DiagnosticEngine(defaultConfig);

const priorSum = Object.values(e1.posterior).reduce((a, b) => a + b, 0);
assert(Math.abs(priorSum - 1.0) < 1e-10, `Prior sums to 1 (got ${priorSum})`);

const peakState = Object.entries(e1.posterior).sort((a, b) => b[1] - a[1])[0][0];
assert(peakState === "S2", `Prior peaks at S2 when belief=2 (got ${peakState})`);

printPosterior(e1, "Default prior (belief=2)");

// ── Test 4: Student A — strong student ────────────────────────────────

console.log("\n\n═══ Test 4: Student A (strong) ═══");

const strongConfig: EngineConfig = { frontierBelief: null, slipRate: 0.1, confThreshold: 0.2 };
const eA = new DiagnosticEngine(strongConfig);
printPosterior(eA, "Initial prior (uniform)");

const studentA: [string, "correct" | "incorrect" | "idk", number][] = [
  ["EQ1", "correct", 0.10],
  ["EQ3", "correct", 0.10],
  ["COMP2", "correct", 0.10],
  ["DISC2", "correct", 0.02],
  ["SYM2", "correct", 0.05],
  ["SYM3a", "correct", 0.05],
];

for (const [node, resp, guess] of studentA) {
  eA.update(node, resp, guess);
  printPosterior(eA, `After ${node}: ${resp}`);
}

const resultA = eA.getResult();
console.log(`\n  Final: ${resultA.winningState} (${(resultA.winningProb * 100).toFixed(1)}%)`);
const winIdxA = parseInt(resultA.winningState.slice(1), 10);
assert(
  winIdxA >= 15,
  `Strong student converges to high state S15+ (got ${resultA.winningState})`
);
assert(
  resultA.winningProb > 0.3,
  `Winning probability > 30% (got ${(resultA.winningProb * 100).toFixed(1)}%)`
);

// ── Test 5: Student B — weak student ──────────────────────────────────

console.log("\n\n═══ Test 5: Student B (weak) ═══");

const eB = new DiagnosticEngine(defaultConfig);
printPosterior(eB, "Initial prior");

const studentB: [string, "correct" | "incorrect" | "idk", number][] = [
  ["EQ1", "correct", 0.10],
  ["EQ2a", "incorrect", 0.05],
];

for (const [node, resp, guess] of studentB) {
  eB.update(node, resp, guess);
  printPosterior(eB, `After ${node}: ${resp}`);
}

const resultB = eB.getResult();
console.log(`\n  Final: ${resultB.winningState} (${(resultB.winningProb * 100).toFixed(1)}%)`);
assert(
  ["S1", "S3"].includes(resultB.winningState),
  `Weak student converges to S1/S3 (got ${resultB.winningState})`
);

// ── Test 6: Node selection ────────────────────────────────────────────

console.log("\n\n═══ Test 6: Node selection ═══\n");

const e5 = new DiagnosticEngine(defaultConfig);
const first = e5.selectNext();
assert(first !== null, "selectNext returns a node before any questions");
if (first) {
  const probs = e5.getNodeProbabilities();
  console.log("  Node probabilities (P(mastered)):");
  for (const [n, p] of Object.entries(probs)) {
    const dist = Math.abs(p - 0.5);
    const marker = n === first.nodeId ? " ← selected" : "";
    console.log(`    ${n}: ${p.toFixed(3)} (dist from 0.5: ${dist.toFixed(3)})${marker}`);
  }
  assert(
    first.pMastered >= 0 && first.pMastered <= 1,
    `P(mastered) is valid: ${first.pMastered.toFixed(3)}`
  );
}

const eAll = new DiagnosticEngine(defaultConfig);
for (const n of GRAPH.nodes) eAll.asked.add(n);
assert(eAll.selectNext() === null, "selectNext returns null when all nodes asked");

// ── Test 7: IDK response ──────────────────────────────────────────────

console.log("\n\n═══ Test 7: IDK response ═══");

const eIdk = new DiagnosticEngine(defaultConfig);
printPosterior(eIdk, "Before IDK on SYM2");
eIdk.update("SYM2", "idk", 0.25);
printPosterior(eIdk, "After IDK on SYM2");

const pSYM2mastered = Object.entries(eIdk.posterior)
  .filter(([s]) => VALID_STATES[s].has("SYM2"))
  .reduce((sum, [, p]) => sum + p, 0);
assert(
  pSYM2mastered < 0.2,
  `IDK on SYM2 strongly reduces P(SYM2 mastered): ${(pSYM2mastered * 100).toFixed(1)}%`
);

// ── Test 8: Entropy / termination ─────────────────────────────────────

console.log("\n\n═══ Test 8: Entropy / termination ═══\n");

const eFlat = new DiagnosticEngine({ frontierBelief: 3, slipRate: 0.1, confThreshold: 0.2 });
const flatEntropy = eFlat.entropy();
const maxEntropy = Math.log2(STATE_COUNT);
console.log(`  Flat-ish prior entropy: ${flatEntropy.toFixed(3)} / ${maxEntropy.toFixed(3)}`);
assert(!eFlat.shouldTerminate(), "Engine does not terminate with flat prior");

const eConv = new DiagnosticEngine(defaultConfig);
const convPosterior: Record<string, number> = {};
for (let i = 0; i < STATE_COUNT; i++) convPosterior[`S${i}`] = 0.001;
convPosterior["S10"] = 0.99;
convPosterior["S0"] = 1 - 0.99 - 0.001 * (STATE_COUNT - 2); // normalize remainder
eConv.posterior = convPosterior;
const convEntropy = eConv.entropy();
console.log(`  Converged entropy: ${convEntropy.toFixed(3)} / ${maxEntropy.toFixed(3)}`);
assert(eConv.shouldTerminate(), "Engine terminates when posterior is concentrated");

// ── Test 9: Graph topology helpers ────────────────────────────────────

console.log("\n\n═══ Test 9: Graph topology helpers ═══\n");

assert(PARENTS_MAP["EQ1"].length === 0, "EQ1 has no parents (root)");
assert(CHILDREN_MAP["EQ1"].length === 2, "EQ1 has 2 children (EQ2a, EQ2b)");
assert(PARENTS_MAP["EQ3"].length === 2, "EQ3 has 2 parents (EQ2a, EQ2b) — diamond merge");
assert(CHILDREN_MAP["EQ3"].length === 2, "EQ3 has 2 children (DISC1, COMP1) — parallel branches");
assert(PARENTS_MAP["COMP1"].length === 1, "COMP1 has 1 parent (EQ3)");
assert(PARENTS_MAP["DISC1"].length === 1, "DISC1 has 1 parent (EQ3)");
assert(PARENTS_MAP["DISC2"].length === 2, "DISC2 has 2 parents (DISC1, COMP4) — parallel merge");
assert(PARENTS_MAP["SYM2"].length === 2, "SYM2 has 2 parents (SYM1a, SYM1b) — diamond merge");
assert(CHILDREN_MAP["SYM2"].length === 2, "SYM2 has 2 children (SYM3a, SYM3b) — fork");
assert(CHILDREN_MAP["SYM3a"].length === 0, "SYM3a is a leaf");
assert(CHILDREN_MAP["SYM3b"].length === 0, "SYM3b is a leaf");

// ── Test 10: Prior modes ──────────────────────────────────────────────

console.log("\n\n═══ Test 10: Prior modes ═══\n");

// Uniform prior (frontierBelief = null, no population data)
const eUniform = new DiagnosticEngine({
  frontierBelief: null,
  slipRate: 0.1,
  confThreshold: 0.2,
});
const uniformProbs = Object.values(eUniform.posterior);
const expectedUniform = 1 / STATE_COUNT;
assert(
  uniformProbs.every((p) => Math.abs(p - expectedUniform) < 1e-10),
  `Uniform prior: all states = ${(expectedUniform * 100).toFixed(1)}%`
);

// Gaussian prior (frontierBelief = 2)
const eGaussian = new DiagnosticEngine({
  frontierBelief: 2,
  slipRate: 0.1,
  confThreshold: 0.2,
});
const gaussPeak = Object.entries(eGaussian.posterior).sort(
  (a, b) => b[1] - a[1]
)[0][0];
assert(gaussPeak === "S2", `Gaussian prior peaks at S2 (got ${gaussPeak})`);
assert(
  eGaussian.posterior["S2"] > expectedUniform,
  "Gaussian peak is higher than uniform"
);

// Population prior — mock posteriors must cover all 19 states
function mockPosterior(peak: string, peakVal: number): Record<string, number> {
  const p: Record<string, number> = {};
  const remainder = 1 - peakVal;
  for (let i = 0; i < STATE_COUNT; i++) p[`S${i}`] = remainder / (STATE_COUNT - 1);
  p[peak] = peakVal;
  return p;
}
const mockPopulation = {
  graphHash: GRAPH_HASH,
  results: [
    { timestamp: "", anchorPassed: true, posterior: mockPosterior("S1", 0.80) },
    { timestamp: "", anchorPassed: true, posterior: mockPosterior("S1", 0.60) },
  ],
};
const popPrior = computePopulationPrior(mockPopulation);
assert(
  popPrior["S1"] > popPrior["S2"],
  `Population prior: S1 (${(popPrior["S1"] * 100).toFixed(1)}%) > S2 (${(popPrior["S2"] * 100).toFixed(1)}%)`
);

const ePopulation = new DiagnosticEngine({
  frontierBelief: null,
  slipRate: 0.1,
  confThreshold: 0.2,
  populationPrior: popPrior,
});
const popPeak = Object.entries(ePopulation.posterior).sort(
  (a, b) => b[1] - a[1]
)[0][0];
assert(popPeak === "S1", `Population prior peaks at S1 (got ${popPeak})`);

// Population prior overridden by frontierBelief
const eOverride = new DiagnosticEngine({
  frontierBelief: 4,
  slipRate: 0.1,
  confThreshold: 0.2,
  populationPrior: popPrior,
});
const overridePeak = Object.entries(eOverride.posterior).sort(
  (a, b) => b[1] - a[1]
)[0][0];
assert(
  overridePeak === "S4",
  `Gaussian override ignores population prior: peaks at S4 (got ${overridePeak})`
);

// Graph hash is deterministic
assert(GRAPH_HASH.length === 16, `Graph hash is 16-char hex: ${GRAPH_HASH}`);

// ── Test 11: Full diagnostic flow — strong student ───────────────────

console.log("\n\n═══ Test 11: Full flow — strong student ═══\n");

{
  const engine = new DiagnosticEngine({ frontierBelief: null, slipRate: 0.1, confThreshold: 0.2 });
  const MAX_STEPS = 30;
  let steps = 0;

  while (!engine.shouldTerminate() && steps < MAX_STEPS) {
    const sel = engine.selectNext();
    if (!sel) break;
    const qs = QUESTIONS[sel.nodeId];
    if (!qs || qs.length === 0) { engine.asked.add(sel.nodeId); continue; }
    // Strong student: always correct
    engine.update(sel.nodeId, "correct", qs[0].guessRate);
    steps++;
  }

  const result = engine.getResult(true);
  console.log(`  Completed in ${steps} steps → ${result.winningState} (${(result.winningProb * 100).toFixed(1)}%)`);
  console.log(`  Nodes asked: ${[...engine.asked].join(", ")}`);

  assert(steps > 0, `Flow ran at least 1 step (ran ${steps})`);
  assert(steps < MAX_STEPS, `Flow terminated before safety limit (${steps} < ${MAX_STEPS})`);
  assert(engine.shouldTerminate(), "Engine reached termination condition");
  assert(result.anchorPassed === true, "anchorPassed flag is set");
  assert(result.history.length === steps, `History has ${steps} entries`);

  // Strong student should converge to a high state (S15+ = has DISC2 or beyond)
  const winIdx = parseInt(result.winningState.slice(1), 10);
  assert(winIdx >= 15, `Strong student converges to high state (got ${result.winningState}, index ${winIdx} ≥ 15)`);

  // All history entries should be correct
  assert(
    result.history.every((h) => h.response === "correct"),
    "All responses recorded as correct"
  );
}

// ── Test 12: Full diagnostic flow — weak student ─────────────────────

console.log("\n\n═══ Test 12: Full flow — weak student ═══\n");

{
  const engine = new DiagnosticEngine({ frontierBelief: null, slipRate: 0.1, confThreshold: 0.2 });
  const MAX_STEPS = 30;
  let steps = 0;

  // Weak student: knows EQ1 only, fails everything else
  const masteredNodes = new Set(["EQ1"]);

  while (!engine.shouldTerminate() && steps < MAX_STEPS) {
    const sel = engine.selectNext();
    if (!sel) break;
    const qs = QUESTIONS[sel.nodeId];
    if (!qs || qs.length === 0) { engine.asked.add(sel.nodeId); continue; }
    const response = masteredNodes.has(sel.nodeId) ? "correct" as const : "incorrect" as const;
    engine.update(sel.nodeId, response, qs[0].guessRate);
    steps++;
  }

  const result = engine.getResult(true);
  console.log(`  Completed in ${steps} steps → ${result.winningState} (${(result.winningProb * 100).toFixed(1)}%)`);
  console.log(`  Nodes asked: ${[...engine.asked].join(", ")}`);

  assert(steps > 0, `Flow ran at least 1 step (ran ${steps})`);
  assert(steps < MAX_STEPS, `Flow terminated before safety limit (${steps} < ${MAX_STEPS})`);
  const weakTerminated = engine.shouldTerminate() || engine.selectNext() === null;
  assert(weakTerminated, "Engine terminated (entropy threshold or all nodes asked)");

  // Weak student should converge to a low state (S0-S3)
  const winIdx = parseInt(result.winningState.slice(1), 10);
  assert(winIdx <= 3, `Weak student converges to low state (got ${result.winningState}, index ${winIdx} ≤ 3)`);

  // History should contain a mix of correct and incorrect
  const corrects = result.history.filter((h) => h.response === "correct").length;
  const incorrects = result.history.filter((h) => h.response === "incorrect").length;
  assert(corrects >= 1, `At least 1 correct response (got ${corrects})`);
  assert(incorrects >= 1, `At least 1 incorrect response (got ${incorrects})`);
}

// ── Test 13: Full diagnostic flow — mid-level student ────────────────

console.log("\n\n═══ Test 13: Full flow — mid-level student ═══\n");

{
  const engine = new DiagnosticEngine({ frontierBelief: null, slipRate: 0.1, confThreshold: 0.2 });
  const MAX_STEPS = 30;
  let steps = 0;

  // Mid student: mastered through DISC1 (the first 5 nodes in the chain)
  const masteredNodes = new Set(["EQ1", "EQ2a", "EQ2b", "EQ3", "DISC1"]);

  while (!engine.shouldTerminate() && steps < MAX_STEPS) {
    const sel = engine.selectNext();
    if (!sel) break;
    const qs = QUESTIONS[sel.nodeId];
    if (!qs || qs.length === 0) { engine.asked.add(sel.nodeId); continue; }
    const response = masteredNodes.has(sel.nodeId) ? "correct" as const : "incorrect" as const;
    engine.update(sel.nodeId, response, qs[0].guessRate);
    steps++;
  }

  const result = engine.getResult(true);
  console.log(`  Completed in ${steps} steps → ${result.winningState} (${(result.winningProb * 100).toFixed(1)}%)`);
  console.log(`  Nodes asked: ${[...engine.asked].join(", ")}`);

  assert(steps > 0, `Flow ran at least 1 step (ran ${steps})`);
  assert(steps < MAX_STEPS, `Flow terminated before safety limit (${steps} < ${MAX_STEPS})`);
  const midTerminated = engine.shouldTerminate() || engine.selectNext() === null;
  assert(midTerminated, "Engine terminated (entropy threshold or all nodes asked)");

  // Mid student should converge to S7 ({EQ1..EQ3, DISC1}) — mastered DISC1 branch only
  const winIdx = parseInt(result.winningState.slice(1), 10);
  assert(
    winIdx >= 4 && winIdx <= 8,
    `Mid student converges to mid state (got ${result.winningState}, index ${winIdx} in 4-8)`
  );
}

// ── Summary ───────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log(`  ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
