import { GRAPH, NODE_LABELS } from "./graph";

/** Precomputed parent/child adjacency from GRAPH edges. */
export const PARENTS_MAP: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const n of GRAPH.nodes) m[n] = [];
  for (const [from, to] of GRAPH.edges) m[to].push(from);
  return m;
})();

export const CHILDREN_MAP: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const n of GRAPH.nodes) m[n] = [];
  for (const [from, to] of GRAPH.edges) m[from].push(to);
  return m;
})();

/** Kahn's algorithm — deterministic topo order (ties broken lexicographically). */
export function topologicalSort(): string[] {
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

/** Backtracking over topological order — output-sensitive, never generates invalid states. */
export function generateDownsets(): Record<string, Set<string>> {
  const topo = topologicalSort();
  const results: Set<string>[] = [];

  function backtrack(i: number, current: Set<string>): void {
    if (i === topo.length) {
      results.push(new Set(current));
      return;
    }
    const node = topo[i];
    backtrack(i + 1, current);
    if (PARENTS_MAP[node].every((p) => current.has(p))) {
      current.add(node);
      backtrack(i + 1, current);
      current.delete(node);
    }
  }

  backtrack(0, new Set());
  results.sort((a, b) => {
    if (a.size !== b.size) return a.size - b.size;
    return [...a].sort().join(",").localeCompare([...b].sort().join(","));
  });

  const states: Record<string, Set<string>> = {};
  results.forEach((set, i) => (states[`S${i}`] = set));
  return states;
}

export const VALID_STATES = generateDownsets();
export const STATE_COUNT = Object.keys(VALID_STATES).length;

/** Auto-generate a human-readable description for any state. */
export function describeState(stateId: string): string {
  const nodes = VALID_STATES[stateId];
  if (nodes.size === 0) {
    const roots = GRAPH.nodes.filter((n) => PARENTS_MAP[n].length === 0);
    const rootLabel = roots.map((n) => NODE_LABELS[n] || n).join(", ");
    return `No bridge concepts mastered. Start at: ${rootLabel}.`;
  }
  if (nodes.size === GRAPH.nodes.length) {
    const tgt = NODE_LABELS.target?.split(" — ")[0] || "target";
    return `Full bridge mastery — ready for ${tgt}.`;
  }
  const frontier = [...nodes].filter((n) =>
    CHILDREN_MAP[n].some((c) => !nodes.has(c))
  );
  const nextSteps = new Set<string>();
  for (const f of frontier)
    for (const c of CHILDREN_MAP[f]) if (!nodes.has(c)) nextSteps.add(c);
  const masteredStr = [...nodes].map((n) => NODE_LABELS[n] || n).join(", ");
  if (nextSteps.size > 0) {
    const nextStr = [...nextSteps]
      .map((n) => `${n} (${NODE_LABELS[n] || n})`)
      .join(", ");
    return `Mastered: ${masteredStr}. Next: ${nextStr}.`;
  }
  return `Mastered: ${masteredStr}.`;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Inner fringe of a knowledge state: the set of nodes whose removal
 * yields another valid state. These are the "most recently mastered"
 * items — the boundary that uniquely identifies this state.
 */
export function computeInnerFringe(stateId: string): string[] {
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

/** Precomputed inner fringes for all states. */
export const INNER_FRINGES: Record<string, string[]> = (() => {
  const f: Record<string, string[]> = {};
  for (const s of Object.keys(VALID_STATES)) f[s] = computeInnerFringe(s);
  return f;
})();

/** Human-readable label using inner fringe notation. */
export function fringeLabel(stateId: string): string {
  const fringe = INNER_FRINGES[stateId];
  if (fringe.length === 0) return "∅";
  return "▸" + fringe.join(",");
}

/** Verify every valid state is downward-closed w.r.t. the graph edges. */
export function verifyDownwardClosure(): boolean {
  const parents: Record<string, string[]> = {};
  for (const node of GRAPH.nodes) parents[node] = [];
  for (const [from, to] of GRAPH.edges) {
    parents[to].push(from);
  }

  for (const [stateId, nodes] of Object.entries(VALID_STATES)) {
    for (const node of nodes) {
      for (const parent of parents[node] || []) {
        if (!nodes.has(parent)) {
          console.error(
            `INVALID: ${stateId} has ${node} but missing prerequisite ${parent}`
          );
          return false;
        }
      }
    }
  }
  return true;
}
