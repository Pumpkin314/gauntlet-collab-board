# Knowledge Graph Data Layer — Architecture Handover

## Context

We're rebuilding the knowledge graph data layer for an educational whiteboard app. The app lets students explore Common Core Math standards as nodes on a whiteboard. As they demonstrate mastery (node turns green) or confusion (node turns red/orange), the graph spawns parent/child nodes to guide their learning path.

The data in `src/data/knowledge-graph-v2/` is the cleaned, production-ready result of deep analysis of the CZI Learning Commons Knowledge Graph (CC BY-4.0, sourced from 1EdTech/CASE Network standards + Achievement Network learning components). It replaces any previous knowledge graph data.

## Files

### `cc-math-nodes.json` — 406 connected content standards
```ts
interface StandardNode {
  id: string;              // UUID, e.g. "0021bf1f-0746-5aab-ab4f-ca656120edeb"
  code: string;            // CC code, e.g. "4.NF.B.4.b", "K.CC.A.1", "HSN-CN.A.3"
  description: string;     // Full standard text (may contain LaTeX like $\\frac{a}{b}$)
  gradeLevel: string[];    // e.g. ["4"] or ["9","10","11","12"] for HS
  domain: string;          // Parent domain code, e.g. "4.NF.B"
  domainDescription: string; // e.g. "Build fractions from unit fractions..."
}
```
- All 406 nodes form a connected graph (one main component of 404 + one pair of 2). Zero orphans.
- Excludes: Standard Groupings (category headers), Mathematical Practice standards (MP1-MP8), and 103 orphaned content standards (see orphans file).
- Grade distribution spans K through 12. HS standards have gradeLevel `["9","10","11","12"]`.

### `cc-math-edges.json` — 1,041 directed edges
```ts
interface Edge {
  source: string;  // source node UUID
  target: string;  // target node UUID
  type: "buildsTowards" | "relatesTo";
}
```
- **`buildsTowards` (757 edges):** Prerequisite relationships. `source` is the prerequisite, `target` is the dependent. Directional — "you need source before target." These are the primary edges for whiteboard traversal: student masters a node → spawn its `buildsTowards` targets as grey. Student struggles → spawn its `buildsTowards` sources as prerequisite remediation.
- **`relatesTo` (284 edges):** Cross-references between related standards. Weaker signal than `buildsTowards` — good for "see also" suggestions, not hard prerequisites. Treat as bidirectional.

### `cc-math-components.json` — 1,449 learning components (sub-skills)
```ts
interface LearningComponent {
  id: string;          // UUID
  standardId: string;  // UUID of the parent standard
  description: string; // e.g. "Find the conjugate of a complex number"
}
```
- Each component maps to exactly one standard (degree-1 leaf nodes).
- All 406 connected standards have at least one component (avg 3.6, max 41).
- These are NOT graph connectors — they don't add edges between standards.
- Use them for: assessment granularity (what specific sub-skill is the student struggling with?), tooltip/detail panel content, mastery decomposition.

### `cc-math-orphans.json` — 103 disconnected content standards
Same schema as `cc-math-nodes.json`. These are real CC Math content standards with zero `buildsTowards` or `relatesTo` edges in the source data. Mostly HS elective topics (stats, modeling, advanced functions) plus ~54 scattered K-8 standards. Parked here for future enrichment — could generate `buildsTowards` edges via LLM inference.

## Architecture Decision: In-Memory Graph

**No database needed for graph topology.** The entire dataset is 711 KB. Load it at app startup into an in-memory adjacency structure.

Recommended implementation:
```ts
// Build at startup from the JSON files
interface GraphStore {
  nodes: Map<string, StandardNode>;
  // Adjacency lists keyed by node ID
  buildsTowardsChildren: Map<string, string[]>;  // node → standards it leads to
  buildsTowardsParents: Map<string, string[]>;    // node → prerequisites
  relatesTo: Map<string, string[]>;               // node → related standards
  components: Map<string, LearningComponent[]>;   // node → sub-skills
}
```

**Why not Neo4j:** Graph is read-only, 406 nodes / 1,041 edges is trivially small, Neo4j adds JVM + server process + $65/mo hosting for zero benefit. In-memory traversal is <1ms vs 5-50ms over network.

**Why not SQLite for graph:** Recursive CTEs work but are slower than pointer chasing in a Map for this scale. SQLite IS appropriate for student progress state (mastery tracking, timestamps, user data) — that's relational data, not graph data.

**Latency profile:**
- Graph traversal (get parents/children of a node): <1ms (in-memory Map lookup)
- Full K-12 path finding: <5ms (BFS over 406 nodes)
- Memory footprint: ~2MB after parsing

## Key Traversal Patterns for the Whiteboard

```
Student marks node GREEN (mastery demonstrated):
  → Fetch buildsTowardsChildren[nodeId]
  → Spawn those as grey (unexplored) nodes on whiteboard

Student marks node RED (confusion/lack of knowledge):
  → Fetch buildsTowardsParents[nodeId]
  → Spawn those as dependency nodes to remediate

Student clicks a node for details:
  → Fetch components[nodeId]
  → Show sub-skill breakdown in detail panel

Student wants related context:
  → Fetch relatesTo[nodeId]
  → Show as "see also" suggestions (softer than prereqs)
```

## Grade Selection & Initial Spawn

### `cc-math-spawn-config.json` — precomputed spawn data per grade
Drop this in `src/data/knowledge-graph-v2/` alongside the other files.

### Key design decision: Conceptual Lanes, not Strand Columns

CC standard strand labels (OA, NBT, NF, etc.) **change names at grade boundaries** — OA becomes EE at grade 6, which becomes Algebra at HS. Analysis of cross-grade `buildsTowards` edges shows **66% change strands** when crossing a grade boundary. Rigid strand-based columns would break at every transition.

However, the underlying **mathematical concepts are continuous**. Four persistent conceptual lanes run K-12, plus one that emerges at Grade 8:

| Lane | Color | K-5 Strands | 6-8 Strands | HS Strands |
|------|-------|-------------|-------------|------------|
| **Number Sense** | Blue #3B82F6 | CC, NBT, NF | NS | N-RN, N-CN, N-Q |
| **Algebraic Thinking** | Purple #8B5CF6 | OA | RP, EE | A-SSE, A-APR, A-CED, A-REI |
| **Functions** | Pink #EC4899 | *(in OA/RP)* | F (Grade 8) | F-IF, F-BF, F-LE, F-TF |
| **Measurement & Data** | Amber #F59E0B | MD | SP | S-ID, S-IC, S-CP |
| **Geometry** | Emerald #10B981 | G | G | G-CO, G-SRT, G-C, G-GPE, G-GMD, G-MG |

**Lanes are for initial spawn placement only.** Once nodes are on the whiteboard, they float freely — edges are the truth, not labels. The student's interaction drives layout from there.

### Schema

```ts
interface SpawnConfig {
  laneDefinitions: {
    [laneId: string]: {           // "number" | "algebra" | "functions" | "data" | "geometry"
      name: string;               // "Number Sense"
      description: string;
      strands: string[];          // CC strand codes that map to this lane
      color: string;              // hex color for initial tinting
      emergesAtGrade?: string;    // "8" for functions lane
    }
  };
  strandToLane: Record<string, string>;  // "OA" → "algebra", "NF" → "number", etc.
  laneBands: {
    [bandId: string]: {           // "K-5" | "6-8" | "HS"
      grades: string[];
      laneOrder: string[];        // optimal left-to-right ordering for this band
      laneOrderWithFunctions?: string[];  // for 6-8, includes functions slot at Grade 8
      note: string;
    }
  };
  bandTransitions: {
    [transitionId: string]: {     // "K-5 → 6-8" | "6-8 → HS"
      description: string;
      stableLanes: string[];      // lanes that don't move
      swappedLanes?: string[];    // lanes that trade positions
      rearrangedLanes?: string[]; // lanes that fully rearrange
    }
  };
  grades: {
    [grade: string]: {            // "K" | "1"-"8" | "HS"
      grade: string;
      band: string;               // "K-5" | "6-8" | "HS"
      laneOrder: string[];        // this grade's specific lane order
      nodeCount: number;
      lanes: {
        [laneId: string]: {
          name: string;
          anchor: string;         // node ID — best starting node for this lane
          domains: Record<string, string[]>;  // domain code → node IDs
          nodeIds: string[];      // all node IDs in this lane
        }
      };
      anchors: Record<string, string>;   // lane → anchor node ID
      buildsTowards: Edge[];
      relatesTo: Edge[];
      fromPrevGrade: Edge[];
      toNextGrade: Edge[];
    }
  };
}
```

### Lane ordering: 3 bands, optimized per-grade

Lane order is NOT fixed across all grades. We brute-forced all 120 permutations per grade, scoring by `sum(lanes_skipped × edge_count)` for cross-lane `buildsTowards` edges only. The per-grade optima cluster into three natural bands:

**Band 1 (K–5): `algebra — number — data — geometry`**
Natively optimal for 5 of 6 grades (K, 2, 3, 4, 5). Grade 1 pays +3 crossing penalty on 19 edges. This band is stable for 6 consecutive grades.

**Band 2 (6–8): `data — number — algebra — geometry`** (functions inserts at Grade 8)
Grades 7 and 8 are natively optimal. Grade 6 pays +6 penalty. At Grade 8, functions enters between algebra and geometry: `data — number — algebra — functions — geometry`.

**Band 3 (HS): `data — geometry — functions — algebra — number`**
Natively optimal, stands alone.

**Band transitions:**
- **K-5 → 6-8:** `number` stays at position 1, `geometry` stays right. `algebra` and `data` swap sides. Clean two-lane trade.
- **6-8 → HS:** Full rearrangement. This is a natural "fresh view" moment — students entering high school math start a new context anyway.

Within a band, lane order is completely fixed — zero movement between grades. The spawner only needs to handle rearrangement at the two band boundaries (Grade 5→6 and Grade 8→HS).

### Anchor nodes per grade

Each grade has a precomputed **anchor node** per active lane — the most-connected node that sits roughly in the "middle" of the prerequisite chain (balanced distance to previous and next grade). Anchors were scored on: internal connectivity, cross-lane diagonal edges, and grade-boundary balance.

| Grade | Nodes | Number | Algebra | Functions | Data | Geometry | Anchor Diagonals |
|-------|-------|--------|---------|-----------|------|----------|-----------------|
| K | 23 | K.CC.C.6 | K.OA.A.3 | — | K.MD.B.3 | K.G.A.2 | Number↔Data |
| 1 | 21 | 1.NBT.B.2 | 1.OA.C.6 | — | 1.MD.C.4 | 1.G.A.2 | *(1-hop)* |
| 2 | 26 | 2.NBT.A.1 | 2.OA.A.1 | — | 2.MD.B.5 | 2.G.A.3 | Algebra↔Data |
| 3 | 27 | 3.NF.A.1 | 3.OA.D.8 | — | 3.MD.D.8 | 3.G.A.2 | Alg↔Data, Num→Geo |
| 4 | 34 | 4.NF.B.3.d | 4.OA.A.2 | — | 4.MD.A.2 | 4.G.A.1 | Number↔Data |
| 5 | 28 | 5.NBT.B.7 | 5.OA.A.2 | — | 5.MD.B.2 | 5.G.A.1 | *(1-hop)* |
| 6 | 38 | 6.NS.C.6.c | 6.EE.B.8 | — | 6.SP.B.5 | 6.G.A.3 | Number↔Algebra |
| 7 | 33 | 7.NS.A.3 | 7.RP.A.3 | — | 7.SP.C.6 | 7.G.A.1 | Algebra↔Data |
| 8 | 30 | 8.NS.A.1 | 8.EE.A.2 | 8.F.B.4 | 8.SP.A.3 | 8.G.B.6 | **All 5 connected!** |
| HS | 146 | HSN-Q.A.1 | HSA-CED.A.1 | HSF-LE.A.2 | HSS-CP.B.6 | HSG-MG.A.1 | Num↔Geo, Alg↔Func |

Grades marked *(1-hop)* have anchor diagonals that emerge after one student interaction (anchor connects to a non-anchor intermediary which connects cross-lane). This is the desired behavior — the whiteboard grows organically.

### Spawn algorithm

```ts
function spawnGrade(grade: string): InitialWhiteboardState {
  const config = spawnConfig.grades[grade];
  const laneOrder = config.laneOrder;  // per-grade, from band
  
  // 1. Place anchor nodes first — one per active lane, centered on screen
  const anchorNodes = laneOrder
    .filter(lane => config.anchors[lane])
    .map((lane, idx, arr) => ({
      id: config.anchors[lane],
      ...graphStore.nodes.get(config.anchors[lane]),
      x: (idx / (arr.length - 1)) * CANVAS_WIDTH,  // spread horizontally by lane order
      y: CANVAS_HEIGHT / 2,                          // centered vertically
      status: 'grey',
      lane,  // for initial color tinting only, not a constraint
    }));
  
  // 2. Draw buildsTowards edges between anchors (diagonals appear immediately)
  //    relatesTo edges are available but render as secondary/dashed — don't show on spawn
  const anchorIds = new Set(anchorNodes.map(n => n.id));
  const visibleEdges = config.buildsTowards
    .filter(e => anchorIds.has(e.source) && anchorIds.has(e.target));
  
  // 3. No rigid columns — nodes are placed by lane hint initially
  //    but will reposition based on force-directed layout or user dragging
  
  return { nodes: anchorNodes, edges: visibleEdges };
}

// When student interacts with a node:
function onNodeInteraction(nodeId: string, action: 'mastery' | 'struggle') {
  if (action === 'mastery') {
    // Spawn buildsTowards children (next standards to learn)
    const children = graphStore.buildsTowardsChildren.get(nodeId);
    // Place near parent, offset downward
  } else {
    // Spawn buildsTowards parents (prerequisites to remediate)
    const parents = graphStore.buildsTowardsParents.get(nodeId);
    // Place near child, offset upward
  }
  // relatesTo edges can be shown on-demand (hover, click "show related")
  // but don't auto-spawn — they add clutter without directional signal
}

// When transitioning across a band boundary (Grade 5→6 or 8→HS):
function onBandTransition(fromGrade: string, toGrade: string) {
  // Option A: Animate lane repositioning (algebra/data swap for 5→6)
  // Option B: Reset view — clear whiteboard, spawn fresh for new grade
  // Recommend Option B for 8→HS (full rearrangement),
  // Option A for 5→6 (only 2 lanes swap, number+geometry stay put)
}
```

### HS special handling
HS has 146 nodes — too many for one view. Recommend a secondary selector: user picks "HS" → then picks a lane (Algebra ~28 nodes, Functions ~34, Geometry ~43, etc.) → spawn that lane's anchor + its immediate neighborhood. Cross-lane edges will naturally pull in nodes from other lanes as the student explores.

## Data Provenance

- **Standards:** 1EdTech CASE Network via CZI Learning Commons Knowledge Graph v1.5.0 (Feb 2026)
- **Learning Components:** Achievement Network via CZI
- **Prerequisite edges (buildsTowards):** Student Achievement Partners' Coherence Map via CZI
- **License:** CC BY-4.0. Attribution: "Knowledge Graph is provided by Learning Commons under the CC BY-4.0 license."

## Future Enrichment Path

1. **LLM-generated edges for orphans:** Feed the 103 orphaned standards + the existing graph to an LLM, prompt it to infer `buildsTowards` edges based on mathematical prerequisite logic. Validate with educators.
2. **Cross-state alignment:** The CZI data has 16,614 state-specific standard nodes connected to CC Math via border edges. Could enable "show me the Texas equivalent of this CC standard."
3. **Curriculum content:** 8,145 Activities + 2,550 Lessons from Illustrative Mathematics are linked to these standards via `hasEducationalAlignment` edges in the full CZI data. Could power "recommended practice problems" per node.
