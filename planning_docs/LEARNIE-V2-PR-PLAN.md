# Learnie v2 — PR & Commit Plan

Each sprint produces 2-3 PRs (one per parallel worktree). Each PR has explicit commits, files touched, interface contracts, and test requirements. PRs within a sprint can be developed in parallel on isolated worktrees.

**Branch naming:** `feature/learnie-v2/S{sprint}-{short-name}`
**Commit style:** `feat(explorer):` / `test(explorer):` / `refactor(explorer):`

---

## Sprint 0: Foundation

### PR #S0-A: v2 Knowledge Graph Index Module

**Branch:** `feature/learnie-v2/S0-kg-index`
**Files created:** `src/data/knowledge-graph-v2/index.ts`
**Files touched:** none (additive only)
**Depends on:** nothing

#### Commits

**Commit 1: `feat(explorer): add v2 knowledge graph index with typed accessors`**

Create `src/data/knowledge-graph-v2/index.ts` that:
- Imports the 3 JSON files (`cc-math-nodes.json`, `cc-math-edges.json`, `cc-math-components.json`) and spawn config (`cc-math-spawn-config.json`)
- Builds the in-memory `GraphStore` at module load:
  ```ts
  interface GraphStore {
    nodes: Map<string, StandardNode>;
    buildsTowardsChildren: Map<string, string[]>;
    buildsTowardsParents: Map<string, string[]>;
    relatesTo: Map<string, string[]>;
    components: Map<string, LearningComponent[]>;
  }
  ```
- Exports typed accessor functions:
  - `getNode(id: string): StandardNode | undefined`
  - `getChildren(id: string): string[]` — buildsTowards children (node IDs)
  - `getParents(id: string): string[]` — buildsTowards parents (node IDs)
  - `getRelated(id: string): string[]` — relatesTo neighbors
  - `getComponents(standardId: string): LearningComponent[]`
  - `getGradeConfig(grade: string): GradeConfig` — from spawn config (anchors, lanes, edges)
  - `getEdgesAmong(nodeIds: string[]): Edge[]` — all buildsTowards edges where both endpoints are in the set
  - `getLaneForNode(nodeId: string, grade: string): string | undefined` — lane ID from spawn config
  - `getAllGrades(): string[]` — available grades
- Re-exports the `StandardNode`, `LearningComponent`, `Edge` types
- Does NOT touch old `src/data/knowledge-graph/` directory

**Commit 2: `test(explorer): add v2 KG index unit tests`**

Create `tests/evals/kg-index.test.ts`:
- `graphStore.nodes.size === 406`
- `getChildren` for a known node returns expected IDs
- `getParents` for a known node returns expected IDs
- `getComponents` for a node with known count returns correct length
- `getGradeConfig("5")` returns 4 anchors (no functions lane)
- `getGradeConfig("8")` returns 5 anchors (functions lane active)
- `getEdgesAmong` with 2 connected anchor IDs returns 1 edge
- `getEdgesAmong` with 2 unconnected IDs returns 0 edges
- `getLaneForNode` returns correct lane for a known standard
- `getAllGrades` returns K, 1-8, HS

---

### PR #S0-B: Quiz & Confidence Types

**Branch:** `feature/learnie-v2/S0-quiz-types`
**Files created:** `src/agent/quizTypes.ts`
**Files touched:** none
**Depends on:** nothing

#### Commits

**Commit 1: `feat(explorer): add quiz and confidence type definitions`**

Create `src/agent/quizTypes.ts`:
```ts
export type Confidence = 'gray' | 'green' | 'yellow' | 'red';
export type QuizFormat = 'mc' | 'fr-text' | 'fr-visual';

export interface QuizData {
  format: QuizFormat;
  nodeId: string;       // board object ID
  kgNodeId: string;     // knowledge graph node ID
  questionText: string;
  options?: string[];    // MC only
  correctIndex?: number; // MC only
  components: string[];  // component IDs this question targets
}

export interface QuizResult {
  correct: boolean;
  partial?: boolean;
  llmConfidence?: number;  // 0-1, FR grading only
  feedback: string;
  newConfidence: Confidence;
}

export interface SpawnInstruction {
  kgNodeId: string;
  lane: string;
  relativeX: number;  // offset from parent
  relativeY: number;
}

export interface EdgeInstruction {
  sourceKgNodeId: string;
  targetKgNodeId: string;
}
```

No tests needed — types only, verified by TypeScript compiler.

---

### PR #S0-C: Explorer State Machine (pure logic)

**Branch:** `feature/learnie-v2/S0-state-machine`
**Files created:** `src/agent/explorerStateMachine.ts`
**Files touched:** none
**Depends on:** S0-B merged (imports `QuizData`, `QuizResult`, `Confidence` from `quizTypes.ts`)

#### Commits

**Commit 1: `feat(explorer): add state machine types and transition function`**

Create `src/agent/explorerStateMachine.ts`:
- `ExplorerState` discriminated union (CHOOSE_GRADE, SPAWNING_ANCHORS, IDLE, NODE_MENU_OPEN, QUIZ_LOADING, QUIZ_IN_PROGRESS, QUIZ_RESULT)
- `ExplorerEvent` discriminated union (SELECT_GRADE, ANCHORS_PLACED, NODE_CLICKED, MENU_DISMISSED, ACTION_QUIZ, ACTION_DONT_KNOW, ACTION_SHOW_PREREQS, ACTION_SHOW_CHILDREN, QUIZ_READY, QUIZ_ANSWERED, QUIZ_FR_ANSWERED, QUIZ_GRADED, CANCEL_QUIZ)
- `SideEffect` discriminated union (SPAWN_ANCHORS, SET_CONFIDENCE, SPAWN_NODES, DRAW_EDGES, GENERATE_QUIZ, GRADE_FR, SHOW_CHAT_MESSAGE, PAN_TO)
- `transition(state, event) → { nextState, effects }` — pure function, no imports beyond types
- `computeNewConfidence(current, quizResult) → Confidence` — implements the confidence transition table from Design Decision 15
- `getActionsForConfidence(confidence) → string[]` — returns available action menu items per confidence color
- Invalid transitions return `{ nextState: state, effects: [] }` (no-op)

**Commit 2: `test(explorer): add state machine transition tests`**

Create `tests/evals/state-machine.test.ts`:
- Happy path: full cycle CHOOSE_GRADE → SELECT_GRADE → SPAWNING_ANCHORS → ANCHORS_PLACED → IDLE → NODE_CLICKED → NODE_MENU_OPEN → ACTION_QUIZ → QUIZ_LOADING → QUIZ_READY → QUIZ_IN_PROGRESS → QUIZ_ANSWERED → QUIZ_GRADED → QUIZ_RESULT → (auto) → IDLE
- "Don't know" path: IDLE → NODE_CLICKED → ACTION_DONT_KNOW → verify SET_CONFIDENCE(red) effect → IDLE
- Cancel quiz: QUIZ_IN_PROGRESS → CANCEL_QUIZ → IDLE
- Menu dismiss: NODE_MENU_OPEN → MENU_DISMISSED → IDLE
- Invalid: IDLE + QUIZ_ANSWERED → no-op
- Invalid: CHOOSE_GRADE + NODE_CLICKED → no-op
- Confidence transitions (all 10 rows):
  - gray + correct(any) → green
  - gray + incorrect → red
  - red + correct MC → yellow
  - red + correct FR low confidence → yellow
  - red + correct FR high confidence → green
  - red + incorrect → red
  - yellow + correct → green
  - yellow + incorrect → red
  - green + incorrect → yellow
  - green + correct → green
- `getActionsForConfidence`: gray returns ["Quiz me!", "I don't know this"], green returns ["Quiz me again!", "What does this unlock?"], etc.
- Side effects: SELECT_GRADE produces SPAWN_ANCHORS + SHOW_CHAT_MESSAGE effects
- Side effects: ACTION_DONT_KNOW produces SET_CONFIDENCE + SHOW_CHAT_MESSAGE effects

---

### Sprint 0 merge order:
1. **S0-B** (types, no deps) — merge first
2. **S0-A** (KG index, no deps on B) — merge second
3. **S0-C** (state machine, imports from B) — merge third

**Sprint 0 gate:** `npm run test` passes. All unit tests for KG index + state machine green.

---

## Sprint 1: Grade Selection + Anchor Spawn

### PR #S1-A: Grade Selection UI

**Branch:** `feature/learnie-v2/S1-grade-ui`
**Files modified:** `src/components/ChatWidget.tsx`
**Depends on:** S0-C merged (needs `ExplorerState` type to check `state.type === 'CHOOSE_GRADE'`)

#### Commits

**Commit 1: `feat(explorer): add grade selection buttons to chat`**

Modify `ChatWidget.tsx`:
- When explorer mode is active AND state is `CHOOSE_GRADE`, render a grade button grid
- Buttons: "Grade K", "Grade 1" ... "Grade 8", "HS"
- Clicking dispatches `{ type: 'SELECT_GRADE', grade }` (via a callback prop for now — ExplorerContext wiring comes in Sprint 2)
- Style: grid layout, colored buttons matching the existing chat options pattern
- No LLM call, pure UI

**Commit 2: `test(explorer): add grade selection rendering test`**

Add to test file:
- Renders grade buttons when state is CHOOSE_GRADE
- Does not render grade buttons when state is IDLE
- Button click calls onSelectGrade with correct grade string

---

### PR #S1-B: Anchor Spawn Logic + Welcome Message

**Branch:** `feature/learnie-v2/S1-anchor-spawn`
**Files created:** `src/agent/explorerSpawn.ts`
**Depends on:** S0-A + S0-C merged (needs KG index + state machine types)

#### Commits

**Commit 1: `feat(explorer): add deterministic anchor spawn logic`**

Create `src/agent/explorerSpawn.ts`:
```ts
export interface AnchorPlacement {
  kgNodeId: string;
  lane: string;
  laneColor: string;
  x: number;
  y: number;
  code: string;        // e.g. "5.NBT.B.7"
  description: string; // standard text
}

export function computeAnchorPlacements(
  grade: string,
  viewportCenter: { x: number; y: number },
  viewportWidth: number,
): AnchorPlacement[]

export function computeAnchorEdges(
  grade: string,
  placedAnchorKgIds: string[],
): EdgeInstruction[]
```

Logic:
- Read `getGradeConfig(grade)` for anchors and lane order
- Spread anchors across viewport width by lane order index
- Apply ±30px vertical offset for buildsTowards anchor pairs (Design Decision 4)
- Return placement data (NOT board objects — the caller creates those)

**Commit 2: `feat(explorer): add on-demand spawn positioning for children/prereqs`**

Add to `explorerSpawn.ts`:
```ts
export function computeChildSpawnPlacements(
  parentPosition: { x: number; y: number },
  childKgNodeIds: string[],
  grade: string,
  viewportWidth: number,
  maxSpawn?: number,  // default 3
): { placements: AnchorPlacement[]; remaining: number }

export function computePrereqSpawnPlacements(
  childPosition: { x: number; y: number },
  prereqKgNodeIds: string[],
  grade: string,
  viewportWidth: number,
  maxSpawn?: number,
): { placements: AnchorPlacement[]; remaining: number }
```

- Children: positioned 200px ABOVE parent, spread by lane x
- Prerequisites: positioned 200px BELOW the node, spread by lane x
- Returns `remaining` count for "+N more" badge
- Cap at `maxSpawn` (default 3, Design Decision 6)

**Commit 3: `feat(explorer): add welcome message templates`**

Add to `explorerSpawn.ts`:
```ts
export function getWelcomeMessage(grade: string, anchorCount: number): string
export function getDontKnowMessage(standardCode: string): string
export function getQuizResultMessage(result: QuizResult, standardCode: string): string
```

Deterministic templates, no LLM. Warm, encouraging, age-appropriate.

**Commit 4: `test(explorer): add spawn logic unit tests`**

Create `tests/evals/spawn.test.ts`:
- `computeAnchorPlacements("5", ...)` returns 4 placements with correct lanes
- `computeAnchorPlacements("8", ...)` returns 5 placements (functions lane)
- Vertical offset: if anchor A buildsTowards anchor B, A.y < B.y
- `computeAnchorEdges("5", anchorIds)` returns expected edge count
- `computeChildSpawnPlacements` with 5 children and maxSpawn=3 returns 3 placements + remaining=2
- `computePrereqSpawnPlacements` positions below parent
- Welcome message contains grade number
- "Don't know" message is encouraging (contains "no worries" or similar)

---

### Sprint 1 merge order:
1. **S1-B** first (spawn logic, no UI deps)
2. **S1-A** second (UI, may reference spawn types)

**Sprint 1 gate:** Unit tests pass. Manual check: grade buttons render in chat (not yet wired to spawn — that's Sprint 2).

---

## Sprint 2: Node Click + Action Menu

### PR #S2-A: ExplorerContext + Canvas Bridge

**Branch:** `feature/learnie-v2/S2-explorer-context`
**Files created:** `src/contexts/ExplorerContext.tsx`, `src/hooks/useExplorerStateMachine.ts`
**Files modified:** `src/agent/useAgent.ts`, `src/components/Canvas.tsx`, `src/components/ChatWidget.tsx`
**Depends on:** S1-A + S1-B merged

This is the integration PR — wires everything together.

#### Commits

**Commit 1: `feat(explorer): add useExplorerStateMachine hook`**

Create `src/hooks/useExplorerStateMachine.ts`:
- Wraps the pure `transition()` function in React state
- `dispatch(event)` → calls `transition(state, event)` → sets new state → executes side effects
- Side effect executor: switch on effect type, call board actions / chat methods / LLM API as needed
- Holds `kgNodeMap: Map<string, string>` (kgNodeId → boardObjectId)
- Holds `confidenceMap: Map<string, Confidence>` (kgNodeId → current confidence)

**Commit 2: `feat(explorer): add ExplorerContext provider`**

Create `src/contexts/ExplorerContext.tsx`:
```ts
interface ExplorerContextValue {
  state: ExplorerState;
  dispatch: (event: ExplorerEvent) => void;
  confidenceMap: Map<string, Confidence>;
  kgNodeMap: Map<string, string>;
}
```
- `ExplorerProvider` wraps the hook, provides context
- `useExplorer()` consumer hook with error on missing provider

**Commit 3: `feat(explorer): wire Canvas kg-node clicks to ExplorerContext`**

Modify `src/components/Canvas.tsx`:
- Import `useExplorer`
- In the node selection handler: if the selected object is a kg-node AND explorer state is IDLE, dispatch `NODE_CLICKED`
- If explorer state is QUIZ_IN_PROGRESS, show "Finish your quiz first!" (tooltip or brief message)

**Commit 4: `feat(explorer): wire ChatWidget to ExplorerContext for grade selection + spawn`**

Modify `src/components/ChatWidget.tsx`:
- Connect grade buttons to `dispatch({ type: 'SELECT_GRADE', grade })`
- On SPAWNING_ANCHORS effect: call `computeAnchorPlacements` → create board objects → dispatch `ANCHORS_PLACED`
- On IDLE after spawn: show welcome message in chat

Modify `src/agent/useAgent.ts`:
- When mode is `'explorer'`, delegate to `useExplorerStateMachine` instead of the LLM pipeline
- Boardie mode unchanged

**Commit 5: `test(explorer): add ExplorerContext integration test`**

- Provider renders without error
- dispatch SELECT_GRADE transitions state
- useExplorer throws outside provider

---

### PR #S2-B: Node Action Menu Component

**Branch:** `feature/learnie-v2/S2-action-menu`
**Files created:** `src/components/NodeActionMenu.tsx`
**Depends on:** S0-C merged (needs `getActionsForConfidence`)

Self-contained UI component. Does NOT need ExplorerContext — receives props.

#### Commits

**Commit 1: `feat(explorer): add NodeActionMenu floating component`**

Create `src/components/NodeActionMenu.tsx`:
```ts
interface NodeActionMenuProps {
  nodeId: string;
  confidence: Confidence;
  screenPosition: { x: number; y: number };
  onAction: (action: ExplorerEvent) => void;
  onDismiss: () => void;
}
```
- HTML div, absolute positioned at `screenPosition`
- Buttons from `getActionsForConfidence(confidence)`
- Maps button labels to ExplorerEvent types:
  - "Quiz me!" / "Quiz me again!" → `ACTION_QUIZ`
  - "I don't know this" → `ACTION_DONT_KNOW`
  - "What leads to this?" → `ACTION_SHOW_PREREQS`
  - "What does this unlock?" → `ACTION_SHOW_CHILDREN`
  - "Challenge me!" → `ACTION_QUIZ` with FR override flag
- Click-away listener → `onDismiss()`
- Escape key → `onDismiss()`
- Styled with Tailwind: rounded, shadow, compact

**Commit 2: `test(explorer): add NodeActionMenu tests`**

- Gray confidence: renders "Quiz me!" and "I don't know this"
- Green confidence: renders "Quiz me again!" and "What does this unlock?"
- Red confidence: renders "Quiz me!", "What leads to this?"
- Yellow confidence: renders all actions
- Click "I don't know this" calls onAction with ACTION_DONT_KNOW
- Escape key calls onDismiss

---

### PR #S2-C: "Don't Know" End-to-End Flow

**Branch:** `feature/learnie-v2/S2-dont-know-flow`
**Files modified:** (state machine additions if needed, chat templates)
**Depends on:** S2-A merged (needs ExplorerContext wired)

#### Commits

**Commit 1: `feat(explorer): wire "don't know" action through full flow`**

- Verify the state machine path: NODE_MENU_OPEN → ACTION_DONT_KNOW → effects [SET_CONFIDENCE(red), SHOW_CHAT_MESSAGE] → IDLE
- In the side effect executor (useExplorerStateMachine): SET_CONFIDENCE updates the board object's `kgConfidence` field + the confidence map
- KnowledgeNodeShape already reads `kgConfidence` for fill color — verify it respects the 'red' value
- Chat shows the encouraging "don't know" message from `getDontKnowMessage()`

**Commit 2: `test(explorer): add "don't know" end-to-end test`**

- State machine: NODE_MENU_OPEN + ACTION_DONT_KNOW → IDLE with red confidence
- Confidence map updates correctly
- Chat message is encouraging

---

### Sprint 2 merge order:
1. **S2-B** first (standalone component)
2. **S2-A** second (integration, wires S2-B into Canvas)
3. **S2-C** third (needs S2-A's wiring)

**Sprint 2 gate:** Manual check: open Learnie → pick grade → see anchors → click node → action menu appears → "I don't know this" → red node → encouraging message. Demo milestone 2.

---

## Sprint 3: Quiz Flow

### PR #S3-A: Quiz Generator + Grading (LLM backend)

**Branch:** `feature/learnie-v2/S3-quiz-generator`
**Files created:** `src/agent/quizGenerator.ts`
**Files modified:** `src/agent/apiClient.ts` (maybe)
**Depends on:** S0-A + S0-B merged

#### Commits

**Commit 1: `feat(explorer): add quiz format picker`**

Add to `src/agent/quizGenerator.ts`:
```ts
export function pickQuizFormat(
  grade: string,
  componentCount: number,
  forceFormat?: QuizFormat,
): QuizFormat
```
- K-2: always MC
- 3-5: MC default
- 6-8: FR if 4+ components, else MC
- HS: MC for MVP
- `forceFormat` override for "Challenge me!"

**Commit 2: `feat(explorer): add MC question generator (LLM)`**

```ts
export async function generateMCQuiz(
  node: StandardNode,
  components: LearningComponent[],
  grade: string,
): Promise<QuizData>
```
- Calls Haiku with system prompt for age-appropriate MC question
- Parses response into QuizData with options + correctIndex
- Includes retry logic for malformed responses

**Commit 3: `feat(explorer): add FR question generator + grading (LLM)`**

```ts
export async function generateFRQuiz(
  node: StandardNode,
  components: LearningComponent[],
  grade: string,
): Promise<QuizData>

export async function gradeFRAnswer(
  quiz: QuizData,
  answer: string,
  node: StandardNode,
  grade: string,
): Promise<{ correct: boolean; partial: boolean; llmConfidence: number; feedback: string }>
```
- Generate: Haiku for question text
- Grade: Sonnet for evaluation (needs nuance)
- Returns `llmConfidence` (0-1) for the confidence transition table

**Commit 4: `feat(explorer): add MC grading (deterministic)`**

```ts
export function gradeMCAnswer(quiz: QuizData, answerIndex: number): { correct: boolean; feedback: string }
```
- Compare `answerIndex === quiz.correctIndex`
- Return appropriate feedback template

**Commit 5: `test(explorer): add quiz generator unit tests`**

- `pickQuizFormat("K", 3)` → 'mc'
- `pickQuizFormat("7", 5)` → 'fr-text'
- `pickQuizFormat("7", 2)` → 'mc'
- `pickQuizFormat("7", 2, 'fr-text')` → 'fr-text' (override)
- `gradeMCAnswer` with correct index → `{ correct: true, ... }`
- `gradeMCAnswer` with wrong index → `{ correct: false, ... }`
- (LLM calls tested manually or with mocked API in integration)

---

### PR #S3-B: Quiz Display + Confidence Updates (frontend)

**Branch:** `feature/learnie-v2/S3-quiz-frontend`
**Files modified:** `src/components/ChatWidget.tsx`, `src/hooks/useExplorerStateMachine.ts`
**Depends on:** S2-A + S0-B merged

#### Commits

**Commit 1: `feat(explorer): add quiz display in chat (MC + FR)`**

Modify `ChatWidget.tsx`:
- When state is `QUIZ_LOADING`: show typing indicator / skeleton
- When state is `QUIZ_IN_PROGRESS` and quiz.format is 'mc': show question text + lettered option buttons (A/B/C/D)
- When state is `QUIZ_IN_PROGRESS` and quiz.format is 'fr-text': show question text + enable text input
- Option button click → dispatch `QUIZ_ANSWERED` with `answerIndex`
- Text submit → dispatch `QUIZ_FR_ANSWERED` with `text`

**Commit 2: `feat(explorer): add quiz result display + feedback in chat`**

- When state is `QUIZ_RESULT`: show result feedback message
- Correct: green accent, encouraging text
- Incorrect: warm text, brief explanation
- Partial (FR): yellow accent, hint text
- After 2s or user click: dispatch auto-transition back to IDLE

**Commit 3: `feat(explorer): wire confidence transitions into side effect executor`**

Modify `src/hooks/useExplorerStateMachine.ts` side effect executor:
- On `SET_CONFIDENCE` effect: update board object's `kgConfidence` property AND local confidenceMap
- Apply `computeNewConfidence(currentConfidence, quizResult)` from the state machine
- Verify KnowledgeNodeShape renders the correct fill color for each confidence value

**Commit 4: `test(explorer): add quiz display and confidence transition tests`**

- Chat renders MC options when state is QUIZ_IN_PROGRESS with mc format
- Chat renders text input when state is QUIZ_IN_PROGRESS with fr-text format
- Chat renders feedback when state is QUIZ_RESULT
- Confidence transitions: all 10 rows from Design Decision 15 (integration-level, dispatching events through the hook)

---

### Sprint 3 merge order:
1. **S3-A** first (backend, no UI deps)
2. **S3-B** second (consumes quiz data from S3-A)

**Sprint 3 gate:** Manual check: click node → "Quiz me!" → MC question appears → answer → node turns green/yellow/red → feedback message. Also: "Challenge me!" → FR question → text answer → LLM grades → confidence updates. Demo milestone 3.

---

## Sprint 4: Spawn on Demand

### PR #S4-A: Dynamic Node Spawning + Progressive Disclosure

**Branch:** `feature/learnie-v2/S4-dynamic-spawn`
**Files modified:** `src/hooks/useExplorerStateMachine.ts`, `src/agent/explorerSpawn.ts`, `src/components/shapes/KnowledgeNodeShape.tsx`
**Depends on:** S3-B merged

#### Commits

**Commit 1: `feat(explorer): wire "What does this unlock?" spawn flow`**

In side effect executor:
- On `ACTION_SHOW_CHILDREN`: get `getChildren(kgNodeId)` → filter out already-visible → call `computeChildSpawnPlacements` → create board objects → draw edges → dispatch `ANCHORS_PLACED` equivalent
- Store remaining count for "+N more"

**Commit 2: `feat(explorer): wire "What leads to this?" spawn flow`**

Same pattern but with `getParents(kgNodeId)` + `computePrereqSpawnPlacements`.

**Commit 3: `feat(explorer): add "+N more" badge to KnowledgeNodeShape`**

Modify `src/components/shapes/KnowledgeNodeShape.tsx`:
- If node has `kgRemainingChildren > 0` or `kgRemainingPrereqs > 0`, render a small pill badge
- Badge text: "+3 more" / "+1 more"
- Clicking badge dispatches expand event for next batch

**Commit 4: `test(explorer): add dynamic spawn tests`**

- Spawning children of a node with 5 children: 3 placed + remaining=2
- Spawning again after "+N more": next 2 placed + remaining=0
- Already-visible nodes are not re-spawned
- Cross-grade spawn works (Grade 5 anchor → Grade 6 children)

---

### PR #S4-B: Edge Drawing + Auto-Pan

**Branch:** `feature/learnie-v2/S4-edges-autopan`
**Files modified:** `src/components/Canvas.tsx`, `src/hooks/useExplorerStateMachine.ts`
**Depends on:** S4-A merged (needs spawned nodes to draw edges to)

#### Commits

**Commit 1: `feat(explorer): add comprehensive edge drawing on spawn`**

In side effect executor, after any spawn:
- Call `getEdgesAmong(allVisibleKgNodeIds)`
- Compare with currently drawn edges
- Create board connector objects for new edges only
- Edges are `buildsTowards` arrows (directed). `relatesTo` hidden by default.

**Commit 2: `feat(explorer): add auto-pan after spawn`**

- After spawn + edge draw, compute bounding box of trigger node + new nodes
- If any new nodes are outside viewport, animate pan (300ms ease-out) to center the midpoint
- Use existing `stageRef` to animate position
- Flag as revocable: wrap in a `ENABLE_AUTO_PAN` constant

**Commit 3: `test(explorer): add edge drawing tests`**

- Spawning a child that connects to another visible node → edge drawn
- Spawning a child with no connections to other visible nodes → only parent-child edge
- Edge dedup: same edge not drawn twice

---

### Sprint 4 merge order:
1. **S4-A** first
2. **S4-B** second

**Sprint 4 gate:** Manual check: master a node → "What does this unlock?" → children appear above with arrows → quiz a child → master it → expand further → 10-15 node knowledge map. "+N more" works. Auto-pan keeps nodes visible. Demo milestone 4.

---

## Sprint 5: Polish + Persistence

### PR #S5-A: Firebase Persistence

**Branch:** `feature/learnie-v2/S5-firebase`
**Files created:** `src/services/explorerPersistence.ts`
**Files modified:** `src/hooks/useExplorerStateMachine.ts`
**Depends on:** S4-B merged

#### Commits

**Commit 1: `feat(explorer): add Firebase explorer state persistence`**

Create `src/services/explorerPersistence.ts`:
```ts
export async function saveExplorerState(boardId: string, state: PersistedExplorerState): Promise<void>
export async function loadExplorerState(boardId: string): Promise<PersistedExplorerState | null>
export async function clearExplorerState(boardId: string): Promise<void>
```
- Firestore subcollection: `boards/{boardId}/explorerState`
- Persists: grade, state machine state type, kgNodeMap, confidenceMap, askedQuestions

**Commit 2: `feat(explorer): save state on every transition, restore on mount`**

Modify `useExplorerStateMachine`:
- After every `dispatch` → `saveExplorerState(boardId, ...)`
- On mount: `loadExplorerState(boardId)` → if exists, restore state + rebuild board objects
- Debounce saves (200ms) to avoid excessive writes

**Commit 3: `feat(explorer): add clear + grade re-selection flows`**

- "Clear" button in chat header → confirmation → `clearExplorerState` + remove all kg-nodes from board + dispatch to CHOOSE_GRADE
- "Change grade" button → same flow with confirmation "This will clear your current map"

---

### PR #S5-B: Locked Interaction + UX Guards

**Branch:** `feature/learnie-v2/S5-ux-guards`
**Files modified:** `src/components/Canvas.tsx`, `src/components/ChatWidget.tsx`
**Depends on:** S3-B merged

#### Commits

**Commit 1: `feat(explorer): add quiz-in-progress interaction lock`**

- Canvas: during QUIZ_IN_PROGRESS, clicking a node shows tooltip "Finish your current quiz first!"
- Tooltip: small HTML overlay, auto-dismiss after 2s
- Cancel button in chat: subtle pulse animation (CSS `@keyframes`)
- Cancel dispatches `CANCEL_QUIZ` → state returns to IDLE

**Commit 2: `test(explorer): add interaction lock tests`**

- During QUIZ_IN_PROGRESS, NODE_CLICKED produces no state change (just tooltip effect)
- CANCEL_QUIZ from QUIZ_IN_PROGRESS → IDLE

---

### PR #S5-C: Visual Polish (Animations)

**Branch:** `feature/learnie-v2/S5-polish`
**Files modified:** `src/components/shapes/KnowledgeNodeShape.tsx`, `src/components/Canvas.tsx`, `src/components/ChatWidget.tsx`
**Depends on:** S4-B merged

#### Commits

**Commit 1: `feat(explorer): add node spawn animation`**

- New kg-nodes fade in (opacity 0→1) + slide from parent position (Konva tween, 300ms)
- Use Konva's built-in `node.to()` animation API

**Commit 2: `feat(explorer): add confidence color transition animation`**

- When `kgConfidence` changes, animate fill color (Konva tween, 200ms)
- Smooth interpolation between gray→green, gray→red, etc.

**Commit 3: `feat(explorer): add chat typing indicator for quiz loading`**

- During QUIZ_LOADING, show animated dots ("...") in chat
- Replace with actual question when QUIZ_READY fires

---

### Sprint 5 merge order:
1. **S5-B** and **S5-C** can merge in any order (independent)
2. **S5-A** last (touches the hook that S5-B/C may also touch — merge last to resolve cleanly)

**Sprint 5 gate:** Manual end-to-end: grade select → quiz 3 nodes → expand children → quiz children → refresh page → state restored → clear → fresh start. Animations smooth. Locked interaction works. Demo-ready.

---

## Manual Verification Schedule

Automated tests run on every PR. Manual verification at these checkpoints only:

| When | What to Check | Time |
|------|---------------|------|
| **After Sprint 1 merge** | Grade buttons render, anchors appear, welcome message | 5 min |
| **After Sprint 2 merge** | Full click → menu → "don't know" → red flow | 5 min |
| **After Sprint 3 merge** | Full quiz loop (MC + FR), all confidence transitions | 15 min |
| **After Sprint 4 merge** | 10-15 node exploration session, edges, "+N more", auto-pan | 15 min |
| **After Sprint 5 merge** | Persistence (refresh test), clear, grade switch, animations, lock | 15 min |

No manual checks needed during Sprint 0 (pure logic, unit tests sufficient).
Total manual verification: ~55 minutes across all sprints.

---

## Quick Reference: All PRs

| PR | Branch | New Files | Key Modified Files | Parallel With |
|----|--------|-----------|-------------------|---------------|
| S0-A | `S0-kg-index` | `knowledge-graph-v2/index.ts` | — | S0-B, S0-C |
| S0-B | `S0-quiz-types` | `agent/quizTypes.ts` | — | S0-A, S0-C |
| S0-C | `S0-state-machine` | `agent/explorerStateMachine.ts` | — | S0-A, S0-B* |
| S1-A | `S1-grade-ui` | — | `ChatWidget.tsx` | S1-B |
| S1-B | `S1-anchor-spawn` | `agent/explorerSpawn.ts` | — | S1-A |
| S2-A | `S2-explorer-context` | `contexts/ExplorerContext.tsx`, `hooks/useExplorerStateMachine.ts` | `Canvas.tsx`, `ChatWidget.tsx`, `useAgent.ts` | S2-B |
| S2-B | `S2-action-menu` | `components/NodeActionMenu.tsx` | — | S2-A, S2-C |
| S2-C | `S2-dont-know-flow` | — | (state machine, chat) | S2-B |
| S3-A | `S3-quiz-generator` | `agent/quizGenerator.ts` | `apiClient.ts` | S3-B |
| S3-B | `S3-quiz-frontend` | — | `ChatWidget.tsx`, `useExplorerStateMachine.ts` | S3-A |
| S4-A | `S4-dynamic-spawn` | — | `explorerSpawn.ts`, `KnowledgeNodeShape.tsx`, `useExplorerStateMachine.ts` | — |
| S4-B | `S4-edges-autopan` | — | `Canvas.tsx`, `useExplorerStateMachine.ts` | — |
| S5-A | `S5-firebase` | `services/explorerPersistence.ts` | `useExplorerStateMachine.ts` | S5-B, S5-C |
| S5-B | `S5-ux-guards` | — | `Canvas.tsx`, `ChatWidget.tsx` | S5-A, S5-C |
| S5-C | `S5-polish` | — | `KnowledgeNodeShape.tsx`, `Canvas.tsx`, `ChatWidget.tsx` | S5-A, S5-B |

*S0-C can start in parallel with S0-B but must merge after S0-B (imports types).
