# Bayesian Diagnostic Engine — Implementation Plan

**Goal:** A standalone CLI tool that runs a Bayesian adaptive diagnostic for a 3.OA.A.3 → 4.OA.A.1 math bridge. Single TypeScript file, four modules, demo-ready for live knob-tweaking.

---

## Architecture: Single file, four modules

```
bayesian-diagnostic/
├── PLAN.md            ← this file
├── package.json       ← minimal: ts-node, readline
├── tsconfig.json
├── diagnostic.ts      ← THE file (all four modules)
└── test-engine.ts     ← headless engine tests (Step 2 verification)
```

All code lives in `diagnostic.ts` in four clearly delimited sections.

---

## Step 1: Data Layer

**What:** Graph topology, valid states, question bank as plain objects.

### Graph
```
Anchor (3.OA.A.3)
    │
  [BN1] "times as many" language parsing
    │
  [BN2] discriminate additive vs multiplicative comparison
    │
  [BN3] translate comparison to equation
   / \
[BN4] solve multiplication  [BN5] solve division
   \ /
  Target (4.OA.A.1)
```

Edges: BN1→BN2, BN2→BN3, BN3→BN4, BN3→BN5

### Valid States (downward-closed sets)
| State | Mastered nodes | Meaning |
|-------|---------------|---------|
| S0 | {} | No bridge concepts mastered |
| S1 | {BN1} | Can parse "times as many" language |
| S2 | {BN1, BN2} | Can discriminate additive vs multiplicative |
| S3 | {BN1, BN2, BN3} | Can translate to equation |
| S4 | {BN1, BN2, BN3, BN4} | Can also solve multiplication |
| S5 | {BN1, BN2, BN3, BN5} | Can also solve division |
| S6 | {BN1, BN2, BN3, BN4, BN5} | Full bridge mastery |

### Question Bank
~15 questions total: 2-3 per bridge node, 1-2 for anchor. Mix of open, multiple_choice, select_all. Each has a `guess_rate` override.

### Verification
- Sanity check: every valid state is downward-closed (if node X is in the set and Y→X is an edge, then Y is also in the set).

**Deliverable:** Data exports, downward-closure assertion passes.

---

## Step 2: Engine (THE CORE)

**What:** `DiagnosticEngine` class — Bayesian update, node selection, termination.

### Constructor
- `frontierBelief` (0–6, default 2): index of the state the prior peaks at
- `slipRate` (0.05–0.20, default 0.10): P(wrong | mastered)
- `confThreshold` (0.05–0.40, default 0.20): normalized entropy threshold for early stop

### Key Methods

#### `buildPrior(belief: number) → posterior`
Gaussian-ish distribution over 7 states, peaked at `belief` index. Normalized to sum to 1.

#### `update(nodeId: string, response: "correct" | "incorrect" | "idk")`
For each state S:
- `mastered = stateContains(S, nodeId)`
- Likelihood:
  - correct → mastered ? (1 - slip) : guess
  - incorrect → mastered ? slip : (1 - guess)
  - idk → mastered ? 0.02 : 0.95
- `posterior[S] *= likelihood`
- Normalize.
- Push to history.

**Surface the full posterior after every update** — this is the key visibility requirement.

#### `selectNext() → nodeId | null`
For each unasked node, compute P(mastered) = Σ posterior[S] for all S containing that node. Pick node closest to P=0.5 (maximum information gain). Return null if all asked.

#### `entropy() → number`
Standard Shannon entropy: -Σ p·log₂(p)

#### `shouldTerminate() → boolean`
`entropy() / log₂(7) < confThreshold`

#### `getResult()`
Returns: winning state, its probability, full posterior, history.

### Verification (test-engine.ts)
Two hardcoded simulations:
- **Student A (strong):** correct on BN1, BN2, BN3, BN4 → posterior should converge toward S4/S6
- **Student B (weak):** correct on BN1, incorrect on BN2 → posterior should converge toward S1

Log posterior at each step. Confirm convergence.

**Deliverable:** Engine class passes both simulation tests with visible posterior convergence.

---

## Step 3: Terminal I/O

**What:** `TerminalUI` class — question presentation, posterior bar chart, readline loop.

### Key Displays

#### Posterior bar chart (PRIORITY)
```
  S0: ░░░░░░░░░░  2%
  S1: ██░░░░░░░░ 12%
  S2: ████████░░ 51%  ← most likely
  S3: ██░░░░░░░░  8%
  S4: █░░░░░░░░░  5%
  S5: █░░░░░░░░░  4%
  S6: █░░░░░░░░░  3%

  Certainty: 68%
```

#### Question presentation
- Print prompt text
- Multiple choice: lettered options
- "Type your answer, or 'idk' if you're not sure"
- Compare input to answer (case-insensitive, trimmed)
- Multi-part answers: all parts must match

#### Update display
After each answer: node result, bar chart, certainty %, next-node rationale.

**Deliverable:** Interactive terminal session, bar chart renders correctly.

---

## Step 4: ASCII DAG

**What:** Post-diagnostic graph visualization with node status.

```
  [3.OA.A.3] ✓
      │
    [BN1] ✓
      │
    [BN2] ✓  ← FRONTIER
      │
    [BN3] ✗
     / \
  [BN4]? [BN5]?
     \ /
  [4.OA.A.1] ✗
```

Symbols: ✓ mastered, ✗ not mastered, ? not assessed (inferred not mastered)

**Deliverable:** ASCII graph prints with correct status markers.

---

## Step 5: Knob Configuration

**What:** Interactive or flag-based knob setting at startup.

- `--defaults` flag skips prompts, uses default values
- Without flag: prompt for each knob with current default shown
- Display formatted knob box before diagnostic starts

```
┌─────────────────────────────────────────────────┐
│  Frontier belief: 2/6  │  Slip: 0.10  │  Conf: 0.20  │
└─────────────────────────────────────────────────┘
```

**Deliverable:** Knobs configurable at startup, displayed before run.

---

## Step 6: Rerun Loop

**What:** After results, offer to rerun with different knobs.

- "Rerun with different settings? (y/n)"
- If yes, loop back to knob config
- Enables live demo: "same bridge, different student, different frontier"

**Deliverable:** Seamless rerun without restarting script.

---

## Build Order & Dependencies

```
Step 1 (Data) → Step 2 (Engine) → Step 3 (Terminal UI) → Step 4 (DAG) → Step 5 (Knobs) → Step 6 (Rerun)
         │              │
         └── test ──────└── test-engine.ts
```

Steps 1-2 are the foundation. Step 3 makes it interactive. Steps 4-6 are demo polish.

---

## Key Design Decisions

1. **Single file:** All modules in `diagnostic.ts` with clear section comments. Keeps it simple, greppable, easy to demo.
2. **Posterior visibility:** Every engine update surfaces the full posterior distribution — this is non-negotiable for the demo.
3. **No external deps beyond readline:** Keep it zero-friction. `ts-node` to run, that's it.
4. **Questions are hand-authored:** No generation, no API calls. ~15 terminal-friendly math questions.
5. **Downward-closed states only:** The valid state space is small (7 states) so we enumerate explicitly rather than computing.
