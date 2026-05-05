# Diagnostic Graph Modification Skill

Use this skill when modifying the Bayesian diagnostic tool in `bayesian-diagnostic/`. Triggers on changes to graph topology, bridge nodes, questions, or node labels.

## When This Applies

- Adding or removing bridge nodes
- Changing prerequisite edges
- Adding questions for new nodes
- Changing anchor/target standards

## Required Checklist

Before considering any graph modification complete, verify ALL of these:

1. **`GRAPH.nodes`** — updated with new/removed node IDs
2. **`GRAPH.edges`** — updated (must remain a DAG — no cycles allowed)
3. **`NODE_LABELS[nodeId]`** — human-readable label for every node
4. **`QUESTIONS[nodeId]`** — 2-3 questions per node with correct `guessRate`
5. **`NODE_LABELS.anchor` / `.target`** — updated if bridge endpoints changed
6. **`QUESTIONS.anchor`** — updated if source standard changed
7. **`npm test` passes** — run from `bayesian-diagnostic/` directory

## What Auto-Recomputes (Do NOT manually edit)

- `VALID_STATES` — auto-generated downward-closed subsets
- `INNER_FRINGES` — auto-computed from valid states
- `STATE_COUNT` — derived
- State descriptions — generated from node labels
- ASCII DAG — rendered dynamically
- Knob ranges — adapt to state count

## Guess Rate Reference

| Type | guess_rate | Why |
|------|-----------|-----|
| open (single) | 0.05–0.10 | Hard to guess |
| open (multi-part) | 0.01–0.03 | Must guess all parts |
| multiple_choice (4) | 0.25 | 1/4 chance |
| multiple_choice (2) | 0.50 | 1/2 chance |
| select_all (4 opts) | 0.0625 | 1/16 random |

## Graph Constraints

- Must be a DAG (directed acyclic graph) — no cycles
- Edges flow from prerequisites to dependents
- Every node must be reachable from at least one root (no orphans)
- The diagnostic file is `bayesian-diagnostic/diagnostic.ts`
