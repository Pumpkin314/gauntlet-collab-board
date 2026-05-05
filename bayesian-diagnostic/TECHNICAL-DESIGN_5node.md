# Bayesian Diagnostic Engine -- Technical Design

This document is the definitive technical reference for the Bayesian adaptive diagnostic CLI tool. It covers every aspect of the system: the knowledge graph model, the state space theory, the Bayesian inference engine, the terminal UI, and the diagnostic flow. All code references point to `diagnostic.ts` and `test-engine.ts` in this directory.

---

## 1. System Overview

### What the Tool Does

The Bayesian diagnostic is a standalone CLI tool that adaptively pinpoints where a student sits on a **prerequisite bridge** between two math standards. It asks a small number of targeted questions, performs Bayesian posterior updates after each response, and terminates when it has high confidence about the student's knowledge state.

### The Specific Bridge

The current bridge connects:

- **Anchor (source):** `3.OA.A.3` -- Multiplication and division word problems (3rd grade)
- **Target (destination):** `4.OA.A.1` -- Interpret multiplication as comparison (4th grade)

Between these endpoints lie five **bridge nodes** (BN1--BN5) representing the specific sub-skills a student must acquire to cross from 3rd-grade multiplication fluency to 4th-grade multiplicative comparison reasoning.

### CLI Architecture

All code lives in a single file (`diagnostic.ts`) organized into four clearly delimited modules:

| Module | Lines | Responsibility |
|--------|-------|---------------|
| **Module 1: Data** | Graph, states, questions | Graph topology, auto-generated valid states, question bank, adjacency maps, verification |
| **Module 2: Engine** | `DiagnosticEngine` class | Bayesian prior, posterior update, node selection, entropy, termination |
| **Module 3: UI** | `TerminalUI` class | Terminal I/O, posterior bar chart, ASCII DAG, result display |
| **Module 4: Runner** | `runDiagnostic()`, `main()` | Main loop, warm start, knob config, rerun |

Supporting files:

```
bayesian-diagnostic/
  diagnostic.ts      # All four modules + exports
  test-engine.ts     # Headless engine verification (9 test suites)
  package.json       # tsx, typescript, @types/node
  tsconfig.json      # ES2022, commonjs, strict
  PLAN.md            # Original implementation plan
  README.md          # User-facing quick start + graph change checklist
```

The tool runs via `tsx` (TypeScript Execute) with zero runtime dependencies beyond Node's built-in `readline` module.

---

## 2. Knowledge Graph Model

### Graph Storage

The graph is stored as a plain object with two fields:

```typescript
const GRAPH = {
  nodes: ["BN1", "BN2", "BN3", "BN4", "BN5"],
  edges: [
    ["BN1", "BN2"],
    ["BN2", "BN3"],
    ["BN3", "BN4"],
    ["BN3", "BN5"],
  ] as [string, string][],
};
```

Each edge `[from, to]` encodes a prerequisite relationship: `from` must be mastered before `to`. The graph must be a **directed acyclic graph (DAG)** -- cycles would make the state space ill-defined.

### Prerequisite DAG Structure

```
Anchor (3.OA.A.3) -- Multiplication/division word problems
    |
  [BN1] Parse "times as many" language
    |
  [BN2] Discriminate additive vs multiplicative comparison
    |
  [BN3] Translate comparison to equation
   / \
[BN4] [BN5]
Solve     Solve
mult.     div.
comp.     comp.
   \ /
Target (4.OA.A.1) -- Interpret multiplication as comparison
```

The anchor and target are not graph nodes in the engine -- they frame the bridge conceptually. The anchor is used for a warm-start question; the target represents the goal state.

### Precomputed Adjacency Maps

Two adjacency maps are computed once at module load from `GRAPH.edges`:

```typescript
const PARENTS_MAP: Record<string, string[]>   // node -> its prerequisites
const CHILDREN_MAP: Record<string, string[]>   // node -> its dependents
```

For the current graph:

| Node | Parents | Children |
|------|---------|----------|
| BN1  | (none)  | BN2      |
| BN2  | BN1     | BN3      |
| BN3  | BN2     | BN4, BN5 |
| BN4  | BN3     | (none)   |
| BN5  | BN3     | (none)   |

### Bridge Node Descriptions

| Node | Skill | What It Assesses |
|------|-------|-----------------|
| **BN1** | Parse "times as many" language | Can the student recognize that "times as many" signals multiplication? |
| **BN2** | Discriminate additive vs multiplicative | Can the student distinguish "3 more than" (additive) from "3 times as many" (multiplicative)? |
| **BN3** | Translate comparison to equation | Given a multiplicative comparison sentence, can the student write the correct equation (e.g., `28 = 4 x ?`)? |
| **BN4** | Solve multiplication comparison | Given "A has N times as many as B" and B's count, can the student compute A? (multiply) |
| **BN5** | Solve division comparison | Given "A has N times as many as B" and A's count, can the student compute B? (divide) |

### Node Labels

Human-readable labels are stored in `NODE_LABELS` for both bridge nodes and endpoints:

```typescript
const NODE_LABELS: Record<string, string> = {
  anchor: "3.OA.A.3 -- Multiplication/division word problems",
  BN1: "Parse 'times as many' language",
  BN2: "Discriminate additive vs multiplicative",
  BN3: "Translate comparison to equation",
  BN4: "Solve multiplication comparison",
  BN5: "Solve division comparison",
  target: "4.OA.A.1 -- Interpret multiplication as comparison",
};
```

---

## 3. Knowledge State Space

### Valid States as Downward-Closed Subsets

The diagnostic operates over a finite set of **valid knowledge states**. Each state is a subset of graph nodes representing the skills a student has mastered. Not every subset is valid -- only **downward-closed** subsets (also called **downsets** or **order ideals**).

A subset S is **downward-closed** with respect to the prerequisite DAG if and only if:

> For every node `n` in S and every prerequisite edge `(p, n)` in the graph, `p` is also in S.

In plain terms: you cannot have mastered a skill without having mastered all of its prerequisites. This is the foundational constraint of **Knowledge Space Theory** (Doignon & Falmagne, 1999). The collection of all downward-closed subsets forms a **knowledge space** -- an antimatroid lattice over the skill domain.

### Auto-Generation Algorithm

Valid states are not hardcoded. They are generated automatically from the graph topology by `generateDownsets()`, which uses a two-phase approach:

#### Phase 1: Topological Sort (Kahn's Algorithm)

```typescript
function topologicalSort(): string[] {
  const inDeg: Record<string, number> = {};
  for (const n of GRAPH.nodes) inDeg[n] = PARENTS_MAP[n].length;
  const queue = GRAPH.nodes.filter((n) => inDeg[n] === 0).sort();
  const out: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    out.push(node);
    for (const child of [...CHILDREN_MAP[node]].sort()) {
      if (--inDeg[child] === 0) queue.push(child);
    }
  }
  return out;
}
```

Key properties:
- **Deterministic:** Ties are broken lexicographically (`.sort()` on the queue and children), so the same graph always produces the same ordering.
- **Correctness:** Standard Kahn's algorithm -- processes nodes whose in-degree reaches zero.
- **Output for the current graph:** `["BN1", "BN2", "BN3", "BN4", "BN5"]`

#### Phase 2: Backtracking Over Topological Order

```typescript
function generateDownsets(): Record<string, Set<string>> {
  const topo = topologicalSort();
  const results: Set<string>[] = [];

  function backtrack(i: number, current: Set<string>): void {
    if (i === topo.length) {
      results.push(new Set(current));
      return;
    }
    const node = topo[i];
    // Branch 1: skip this node
    backtrack(i + 1, current);
    // Branch 2: include this node (only if all parents already present)
    if (PARENTS_MAP[node].every((p) => current.has(p))) {
      current.add(node);
      backtrack(i + 1, current);
      current.delete(node);
    }
  }

  backtrack(0, new Set());
  // Sort: by set size first, then lexicographic within same size
  results.sort((a, b) => {
    if (a.size !== b.size) return a.size - b.size;
    return [...a].sort().join(",").localeCompare([...b].sort().join(","));
  });

  const states: Record<string, Set<string>> = {};
  results.forEach((set, i) => (states[`S${i}`] = set));
  return states;
}
```

The algorithm works by iterating through the topological order and, for each node, branching:
1. **Skip** the node (always valid -- not including a node never violates downward closure).
2. **Include** the node -- but only if all of its parents are already in the current set.

Because nodes are processed in topological order, when we consider node `n`, all of its potential prerequisites have already been decided. This means the parent check `PARENTS_MAP[node].every(p => current.has(p))` is sufficient to guarantee downward closure.

**Complexity:** Output-sensitive -- O(k * n) where k is the number of valid states and n is the number of nodes. The algorithm never generates an invalid state, so there is no filtering step.

**Sorting:** Results are sorted by set size (ascending), then lexicographically within the same size. This ensures the state indexing (S0, S1, ...) progresses from least mastery to most mastery.

### Downward-Closure Verification

A runtime verification function `verifyDownwardClosure()` checks every generated state at startup:

```typescript
function verifyDownwardClosure(): boolean {
  for (const [stateId, nodes] of Object.entries(VALID_STATES)) {
    for (const node of nodes) {
      for (const parent of parents[node] || []) {
        if (!nodes.has(parent)) {
          console.error(`INVALID: ${stateId} has ${node} but missing prerequisite ${parent}`);
          return false;
        }
      }
    }
  }
  return true;
}
```

If verification fails, `main()` aborts with exit code 1. This is a safety net: the generation algorithm is correct by construction, but the check catches any bugs introduced during graph edits.

### The 7 States for the Current Graph

| State | Mastered Nodes | Inner Fringe | Meaning |
|-------|---------------|--------------|---------|
| **S0** | {} | `empty` | No bridge concepts mastered. Start at BN1. |
| **S1** | {BN1} | `{BN1}` | Can parse "times as many" language |
| **S2** | {BN1, BN2} | `{BN2}` | Can discriminate additive vs multiplicative |
| **S3** | {BN1, BN2, BN3} | `{BN3}` | Can translate comparison to equation |
| **S4** | {BN1, BN2, BN3, BN4} | `{BN4}` | Can also solve multiplication comparison |
| **S5** | {BN1, BN2, BN3, BN5} | `{BN5}` | Can also solve division comparison |
| **S6** | {BN1, BN2, BN3, BN4, BN5} | `{BN4, BN5}` | Full bridge mastery |

The branching at BN3 (two children: BN4 and BN5) is what produces 7 states instead of 6. States S4 and S5 represent the two possible "one-leaf-mastered" configurations.

---

## 4. Inner Fringe Notation

### Definition

The **inner fringe** of a knowledge state S is the set of nodes in S whose individual removal yields another valid state. Formally:

> `InnerFringe(S) = { n in S : S \ {n} is a valid knowledge state }`

These are the "most recently mastered" items -- the conceptual boundary of a student's knowledge. In Knowledge Space Theory (Doignon & Falmagne, 1999), this is a standard concept used to characterize the learning trajectory.

### Why Inner Fringes Uniquely Identify States

For a finite knowledge space derived from a DAG, the inner fringe uniquely identifies each state. Two distinct downward-closed sets cannot have the same inner fringe -- removing a fringe node from one state yields a different predecessor state than removing it from the other. This makes inner fringes ideal as human-readable labels.

### Notation

The tool uses a compact notation for inner fringes throughout the UI:

| State | Inner Fringe | Notation |
|-------|-------------|----------|
| S0 | (empty set) | `empty` |
| S1 | {BN1} | `>BN1` |
| S2 | {BN2} | `>BN2` |
| S3 | {BN3} | `>BN3` |
| S4 | {BN4} | `>BN4` |
| S5 | {BN5} | `>BN5` |
| S6 | {BN4, BN5} | `>BN4,BN5` |

(In the actual terminal output, these render as Unicode: `∅` for empty, `▸BN4` for single-fringe, `▸BN4,BN5` for multi-fringe.)

### Computation

```typescript
function computeInnerFringe(stateId: string): string[] {
  const nodes = VALID_STATES[stateId];
  const fringe: string[] = [];
  for (const node of nodes) {
    const reduced = new Set(nodes);
    reduced.delete(node);
    if (Object.values(VALID_STATES).some((s) => setsEqual(s, reduced))) {
      fringe.push(node);
    }
  }
  return fringe.sort();
}
```

For each node in the state, the algorithm removes it and checks whether the resulting set is itself a valid state. If so, that node is on the inner fringe. The sort ensures deterministic ordering.

Inner fringes are **precomputed** for all states at module load and stored in `INNER_FRINGES`:

```typescript
const INNER_FRINGES: Record<string, string[]> = (() => {
  const f: Record<string, string[]> = {};
  for (const s of Object.keys(VALID_STATES)) f[s] = computeInnerFringe(s);
  return f;
})();
```

The `fringeLabel()` function converts an inner fringe to its display string:

```typescript
function fringeLabel(stateId: string): string {
  const fringe = INNER_FRINGES[stateId];
  if (fringe.length === 0) return "∅";
  return "▸" + fringe.join(",");
}
```

---

## 5. Bayesian Engine

The `DiagnosticEngine` class implements the full Bayesian inference pipeline. It maintains a posterior distribution over the valid knowledge states and updates it after each student response.

### 5.1 Prior Distribution

The prior distribution is the starting belief about the student's knowledge state before any questions are asked.

#### Current Implementation: Gaussian over State Indices

```typescript
private buildPrior(belief: number): Record<string, number> {
  const stateIds = Object.keys(VALID_STATES);
  const sigma = 1.5;
  const weights = stateIds.map((_, i) =>
    Math.exp(-0.5 * ((i - belief) / sigma) ** 2)
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const prior: Record<string, number> = {};
  stateIds.forEach((s, i) => {
    prior[s] = weights[i] / total;
  });
  return prior;
}
```

The prior is a discrete Gaussian (normal curve) over the state indices `[0, 1, ..., 6]`, peaked at the `frontierBelief` knob value, with sigma = 1.5. The result is normalized to sum to 1.

For example, with `frontierBelief = 2` (default), the prior peaks at S2 (`▸BN2`), expressing a belief that the student has likely mastered BN1 and BN2 but not yet BN3.

#### Prior Alternatives (from the literature)

| Prior Type | Description | When to Use |
|-----------|-------------|-------------|
| **Uniform** | Equal probability for all states: `1/|states|` | Default when no population data is available. Falmagne (2006) notes ALEKS uses uniform as a fallback. |
| **Gaussian over indices** | Current implementation. Peaks at a specified state index. | Demo/manual override. Useful when an instructor has a prior belief about the student. |
| **Population-based** | Derived from previous diagnostic data (frequency of each state in a student population). | Preferred when data is available. Cosyn et al. (2021) describe how ALEKS production systems use population-based priors. |

**Key finding from the literature:** Heller & Repitsch (2012) showed that a **wrong informative prior is worse than uniform** -- an overconfident prior peaked at the wrong state degrades diagnostic accuracy. Anselmi et al. (2016) recommend bootstrapping from uniform and refining over time as population data accumulates.

### 5.2 BLIM Parameters (Basic Local Independence Model)

The likelihood model follows the **Basic Local Independence Model** (BLIM) from Doignon & Falmagne (1999). BLIM assumes that a student's response to each item depends only on whether they have mastered the corresponding skill, with two error parameters:

- **Slip rate** `P(incorrect | mastered)`: The probability of answering incorrectly despite having mastered the skill (careless error, misreading, etc.). Default: **0.10**, from Corbett & Anderson (1995) Bayesian Knowledge Tracing. Baker, Corbett & Aleven (2008) recommend constraining slip < 0.10.

- **Guess rate** `P(correct | not mastered)`: The probability of answering correctly without having mastered the skill (lucky guess). This varies per question based on its format:

| Question Type | Guess Rate | Rationale |
|--------------|-----------|-----------|
| 4-choice multiple choice | 0.25 | 1/4 random chance |
| 2-choice multiple choice | 0.50 | 1/2 random chance |
| Open numeric (single answer) | 0.05 | Hard to guess a specific number |
| Open multi-part (comma-separated) | 0.02 | Must guess all parts correctly |
| Select-all (4 options) | 0.0625 | 1/2^4 = 1/16 for random subset |

Each `Question` object carries its own `guessRate` field, so the engine uses question-specific guess rates rather than a single global value.

### 5.3 Bayesian Update Rule

After each student response, the engine updates the posterior via Bayes' theorem:

```
posterior(S) = prior(S) * likelihood(response | S) / Z
```

where Z is the normalizing constant (sum of numerators across all states).

The implementation:

```typescript
update(nodeId: string, response: "correct" | "incorrect" | "idk", guessRate: number): void {
  for (const stateId of Object.keys(this.posterior)) {
    const mastered = this.stateContains(stateId, nodeId);
    let likelihood: number;
    if (response === "correct") {
      likelihood = mastered ? (1 - this.slipRate) : guessRate;
    } else if (response === "incorrect") {
      likelihood = mastered ? this.slipRate : (1 - guessRate);
    } else {
      // "idk" -- strong evidence of non-mastery
      likelihood = mastered ? 0.02 : 0.95;
    }
    this.posterior[stateId] *= likelihood;
  }
  // Normalize
  const total = Object.values(this.posterior).reduce((a, b) => a + b, 0);
  for (const s of Object.keys(this.posterior)) {
    this.posterior[s] /= total;
  }
}
```

#### Likelihood Table

For a given node and student response, the likelihood assigned to each state depends on whether that state contains the node:

| Response | Node Mastered in State | Likelihood |
|----------|----------------------|------------|
| `correct` | Yes | `1 - slipRate` (default: 0.90) |
| `correct` | No | `guessRate` (varies by question) |
| `incorrect` | Yes | `slipRate` (default: 0.10) |
| `incorrect` | No | `1 - guessRate` |
| `idk` | Yes | 0.02 |
| `idk` | No | 0.95 |

The `idk` response acts as strong evidence of non-mastery: it is nearly 50x more likely under "not mastered" than "mastered" (0.95 / 0.02 = 47.5). This is appropriate because a student who has genuinely mastered a skill would almost never voluntarily say "I don't know."

#### Update Mechanics

1. For each state S in the posterior, compute the likelihood of the observed response given S.
2. Multiply `posterior[S]` by the likelihood (unnormalized Bayes).
3. Sum all unnormalized posteriors to get Z.
4. Divide each `posterior[S]` by Z to normalize.
5. Record the node as asked and push a history entry with the posterior snapshot.

### 5.4 Node Selection (Adaptive Item Selection)

The engine selects the next question to maximize information gain:

```typescript
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
  return { nodeId: bestNode, pMastered: probs[bestNode], allProbs: probs };
}
```

**How it works:**

1. For each node, compute `P(mastered)` = sum of `posterior[S]` for all states S that contain that node.
2. Among unasked nodes, select the one whose `P(mastered)` is closest to 0.5.
3. A node at P = 0.5 has maximum uncertainty -- asking about it yields the most information (maximum entropy reduction).

This matches the ALEKS approach described by Falmagne (2006): selecting items where "the student has about a 50% probability of answering correctly."

**Node probability computation:**

```typescript
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
```

### 5.5 Termination Condition

The diagnostic terminates when the posterior is sufficiently concentrated, measured by normalized Shannon entropy:

```typescript
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
```

**Shannon entropy:**

```
H = -Sum_{s} p(s) * log2(p(s))
```

**Normalized entropy:**

```
H_norm = H / log2(|states|)
```

The normalization maps entropy to `[0, 1]` regardless of the number of states. A uniform distribution has `H_norm = 1.0`; a point mass has `H_norm = 0.0`.

**Termination:** When `H_norm < confThreshold` (default 0.20), the engine considers the posterior sufficiently concentrated and stops asking questions.

The diagnostic also terminates if all nodes have been probed (when `selectNext()` returns `null`).

---

## 6. Question Bank

### Structure

Questions are stored in `QUESTIONS: Record<string, Question[]>` -- a map from node ID to an array of `Question` objects. Each node has 2--3 questions; the anchor has 2 questions.

```typescript
interface Question {
  prompt: string;                          // Terminal-friendly question text
  type: "open" | "multiple_choice" | "select_all";
  options?: string[];                      // For MC/select_all
  answer: string | string[];               // Correct answer(s)
  guessRate: number;                       // P(correct | not mastered)
}
```

### Question Types and Answer Checking

| Type | Answer Format | Checking Logic |
|------|--------------|---------------|
| `open` (single) | `string` | Case-insensitive exact match |
| `open` (multi-part) | `string[]` | Split on commas, positional match, case-insensitive |
| `multiple_choice` | `string` (letter) | Case-insensitive letter match (e.g., "B") |
| `select_all` | `string[]` (letters) | Split on commas/spaces, sort, set comparison |

### Question Counts

| Node | Questions | Types |
|------|-----------|-------|
| anchor | 2 | 1 open, 1 MC |
| BN1 | 3 | 2 open, 1 MC |
| BN2 | 3 | 1 open (multi-part), 1 MC (2-choice), 1 select_all |
| BN3 | 3 | 3 MC (4-choice) |
| BN4 | 3 | 3 open |
| BN5 | 3 | 3 open |

Total: **17 questions** across all nodes.

### "IDK" Response Handling

Any question can receive an "idk" response (accepted variants: `idk`, `i don't know`, `i dont know`). When a student says "I don't know":

- The engine applies the `idk` likelihood: 0.02 for states where the node is mastered, 0.95 for states where it is not.
- This is the strongest possible evidence of non-mastery -- nearly a 50:1 likelihood ratio.
- Test 7 in `test-engine.ts` verifies that IDK on BN3 drives `P(BN3 mastered)` below 20%.

### Random Question Selection

Questions for each node are selected randomly without replacement using `pickRandom()`:

```typescript
function pickRandom<T>(arr: T[], exclude?: Set<number>): { item: T; index: number } | null {
  const available = arr
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !exclude?.has(index));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}
```

A per-node `usedQuestions` set tracks which question indices have been used, preventing repeats within a single diagnostic run.

### Anchor Questions

Anchor questions are used during the **warm start** phase to confirm 3rd-grade prerequisite mastery. They are **not** fed into the Bayesian engine -- they serve as a gating check. If the student fails the anchor question, the diagnostic aborts with a remediation recommendation.

---

## 7. Terminal UI

The `TerminalUI` class handles all terminal input/output.

### Posterior Bar Chart

After each Bayesian update, the UI renders a bar chart of the posterior distribution using inner fringe labels:

```
    ∅         : ░░░░░░░░░░░░░░░░░░░░░░░░░   0.4%
    ▸BN1      : ░░░░░░░░░░░░░░░░░░░░░░░░░   2.0%
    ▸BN2      : ████████████████████░░░░░  78.4%  <- most likely
    ▸BN3      : ███░░░░░░░░░░░░░░░░░░░░░░  11.1%
    ▸BN4      : █░░░░░░░░░░░░░░░░░░░░░░░░   4.2%
    ▸BN5      : █░░░░░░░░░░░░░░░░░░░░░░░░   3.3%
    ▸BN4,BN5  : ░░░░░░░░░░░░░░░░░░░░░░░░░   0.6%

    Certainty: 72%
```

The bar width is 25 characters. The `<- most likely` marker highlights the maximum-probability state. Certainty is `(1 - H_norm) * 100%`.

### Node Selection Rationale

After each update, if the diagnostic is not yet terminating, the UI displays the next probe and why it was chosen:

```
  Next probe -> BN3 (P(mastered) = 0.48 -- closest to 0.50)
```

### ASCII DAG Renderer

The `showGraph()` method renders a dynamic ASCII visualization of the knowledge graph with diagnostic results:

```
              [3.OA.A.3] check
                    |
                [BN1] check
                    |
                [BN2] check  <- FRONTIER
                    |
                [BN3] x
                /         \
         [BN4] ?   [BN5] ?
                \         /
              [4.OA.A.1] x
```

Symbols:
- `check` = mastered (in the winning state)
- `x` = assessed, not mastered
- `?` = not assessed (inferred not mastered)
- `<- FRONTIER` = mastered node with at least one unmastered child

(In the actual terminal, these render as Unicode check marks and cross marks.)

The DAG layout is computed dynamically from graph topology:

1. **Depth assignment:** Each node's depth is the longest path from any root (`getDepth()` via recursive memoized DFS on `PARENTS_MAP`).
2. **Layer grouping:** Nodes at the same depth are placed on the same row.
3. **Connector lines:** `connector()` draws `|`, `/\`, `\/`, or parallel `|` lines depending on the cardinality of adjacent layers.
4. **Centering:** All lines are centered within a 50-character width.

### Result Display

The final results screen shows:

1. **Winning state** with inner fringe label and probability
2. **State description** (auto-generated from node labels)
3. **Frontier identification** -- which mastered nodes border unmastered territory, and what to teach next
4. **Full posterior** bar chart (same format as mid-diagnostic)
5. **Question history** -- numbered list of every question, the node probed, and the response

---

## 8. Diagnostic Flow

### Step 1: Configure Knobs

The tool starts by configuring three parameters (see Section 9). If `--defaults` is passed as a CLI argument, defaults are used without prompting. Otherwise, the user is presented with an interactive menu explaining each knob and its valid range.

After configuration, the initial prior and knob summary box are displayed.

### Step 2: Warm Start (Anchor Question)

A randomly selected anchor question confirms that the student has 3rd-grade prerequisite mastery (3.OA.A.3). This is a gating check:

- **Correct:** The diagnostic proceeds to the bridge nodes. The anchor result is not fed to the Bayesian engine.
- **Incorrect or IDK:** The diagnostic terminates immediately with a recommendation for 3rd-grade remediation. There is no point assessing bridge skills if the prerequisite is not met.

### Step 3: Diagnostic Loop

```
while (!engine.shouldTerminate()) {
  selection = engine.selectNext()    // pick most uncertain unasked node
  if (!selection) break              // all nodes exhausted
  question = pickRandom(questions)   // random question for that node
  response = ui.askQuestion(question)
  engine.update(node, response, guessRate)
  ui.showUpdate(node, response, engine)  // bar chart + next probe rationale
}
```

Each iteration:
1. The engine selects the next node to probe (closest to P = 0.5).
2. A random unused question for that node is presented.
3. The student responds (correct answer, incorrect answer, or "idk").
4. The engine performs a Bayesian update.
5. The UI displays the updated posterior, certainty, and next-probe rationale.
6. The engine checks the termination condition.

### Step 4: Results

When the loop terminates (by entropy threshold or exhaustion of nodes), the tool displays:
- Winning state with inner fringe label and confidence
- Description of what the student has mastered
- Frontier: the boundary between mastered and unmastered skills
- Next teaching recommendation: the immediate children of frontier nodes
- Full posterior bar chart
- Question history
- ASCII DAG with mastery markers

### Step 5: Rerun Option

After results, the user is prompted: "Rerun with different settings? (y/n)". If yes, the flow returns to Step 1 with fresh knob configuration. This enables live demos: "same bridge, different student, different prior."

---

## 9. Configurable Knobs

| Knob | Type | Range | Default | Purpose |
|------|------|-------|---------|---------|
| `frontierBelief` | integer | 0 -- (STATE_COUNT - 1) | 2 | State index where the Gaussian prior peaks. Selects the instructor's prior belief about where the student is. |
| `slipRate` | float | 0.05 -- 0.20 | 0.10 | P(incorrect response \| skill mastered). Higher values are more forgiving of careless errors. |
| `confThreshold` | float | 0.05 -- 0.40 | 0.20 | Normalized entropy threshold for early termination. Lower values require more questions before stopping (higher confidence). |

### frontierBelief

This knob is a **demo feature** for manually overriding the prior. It selects which state index the Gaussian peaks at:

- `0`: Prior peaked at S0 (`∅`) -- assume no bridge mastery
- `2` (default): Prior peaked at S2 (`▸BN2`) -- assume BN1 and BN2 mastered
- `6`: Prior peaked at S6 (`▸BN4,BN5`) -- assume full mastery

The interactive configuration menu shows each state's fringe label and description:

```
  frontierBelief: where you think the student's frontier is.
    0: ∅            (no bridge mastery)
    1: ▸BN1         (Parse 'times as many' language)
    2: ▸BN2         (Discriminate additive vs multiplicative)
    3: ▸BN3         (Translate comparison to equation)
    4: ▸BN4         (Solve multiplication comparison)
    5: ▸BN5         (Solve division comparison)
    6: ▸BN4,BN5     (full bridge mastery)
```

**Important caveat:** For complex branching graphs with many same-size states, the index ordering becomes arbitrary and the Gaussian prior over indices may not be meaningful. For production use, a population-based prior or uniform prior is preferred.

### slipRate

Controls how forgiving the engine is of mistakes. At 0.10 (default), a correct response on a mastered node has likelihood 0.90 and an incorrect response has likelihood 0.10. Higher slip rates (e.g., 0.20) make the engine less swayed by single incorrect answers, which is useful for younger students prone to careless errors.

### confThreshold

Controls how many questions the engine asks before stopping. Lower thresholds demand more certainty (more questions); higher thresholds allow earlier termination.

| confThreshold | Behavior |
|--------------|----------|
| 0.05 | Very strict -- nearly all nodes will be probed |
| 0.20 (default) | Balanced -- typically 3-4 questions |
| 0.40 | Lenient -- may terminate after 1-2 questions |

Input validation uses `clamp()`:

```typescript
function clamp(value: number, min: number, max: number): number {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
```

---

## 10. Extensibility

### The Graph Is the Single Source of Truth

When you modify `GRAPH.nodes` and `GRAPH.edges`, the following recompute automatically:

- `PARENTS_MAP` and `CHILDREN_MAP` (adjacency)
- `VALID_STATES` (all downward-closed subsets via `generateDownsets()`)
- `STATE_COUNT`
- `INNER_FRINGES` (per-state inner fringe labels)
- State descriptions (`describeState()`)
- ASCII DAG layout (depth/layer assignment)
- Knob ranges (frontierBelief adapts to `STATE_COUNT`)
- Entropy calculations (`log2(STATE_COUNT)`)

### What Must Be Manually Updated

When adding nodes, removing nodes, or changing edges:

| Must Update | Why |
|------------|-----|
| `GRAPH.nodes` | Add/remove node IDs |
| `GRAPH.edges` | Add/remove prerequisite edges (must remain acyclic) |
| `NODE_LABELS` | Human-readable label for each new node |
| `QUESTIONS` | 2--3 hand-authored questions per new node, each with prompt, type, answer, guessRate |
| `NODE_LABELS.anchor` / `NODE_LABELS.target` | Update if bridge endpoints change |
| `QUESTIONS.anchor` | Update anchor warm-start questions if source standard changes |

After any graph change, run `npm test` to verify that states are generated correctly, downward closure holds, and the engine still converges.

### What Does NOT Need Manual Updates

- `VALID_STATES` -- auto-generated
- `STATE_COUNT` -- derived
- `INNER_FRINGES` -- auto-computed
- State descriptions -- auto-generated from node labels
- ASCII DAG -- renders dynamically
- Knob ranges -- adapt to state count
- Engine logic -- fully generic

### The `diagnostic-graph` Skill

The diagnostic-graph skill (referenced in the repository's agent configuration) enforces the manual update checklist when graph changes are made, ensuring no item is forgotten.

---

## 11. Test Suite

The test suite (`test-engine.ts`) runs 9 test groups with headless engine simulations:

| Test | What It Verifies |
|------|-----------------|
| **1. Data integrity** | Downward closure, state count = 7, exact state contents match expected, topological order correct, question counts sufficient |
| **2. State descriptions** | S0 mentions "no mastery", S6 mentions "full bridge mastery", mid-states mention next steps |
| **3. Prior distribution** | Prior sums to 1.0, peaks at the correct state index |
| **4. Student A (strong)** | Correct on BN1, BN2, BN3, BN4 -- posterior converges to S4/S5/S6 with > 40% probability |
| **5. Student B (weak)** | Correct on BN1, incorrect on BN2 -- posterior converges to S0/S1 |
| **6. Node selection** | `selectNext()` returns a valid node, returns `null` when all asked |
| **7. IDK response** | IDK on BN3 drives `P(BN3 mastered)` below 20% |
| **8. Entropy/termination** | Flat prior does not trigger termination; concentrated posterior (99% on S2) does |
| **9. Graph topology** | BN1 has no parents, BN3 has 2 children, BN4/BN5 are leaves |

Run with: `npm test` (which executes `tsx test-engine.ts`)

---

## 12. Literature References

1. **Doignon, J.-P. & Falmagne, J.-C. (1999).** *Knowledge Spaces.* Springer-Verlag, Berlin. -- The foundational text for Knowledge Space Theory. Defines knowledge states as downward-closed subsets of a prerequisite partial order, introduces the BLIM likelihood model, and establishes the theoretical basis for adaptive assessment in combinatorial knowledge domains.

2. **Falmagne, J.-C. (2006).** The Assessment of Knowledge, in Theory and in Practice. In B. Dasarathy (Ed.), *Information Fusion* (pp. 1--8). -- Describes the ALEKS system's practical implementation of Knowledge Space Theory. Documents the use of uniform priors as fallback and the "closest to 50%" item selection heuristic for adaptive questioning.

3. **Cosyn, E., Uzun, H., Doble, C., & Matayoshi, J. (2021).** A practical perspective on knowledge space theory: ALEKS and its data. *Journal of Mathematical Psychology, 101*, 102512. -- Describes ALEKS's production implementation in detail, including population-based priors derived from historical assessment data and the practical engineering decisions behind the system.

4. **Heller, J. & Repitsch, C. (2012).** Exploiting prior information in stochastic knowledge assessment. *Methodology, 8*(2), 75--90. -- Investigates the impact of prior choice on diagnostic accuracy. Key finding: an incorrect informative prior degrades performance compared to a uniform prior. Recommends caution with strong priors absent reliable population data.

5. **Anselmi, P., Robusto, E., Stefanutti, L., & de Chiusole, D. (2016).** An upgrading procedure for adaptive assessment of knowledge. *Psychometrika, 81*(2), 461--482. -- Proposes a bootstrap approach: start with a uniform prior, then refine to a population-based prior as diagnostic data accumulates over time.

6. **Corbett, A. T. & Anderson, J. R. (1995).** Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction, 4*(4), 253--278. -- Introduces Bayesian Knowledge Tracing (BKT) with default parameters: P(slip) = 0.10, P(guess) = 0.20. The slip rate default of 0.10 used in this diagnostic comes directly from BKT.

7. **Baker, R. S., Corbett, A. T., & Aleven, V. (2008).** More accurate student modeling through contextual estimation of slip and guess probabilities in Bayesian knowledge tracing. In *Proceedings of the 9th International Conference on Intelligent Tutoring Systems* (pp. 406--415). -- Extends BKT with contextual slip/guess estimation. Recommends constraining P(slip) < 0.10 to prevent degenerate model fits.

8. **Yudelson, M. V., Koedinger, K. R., & Gordon, G. J. (2013).** Individualized Bayesian knowledge tracing models. In *Proceedings of the 16th International Conference on Artificial Intelligence in Education* (AIED 2013, pp. 171--180). -- Extends BKT with per-student parameters, demonstrating that individualized priors and slip/guess rates improve predictive accuracy over population-level defaults.

---

## Appendix A: Type Definitions

```typescript
interface Question {
  prompt: string;
  type: "open" | "multiple_choice" | "select_all";
  options?: string[];
  answer: string | string[];
  guessRate: number;
}

interface EngineConfig {
  frontierBelief: number;  // 0 to STATE_COUNT-1
  slipRate: number;        // 0.05 to 0.20
  confThreshold: number;   // 0.05 to 0.40
}

interface HistoryEntry {
  node: string;
  response: "correct" | "incorrect" | "idk";
  posteriorSnapshot: Record<string, number>;
}

interface SelectionInfo {
  nodeId: string;
  pMastered: number;
  allProbs: Record<string, number>;
}

interface DiagnosticResult {
  winningState: string;
  winningProb: number;
  posterior: Record<string, number>;
  history: HistoryEntry[];
  masteredNodes: Set<string>;
  anchorPassed: boolean;
}
```

## Appendix B: Module Exports

`diagnostic.ts` exports the following for use by `test-engine.ts`:

**Classes:** `DiagnosticEngine`

**Constants:** `VALID_STATES`, `STATE_COUNT`, `GRAPH`, `QUESTIONS`, `PARENTS_MAP`, `CHILDREN_MAP`, `INNER_FRINGES`

**Functions:** `verifyDownwardClosure`, `generateDownsets`, `topologicalSort`, `describeState`, `fringeLabel`, `computeInnerFringe`

**Types:** `EngineConfig`, `HistoryEntry`, `SelectionInfo`, `DiagnosticResult`, `Question`
