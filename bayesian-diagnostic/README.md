# Bayesian Diagnostic Engine

Standalone CLI tool that runs a Bayesian adaptive diagnostic for math bridge assessments. Identifies where a student sits on a prerequisite graph between two standards using a small number of targeted questions.

## Quick Start

```bash
cd bayesian-diagnostic
npm install
npm start              # interactive knob config
npm start -- --defaults  # skip config, use defaults
npm test               # run engine verification tests
```

## Architecture

Modular TypeScript codebase:

| File | Role |
|---|---|
| `types.ts` | Shared interfaces |
| `graph.ts` | Graph topology + node labels |
| `questions.ts` | Question bank (2-3 per node) |
| `states.ts` | Auto-generated valid states, fringes, topology helpers |
| `engine.ts` | Bayesian state machine (update, node selection, termination) |
| `prior-data.ts` | Population prior persistence + graph hashing |
| `ui.ts` | Terminal I/O, posterior bar chart, ASCII DAG |
| `diagnostic.ts` | Entry point + barrel re-exports |

## How It Works

- The **graph** defines prerequisite relationships between bridge nodes
- **Valid states** (downward-closed subsets) are auto-generated from the graph
- Each state is labeled by its **inner fringe** — the set of "most recently mastered" nodes that uniquely identify it (e.g., `▸SYM3a` means "mastered through SYM3a")
- The engine uses Bayesian updates to narrow the posterior over states after each question
- Node selection targets the most uncertain node (P(mastered) closest to 0.5)
- The diagnostic terminates when normalized entropy drops below the confidence threshold

## Changing the Graph Topology

The graph is the single source of truth. When you change it, these things auto-recompute:
- Valid states (all downward-closed subsets)
- State descriptions
- Inner fringe labels
- ASCII DAG layout
- State count, knob ranges, entropy calculations

### Checklist: What YOU Must Update

When adding nodes, removing nodes, or changing edges:

- [ ] **`graph.ts` → `GRAPH.nodes`** — add/remove node IDs
- [ ] **`graph.ts` → `GRAPH.edges`** — add/remove prerequisite edges (must remain a DAG — no cycles)
- [ ] **`graph.ts` → `NODE_LABELS`** — add a human-readable label for each new node
- [ ] **`questions.ts` → `QUESTIONS`** — add 2-3 hand-authored questions per new node, each with:
  - `prompt`: terminal-friendly question text
  - `type`: `"open"` | `"multiple_choice"` | `"select_all"`
  - `answer`: correct answer(s)
  - `guessRate`: P(correct | not mastered) — varies by question type
- [ ] **`graph.ts` → `NODE_LABELS.anchor`** / **`NODE_LABELS.target`** — update if the bridge endpoints change
- [ ] **`questions.ts` → `QUESTIONS.anchor`** — update anchor warm-start questions if the source standard changes
- [ ] **Run `npm test`** — verify states are generated correctly and engine converges

### What You Do NOT Need to Update

- `VALID_STATES` — auto-generated from graph
- `STATE_COUNT` — derived from VALID_STATES
- `INNER_FRINGES` — auto-computed
- State descriptions — auto-generated from node labels
- ASCII DAG — renders dynamically from graph topology
- Knob ranges — adapt to state count
- Engine logic — fully generic over any graph/state configuration

### Typical guess_rate Values

| Question type | Typical guess_rate | Rationale |
|---|---|---|
| `open` (single numeric) | 0.05–0.10 | Hard to guess a number |
| `open` (multi-part) | 0.01–0.03 | Must guess ALL parts |
| `multiple_choice` (4 options) | 0.25 | 1/4 random chance |
| `multiple_choice` (2 options) | 0.50 | 1/2 random chance |
| `select_all` (4 options) | 0.0625 | 1/16 for random subset selection |

### Open Question: Bayesian Prior

The prior supports three modes (in priority order): manual Gaussian override (`frontierBelief`), population-based prior (from saved diagnostic results), or uniform. Population priors are keyed by a graph hash so stale data from a different topology is automatically discarded.
