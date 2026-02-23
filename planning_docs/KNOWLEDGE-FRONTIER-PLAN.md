# Knowledge Frontier Visualizer — Implementation Plan

## Vision

A learning-science-powered feature for the collab board where grade school students can **see their mathematical knowledge as a living graph**. Through conversational assessment with an AI agent, the graph grows and updates in real-time on the canvas — green nodes for mastered topics, yellow for shaky, red for gaps. The **frontier** (topics whose prerequisites are met) is highlighted, showing the student exactly what to learn next.

**Self-determination theory alignment:**
- **Autonomy** — student drives the conversation, chooses what to explore, self-assesses
- **Competence** — visual proof of what they know; frontier shows achievable next steps (not overwhelming)
- **Relatedness** — collab board lets friends/family/tutors add sticky notes of encouragement, annotate the graph together

**Learning science principles applied:**
- **Mastery learning** — can't advance past unmastered prerequisites
- **Scaffolded learning** — frontier = edge of zone of proximal development
- **Knowledge graph** — prerequisite DAG drives all decisions (Math Academy approach)
- **Diagnostic assessment** — conversational, not test-like (Bloom's talent development)
- **Spaced repetition hook** — green nodes can decay, prompting review (future)

---

## Critical Piece #1: Knowledge Graph Storage & Query

### Data Source

**Learning Commons Knowledge Graph** (CC BY 4.0):
- **836 Common Core Math nodes** (K-12), `StandardsFrameworkItem` type
- **757 `buildsTowards` prerequisite edges** between them
- Grade-tagged (K through 12), with human-readable descriptions
- Already downloaded and validated at `/tmp/kg_nodes.jsonl` and `/tmp/kg_rels.jsonl`

### Storage Design: Static In-House JSON

No database, no API dependency. The CC Math graph is tiny (~500KB total).

```
src/data/knowledge-graph/
  cc-math-nodes.json        # 836 nodes: { id, description, gradeLevel, statementCode, grouping }
  cc-math-edges.json        # 757 edges: { source, target } (buildsTowards)
  index.ts                  # Typed graph traversal API
  layout.ts                 # Dagre-based DAG layout utility
  ingest.ts                 # One-time script to transform JSONL → clean JSON
```

### Ingestion Script (`ingest.ts`)

Run once to transform raw Learning Commons JSONL into clean, minimal JSON:

**Nodes** — extract only what we need:
```typescript
interface KGNode {
  id: string;                    // LC identifier (UUID)
  code: string;                  // e.g. "3.NF.A.1" (from statementCode or caseIdentifierURI)
  description: string;           // human-readable: "Add fractions with unlike denominators"
  gradeLevel: string[];          // ["3"] or ["K"] etc.
  type: 'standard' | 'grouping'; // normalizedStatementType
}
```

**Edges** — just source/target pairs from `buildsTowards` relationships:
```typescript
interface KGEdge {
  source: string;  // node ID that is a prerequisite
  target: string;  // node ID that builds on it
}
```

### Graph Traversal API (`index.ts`)

In-memory graph loaded once at app startup. All operations are O(1) lookups via Maps.

```typescript
// Core data structures (built on load)
const nodeMap: Map<string, KGNode>              // id → node
const childrenMap: Map<string, Set<string>>     // id → set of nodes this unlocks
const parentsMap: Map<string, Set<string>>      // id → set of prerequisite node IDs
const gradeIndex: Map<string, KGNode[]>         // grade → nodes at that grade

// Query API
getNode(id: string): KGNode | undefined
getPrerequisites(id: string): KGNode[]           // immediate parents
getDependents(id: string): KGNode[]              // what this unlocks
getNodesByGrade(grade: string): KGNode[]         // all nodes at a grade level
getRoots(): KGNode[]                             // nodes with no prerequisites

// Frontier computation
getFrontier(masteredIds: Set<string>): KGNode[]
  // Returns nodes where ALL prerequisites are in masteredIds
  // but the node itself is NOT in masteredIds.
  // This is the student's "zone of proximal development."

// Subgraph extraction (for canvas rendering)
getSubgraph(centerIds: string[], depth: number): { nodes: KGNode[], edges: KGEdge[] }
  // BFS outward from centerIds, up to `depth` hops.
  // Returns the local neighborhood for display (keeps canvas manageable).

// Search (for agent conversation)
searchNodes(query: string): KGNode[]
  // Simple text match on description + code. Used by agent to resolve
  // student language ("I'm bad at fractions") → specific node IDs.
```

### DAG Layout Utility (`layout.ts`)

Dagre-based hierarchical layout for knowledge graph rendering. Included from the start — LLM-computed positions are unreliable for DAG structures.

```typescript
import dagre from 'dagre';

export function layoutKnowledgeGraph(
  nodes: { id: string; width: number; height: number }[],
  edges: { source: string; target: string }[],
  options?: { rankDir?: 'TB' | 'LR'; nodeSep?: number; rankSep?: number }
): Map<string, { x: number; y: number }>
```

Used internally by `expandAroundNode` and `computeFrontier` tools. Agent never does coordinate math directly.

### Why This Design

- **No backend needed** — static import, works offline, zero latency
- **Tiny footprint** — 836 nodes fits in memory trivially
- **Extensible** — swap in finer-grained data later without changing the API
- **Deterministic** — graph traversal is pure functions, easy to test
- **Agent-friendly** — `searchNodes` + `getFrontier` give the LLM everything it needs

---

## Critical Piece #2: Agent ↔ Canvas Interaction

### Entry Point: Learning Mode

**UI**: A toggle or sub-selector near the existing Boardie chat button. Two modes:
1. **Boardie** (existing) — general-purpose board agent
2. **Learning Explorer** — knowledge frontier mode

When Learning Explorer is active:
- Chat widget switches to a different system prompt (learning-focused)
- Agent has access to KG query tools (not available in Boardie mode)
- Template and planner tools are **excluded** from the tool catalog (prevents route drift)
- Canvas enters a "knowledge graph view" (could be a visual indicator like a subtle background change)

**Implementation**: Mode toggle in `ChatWidget.tsx`. Per-mode conversation histories in `useAgent.ts` (prevents cross-mode prompt contamination). Mode passed to pipeline via `PipelineConfig`.

### Agent Pipeline: Learning Explorer Mode

#### PipelineConfig Pattern

Refactor `pipeline.ts` to accept a mode-specific configuration object instead of hardcoded prompt + tools:

```typescript
interface PipelineConfig {
  mode: 'boardie' | 'explorer';
  buildSystemPrompt: (viewportCenter, sessionObjects, boardState?) => string;
  toolDefinitions: ToolDefinition[];
  toolSchemas: Record<string, ZodSchema>;
}
```

Both the initial LLM call AND the board-state-retry path use `config.toolDefinitions` and `config.buildSystemPrompt`. Explorer mode config excludes `applyTemplate`, `delegateToPlanner`, and template tools.

#### Executor Registry Pattern

Refactor `executor.ts` from monolithic switch to handler registry:

```typescript
const toolHandlers: Record<string, (input: any, ctx: ExecutorContext) => Promise<ToolResult>> = {
  createStickyNote: handleCreateStickyNote,
  placeKnowledgeNode: handlePlaceKnowledgeNode,
  // ...
};
// dispatch: await toolHandlers[toolName](input, ctx)
```

All existing tools migrated into this pattern alongside new ones. Improves maintainability for all future tools.

#### kgNodeId → Board Object Lookup

KG tools that reference `kgNodeId` need to resolve to canvas object IDs:

```typescript
function findBoardObjectByKgNodeId(kgNodeId: string, objects: BoardObject[]): BoardObject | undefined {
  return objects.find(o => o.kgNodeId === kgNodeId);
}
```

Executor has access to board state. KG tools call this before mutating. Return error to LLM if no match found.

#### System Prompt (Learning Explorer)

```
You are a friendly learning companion helping a student understand their math knowledge.
Your job is to:
1. Have a natural conversation to understand what the student knows and where they struggle
2. Build their personal knowledge graph on the canvas as you learn about them
3. Help them see their "frontier" — the topics they're ready to learn next

CONVERSATION STYLE:
- Warm, encouraging, age-appropriate (grade school)
- Ask one question at a time
- Never feel like a test — feel like a curious friend
- Celebrate what they know before exploring gaps
- Use the student's own language, not formal standard codes

WORKFLOW:
1. Start by asking what grade they're in and what they're working on in math
2. Use searchKnowledgeGraph to find relevant standards
3. Place nodes on the canvas as you discover what they know/don't know
4. Use placeKnowledgeNode to add nodes with confidence colors
5. After placing several nodes, use computeFrontier to show what's next
6. Let the student drive — they can ask about any topic

RULES:
- Always place nodes on the canvas so the student can SEE the conversation
- Green = "I know this well", Yellow = "I'm a little shaky", Red = "I don't know this"
- Connect related nodes with arrows showing prerequisite relationships
- Keep the visible graph manageable (10-20 nodes at a time)
```

#### New Agent Tools (Learning Explorer only)

These tools extend the existing tool system in `tools.ts` / `executor.ts`:

```typescript
// 1. Search the knowledge graph for relevant topics
searchKnowledgeGraph: {
  query: string,           // natural language: "fractions", "multiplication"
  gradeLevel?: string,     // optional filter: "3", "4", "K"
}
// Returns: list of matching KGNodes with descriptions
// Agent uses this to map student language → specific standards
// READ-ONLY: does not count against rate limit

// 2. Place a knowledge node on the canvas
placeKnowledgeNode: {
  nodeId: string,          // KG node ID
  confidence: 'mastered' | 'shaky' | 'gap' | 'unexplored',
  x?: number,              // optional — dagre layout used if omitted
  y?: number,
}
// Creates a kg-node shape on the canvas with appropriate styling
// Also stores the KG node ID as metadata on the BoardObject

// 3. Connect two knowledge nodes (show prerequisite relationship)
connectKnowledgeNodes: {
  fromNodeId: string,      // prerequisite KG node ID
  toNodeId: string,        // dependent KG node ID
}
// Resolves kgNodeId → objectId, then creates a connector between them

// 4. Update a node's confidence level
updateNodeConfidence: {
  nodeId: string,          // KG node ID
  confidence: 'mastered' | 'shaky' | 'gap' | 'unexplored',
}
// Resolves kgNodeId → objectId, updates color + kgConfidence metadata

// 5. Compute and display the frontier
computeFrontier: {}
// Reads all mastered nodes on canvas, calls getFrontier() from KG API,
// highlights frontier nodes with special visual treatment
// READ-ONLY query + visual update

// 6. Get prerequisites for a topic (agent reasoning, not canvas mutation)
getPrerequisites: {
  nodeId: string,
  depth?: number,          // how far back to trace (default 1)
}
// Returns prerequisite nodes so agent can decide what to assess next
// READ-ONLY: does not count against rate limit

// 7. Expand graph neighborhood
expandAroundNode: {
  nodeId: string,
  depth?: number,          // default 1
}
// Places prerequisite and dependent nodes around a central node
// Uses dagre layout internally for readable DAG arrangement
```

### Canvas Rendering: Knowledge Nodes

**New shape type: `kg-node`** with dedicated `KnowledgeNodeShape` component.

Current `RectShape` only draws a filled rectangle — it cannot render text, grade badges, or frontier indicators. A dedicated component is required.

```typescript
// types/board.ts — additions
export type ShapeType = '...' | 'kg-node';

// Optional fields on BoardObject (only used for kg-node type):
kgNodeId?: string;
kgConfidence?: 'mastered' | 'shaky' | 'gap' | 'unexplored';
kgGradeLevel?: string;
```

**`KnowledgeNodeShape.tsx`** (~150 LoC) renders:
- Rounded rect background (confidence-colored):
  - mastered → `#4CAF50` (green), white text
  - shaky → `#FFB74D` (yellow/amber), dark text
  - gap → `#EF5350` (red), white text
  - unexplored → `#BDBDBD` (gray), dark text
- Topic description text (wrapped, ~14px)
- Grade level pill badge (top-right corner, e.g. "G3")
- Frontier indicator (blue `#2196F3` stroke + subtle glow when marked as frontier)

Registered in shape registry via existing `registerShape('kg-node', ...)` pattern. Inherits selection/drag/transform/delete from `BaseShape` wrapper automatically.

### Board State Query Extension

Extend `objectResolver.ts` to include KG metadata in resolved object summaries:
- Add `kgNodeId`, `kgConfidence`, `kgGradeLevel` to resolver output when present
- Add optional `kgNodeId` filter to `requestBoardState` schema

This enables the agent to "read" the student's current graph on session resume.

### Rate Limiting

Conversational assessment generates many short turns. Read-only KG tools (`searchKnowledgeGraph`, `getPrerequisites`, `computeFrontier`) are exempt from the action rate limit since they don't mutate the board and are computationally trivial. Board-mutating tools still count normally.

### Student State Persistence

The student's mastery map (which nodes are green/yellow/red) persists automatically because knowledge nodes are `BoardObject`s in the Yjs doc. When the student returns:
- All their knowledge nodes are still on the canvas
- The agent can read them via `requestBoardState` (filter by `kgNodeId` existence)
- No separate database needed

For multi-session continuity, the agent's conversation history resets but the canvas state persists — the agent can "read" the student's current graph and pick up where they left off.

---

## Implementation Phases

### Phase 0: Data Ingestion + Graph API (2-2.5 hours)
- [ ] Write `ingest.ts` script to transform Learning Commons JSONL → clean JSON
- [ ] Generate `cc-math-nodes.json` and `cc-math-edges.json`
- [ ] Build and test `index.ts` graph traversal API
- [ ] Verify: `getFrontier`, `getSubgraph`, `searchNodes` work correctly
- [ ] Install dagre, build `layout.ts` DAG layout utility
- [ ] Unit tests for graph traversal (especially frontier computation)

### Phase 1: Agent Tools & Pipeline (3-4 hours)
- [ ] Add `kgNodeId`, `kgConfidence`, `kgGradeLevel` fields to `BoardObject` type
- [ ] Refactor `executor.ts` to handler registry pattern (migrate existing + new tools)
- [ ] Refactor `pipeline.ts` to accept `PipelineConfig` (mode-aware prompt + tool selection)
- [ ] Add `kgNodeId→objectId` lookup helper in executor
- [ ] Extend `objectResolver.ts` to surface KG metadata in board state queries
- [ ] Define Zod schemas for 7 new KG tools in `tools.ts`
- [ ] Add tool definitions to Anthropic tool catalog (Explorer mode only)
- [ ] Implement KG tool handlers (placeKnowledgeNode, connectKnowledgeNodes, etc.)
- [ ] Wire read-only KG tools (search, getPrerequisites) to `index.ts` API
- [ ] Write `learningExplorerPrompt.ts` system prompt
- [ ] Add Langfuse spans for KG tool calls (follow existing pattern)
- [ ] Exempt read-only KG tools from rate limit action count

### Phase 2: UI + Rendering (3-4 hours)
- [ ] Create `KnowledgeNodeShape.tsx` component (rounded rect + text + badge + frontier glow)
- [ ] Register `'kg-node'` in shape registry with defaults
- [ ] Add mode state to `useAgent.ts` with per-mode history/session-objects
- [ ] Add mode toggle UI to `ChatWidget.tsx` (header, placeholder, welcome message vary by mode)
- [ ] Ensure knowledge nodes participate in existing selection/drag/delete mechanics
- [ ] Test canvas rendering at 20-30 knowledge nodes

### Phase 3: Conversational Flow Polish (2-3 hours)
- [ ] Tune system prompt for age-appropriate conversation
- [ ] Add `askClarification` integration for multi-choice confidence self-assessment
- [ ] Test end-to-end flow: student says grade → agent finds topics → places nodes → assesses → computes frontier
- [ ] Handle edge cases: student mentions topic not in CC, student says "I don't know" to everything
- [ ] Add encouragement sticky notes feature (agent or collaborators can place them)
- [ ] Test with realistic student scenarios

### Phase 4: Polish & Testing (1-2 hours)
- [ ] Run existing E2E tests to ensure no regressions
- [ ] Manual QA of the full flow
- [ ] Performance check: graph rendering smooth at 20-30 nodes?
- [ ] Clean up any hardcoded values, ensure proper TypeScript types throughout

**Total estimated: 10-13 hours**
**MVP (Phases 0-2): 8-10.5 hours** — achievable in a focused day. Phase 3 is cut candidate if time runs short.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  ChatWidget.tsx                                              │
│  ┌──────────────┐  ┌──────────────────────┐                │
│  │ Mode Toggle   │  │ Chat Messages         │                │
│  │ [Boardie]     │  │ Agent: "What grade?"  │                │
│  │ [Explorer] ←──┤  │ Student: "5th grade"  │                │
│  └──────────────┘  │ Agent: "Let's explore  │                │
│                     │  fractions..."         │                │
│                     └──────────────────────┘                │
└──────────────┬──────────────────────────────────────────────┘
               │ PipelineConfig { mode, prompt, tools }
               ▼
┌──────────────────────────────────────────────────────────────┐
│  pipeline.ts (mode-aware via PipelineConfig)                  │
│                                                               │
│  Explorer: learningExplorerPrompt.ts + KG tools only         │
│  Boardie:  systemPrompt.ts + board tools + templates         │
│                                                               │
│  LLM (Haiku) → tool calls → executor.ts (handler registry)  │
└──────────────┬───────────────────────────────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
┌──────────────┐  ┌──────────────────────────────────┐
│  KG API       │  │  BoardContext (existing)           │
│  index.ts     │  │                                    │
│               │  │  createObject('kg-node', x, y, {  │
│  searchNodes  │  │    content: "Add fractions...",    │
│  getFrontier  │  │    kgNodeId: 'abc-123',           │
│  getSubgraph  │  │    kgConfidence: 'mastered',      │
│  getPrereqs   │  │    kgGradeLevel: '3'              │
│               │  │  })                                │
│  layout.ts    │  │                                    │
│  (dagre)      │  │  → Yjs sync → Canvas render       │
│               │  │    → KnowledgeNodeShape.tsx        │
│  ┌──────────┐ │  │                                    │
│  │cc-math-  │ │  └──────────────────────────────────┘
│  │nodes.json│ │
│  │cc-math-  │ │
│  │edges.json│ │
│  └──────────┘ │
└──────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| KG storage | Static JSON, in-house | Tiny data (836 nodes), no API dependency, zero latency |
| Shape type | New `kg-node` type + `KnowledgeNodeShape` component | RectShape can't render text/badges/glow; dedicated component is ~150 LoC and self-contained |
| State persistence | Yjs (existing) | Knowledge nodes are BoardObjects, sync for free |
| Layout | Dagre from Phase 0 | LLM coordinate math is unreliable for DAG structures; dagre is 30KB and purpose-built |
| Agent model | Haiku (existing) | Sufficient for conversational assessment |
| Mode switching | `PipelineConfig` object threaded through pipeline | Clean seam: both initial + retry calls use config; template/planner excluded from Explorer |
| Executor dispatch | Handler registry map | Scales better than monolithic switch for 7+ new tools |
| Rate limiting | Read-only KG tools exempt from action count | Conversational assessment = many short turns; reads are free |
| Confidence model | 4 levels (mastered/shaky/gap/unexplored) | Simple, visual, kid-friendly |
| Connectors | Use existing `connector` type | `createConnector` already implemented in recent commits |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM hallucinates fake standards | Agent tools query the real KG; LLM can't invent nodes |
| Graph gets visually cluttered | Limit visible nodes to 15-20; dagre layout keeps it readable |
| Student feels "tested" | Prompt engineering: warm tone, celebrate knowns first, no scores |
| CC standards too coarse for real assessment | Future: LLM can generate sub-skill questions within a standard |
| Pipeline refactor introduces regressions | Existing tools migrated mechanically into handler registry; behavior unchanged |
| kgNodeId lookup is O(n) scan | 836 max nodes on canvas; even with all placed, scan is trivial |
| Cross-mode prompt contamination | Per-mode history refs in useAgent; mode switch starts fresh |

---

## Open Questions (Earmarked)

1. **Granularity expansion** — Should the agent be able to "zoom into" a CC standard and generate finer-grained sub-skills (LLM-generated, not from KG)? Powerful but adds hallucination risk. Defer to post-MVP.
2. **Spaced repetition** — Green nodes decaying to yellow over time. Needs a timestamp per node. Easy to add to `BoardObject` metadata later.
3. **Multi-subject** — CC also covers ELA. Same architecture works, just more data. Defer.
4. **Encouragement stickies** — Collaborators adding motivational notes near nodes. Works today with existing sticky notes — just needs prompt guidance.
