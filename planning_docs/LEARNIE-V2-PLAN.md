# Learnie v2 — Implementation Plan

**Goal:** Demo-ready state-machine-driven learning explorer with v2 knowledge graph.

**Priority:** Demo polish > feature completeness. The first 10-15 node interactions must look and feel great.

**Companion doc:** `LEARNIE-V2-DESIGN-DECISIONS.md` for rationale behind each choice.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Canvas (Konva)                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ KG Node  │  │ KG Node  │  │ KG Node  │  ...         │
│  │ (click)  │──│ (arrow)  │──│          │              │
│  └────┬─────┘  └──────────┘  └──────────┘              │
│       │ onNodeAction(id, action)                        │
├───────┼─────────────────────────────────────────────────┤
│       ▼                                                 │
│  ExplorerStateMachine                                   │
│  ┌─────────────────────────────────────────────┐        │
│  │ state: CHOOSE_GRADE | IDLE | QUIZ | LESSON  │        │
│  │ transition(event) → side effects             │        │
│  │   - spawn nodes (deterministic)              │        │
│  │   - update confidence (deterministic)        │        │
│  │   - generate quiz (LLM call)                 │        │
│  │   - grade FR answer (LLM call)               │        │
│  └─────────────────────────────────────────────┘        │
│       │                                                 │
│       ▼                                                 │
│  ChatPanel (display-only for quizzes + encouragement)   │
│  BoardActions (create/update/delete objects on canvas)   │
└─────────────────────────────────────────────────────────┘
```

---

## Sprint 0: Foundation (Data Layer + State Machine Skeleton)

### 0.1 — v2 Knowledge Graph Index Module

Replace `src/data/knowledge-graph/index.ts` with v2 data.

**New file:** `src/data/knowledge-graph-v2/index.ts`

```ts
interface GraphStore {
  nodes: Map<string, StandardNode>;
  buildsTowardsChildren: Map<string, string[]>;
  buildsTowardsParents: Map<string, string[]>;
  relatesTo: Map<string, string[]>;
  components: Map<string, LearningComponent[]>;
  spawnConfig: SpawnConfig;
}
```

**Exports:**
- `getNode(id)`, `getChildren(id)`, `getParents(id)`, `getRelated(id)`
- `getComponents(standardId)` — sub-skills for quiz generation
- `getGradeConfig(grade)` — anchors, lanes, edges for initial spawn
- `getEdgesAmong(ids)` — for drawing arrows between visible nodes
- `getLaneForNode(nodeId, grade)` — which lane a node belongs to

**Keep old `knowledge-graph/` directory** untouched (Boardie may still reference it). New explorer code imports only from `knowledge-graph-v2/`.

### 0.2 — State Machine Core

**New file:** `src/agent/explorerStateMachine.ts`

```ts
type ExplorerState =
  | { type: 'CHOOSE_GRADE' }
  | { type: 'SPAWNING_ANCHORS'; grade: string }
  | { type: 'IDLE'; grade: string }
  | { type: 'NODE_MENU_OPEN'; grade: string; nodeId: string }
  | { type: 'QUIZ_LOADING'; grade: string; nodeId: string }
  | { type: 'QUIZ_IN_PROGRESS'; grade: string; nodeId: string; quiz: QuizData }
  | { type: 'QUIZ_RESULT'; grade: string; nodeId: string; result: QuizResult }
  | { type: 'INTERACTIVE_LESSON'; grade: string; nodeId: string }  // post-MVP

type ExplorerEvent =
  | { type: 'SELECT_GRADE'; grade: string }
  | { type: 'ANCHORS_PLACED' }
  | { type: 'NODE_CLICKED'; nodeId: string }
  | { type: 'MENU_DISMISSED' }
  | { type: 'ACTION_QUIZ' }
  | { type: 'ACTION_DONT_KNOW' }
  | { type: 'ACTION_SHOW_PREREQS' }
  | { type: 'ACTION_SHOW_CHILDREN' }
  | { type: 'ACTION_LESSON' }
  | { type: 'QUIZ_READY'; quiz: QuizData }
  | { type: 'QUIZ_ANSWERED'; answerIndex: number }
  | { type: 'QUIZ_FR_ANSWERED'; text: string }
  | { type: 'QUIZ_GRADED'; result: QuizResult }
  | { type: 'CANCEL_QUIZ' }

function transition(state: ExplorerState, event: ExplorerEvent): {
  nextState: ExplorerState;
  effects: SideEffect[];
}
```

> **DECISION NEEDED: Should the state machine be a plain function (as above) or use `useReducer` directly?**
>
> Plain function is easier to test (pure function, no React dependency). We'd wrap it in a `useExplorerStateMachine()` hook that calls `transition()` and executes side effects. Leaning toward this — speak up if you prefer useReducer or xstate.

**Side effects** are returned as data, executed by the hook:
```ts
type SideEffect =
  | { type: 'SPAWN_ANCHORS'; grade: string }
  | { type: 'SET_CONFIDENCE'; nodeId: string; confidence: Confidence }
  | { type: 'SPAWN_NODES'; nodes: SpawnInstruction[] }
  | { type: 'DRAW_EDGES'; edges: EdgeInstruction[] }
  | { type: 'GENERATE_QUIZ'; nodeId: string; components: LearningComponent[] }
  | { type: 'GRADE_FR'; nodeId: string; answer: string; components: LearningComponent[] }
  | { type: 'SHOW_CHAT_MESSAGE'; message: string; options?: string[] }
  | { type: 'PAN_TO'; x: number; y: number }
```

### 0.3 — Quiz Types

**New file:** `src/agent/quizTypes.ts`

```ts
type QuizFormat = 'mc' | 'fr-text' | 'fr-visual';  // fr-visual earmarked for post-MVP

interface QuizData {
  format: QuizFormat;
  nodeId: string;
  kgNodeId: string;
  questionText: string;
  options?: string[];       // MC only
  correctIndex?: number;    // MC only
  components: string[];     // which sub-skills this tests
}

interface QuizResult {
  correct: boolean;
  partial?: boolean;        // FR: "somewhat right"
  feedback: string;         // encouraging message
  newConfidence: Confidence;
}
```

---

## Sprint 1: Grade Selection + Anchor Spawn (Demo Milestone 1)

### 1.1 — Grade Selection UI

**Modify:** `ChatWidget.tsx` (or new component)

On fresh explorer session, show grade buttons (K through 8, plus HS). No LLM call — pure UI.

> **DECISION NEEDED: Where do grade buttons live?**
>
> Option A: In the chat panel as clickable option buttons (consistent with current options pattern).
> Option B: As a modal/overlay centered on the canvas (more prominent, feels like onboarding).
> Option C: As floating buttons on the canvas itself.
>
> Leaning toward A for MVP (least new UI work, reuses existing options infrastructure). But B would demo better.

State transition: `CHOOSE_GRADE` → `SELECT_GRADE("5")` → `SPAWNING_ANCHORS`

### 1.2 — Anchor Spawn Logic

**New file:** `src/agent/explorerSpawn.ts`

Deterministic. No LLM. Reads from spawn config.

```ts
function spawnAnchors(
  grade: string,
  actions: BoardActions,
  viewportCenter: ViewportCenter,
): { nodeMap: Map<string, string>; edges: KGEdge[] }
```

**Layout rules (MVP):**
- Lane positions: evenly spread across viewport width (4 lanes = 25/50/75/100% of viewport width, 5 lanes for Grade 8)
- Anchors at viewport center Y
- Vertical offset: if anchor A `buildsTowards` anchor B, A.y -= 30, B.y += 30
- Draw `buildsTowards` arrows between anchors (from spawn config's within-grade edges)
- Apply lane tint colors from `laneDefinitions` (blue/purple/pink/amber/emerald)

> **DECISION NEEDED: Should anchor nodes show the lane color or the confidence color (gray)?**
>
> Option A: Lane color (blue for Number Sense, purple for Algebraic Thinking, etc.) — more visually distinctive, communicates domain.
> Option B: Confidence color (gray = unexplored) — consistent with the color = confidence rule.
> Option C: Lane-colored border/badge + confidence fill — best of both but more visual complexity.
>
> Leaning toward C: gray fill (confidence) + colored left-side stripe or top badge showing lane. Keeps color = confidence universal while adding domain context.

### 1.3 — Chat Welcome Message

After anchors spawn, show in chat:
> "Welcome! I've placed the key concepts for Grade 5 on your board. Click any node to get started — you can quiz yourself or tell me if it's new to you."

Deterministic template, no LLM.

**Demo milestone 1 checkpoint:** User opens Learnie → clicks Grade 5 → 4 anchors appear in lanes with arrows between them → welcome message in chat.

---

## Sprint 2: Node Click + Action Menu (Demo Milestone 2)

### 2.1 — Canvas → State Machine Bridge

**Modify:** `Canvas.tsx` `handleSelect` function

When a `kg-node` is selected AND the explorer state machine is in `IDLE`:
- Dispatch `NODE_CLICKED` event to state machine
- State machine transitions to `NODE_MENU_OPEN`

**New prop on Canvas or new context:** `onExplorerNodeAction?: (nodeId: string, action: string) => void`

> **DECISION NEEDED: How to pass the callback?**
>
> Option A: New context (`ExplorerContext`) that Canvas and ChatWidget both consume.
> Option B: Prop drilling through Canvas → ChatWidget already shares `stagePosRef`; add the callback alongside.
> Option C: Event bus / custom DOM events.
>
> Leaning toward A — a dedicated `ExplorerContext` that wraps the state machine, provides `dispatch(event)`, and exposes current state. Both Canvas and ChatWidget consume it. Clean separation.

### 2.2 — Floating Action Menu

**New component:** `src/components/NodeActionMenu.tsx`

Positioned near the clicked node (absolute-positioned HTML div overlaying the canvas, anchored to the node's screen coordinates).

- Shows context-sensitive buttons based on node's `kgConfidence`
- Dismisses on click-away or Escape
- Dispatches action events to state machine

> **DECISION NEEDED: Konva overlay or HTML overlay?**
>
> Konva: Stays in canvas coordinate space, scales with zoom. But buttons would be custom Konva shapes (harder to style, no native focus/hover).
> HTML: Native buttons with CSS styling, easier to build. But needs coordinate transform (canvas coords → screen coords) and repositioning on pan/zoom.
>
> Leaning toward HTML overlay. The coordinate math is straightforward (Konva's `getAbsolutePosition()` + stage offset), and HTML buttons are much faster to build and style.

### 2.3 — "I Don't Know This" Flow

Simplest action path — no LLM, instant:
1. User clicks gray node → action menu → "I don't know this"
2. State machine: `NODE_MENU_OPEN` → `SET_CONFIDENCE(red)` → `IDLE`
3. Node turns red. Chat shows: "No worries! When you're ready, click it again to explore what leads up to this concept."

**Demo milestone 2 checkpoint:** Click a gray node → see action menu → click "I don't know this" → node turns red → encouraging chat message.

---

## Sprint 3: Quiz Flow (Demo Milestone 3)

### 3.1 — Quiz Generation (LLM Call)

**Modify/New:** `src/agent/quizGenerator.ts`

```ts
async function generateQuiz(
  node: StandardNode,
  components: LearningComponent[],
  grade: string,
  format: QuizFormat,
  previousQuestions?: string[],  // dedup, post-MVP
): Promise<QuizData>
```

- Calls Anthropic API (Haiku for MC, Sonnet for FR grading)
- System prompt: "Generate a {format} question for a Grade {grade} student about: {standard description}. Target sub-skill: {component description}. ..."
- For MC: returns questionText + 3-4 options + correctIndex
- Components passed as the spec for what to assess

> **DECISION NEEDED: Quiz format selection logic.**
>
> You said: use standard sophistication + grade level. Concrete proposal:
>
> ```ts
> function pickFormat(grade: string, node: StandardNode): QuizFormat {
>   const gradeNum = grade === 'K' ? 0 : parseInt(grade);
>   // HS always MC for MVP (FR grading for abstract algebra is unreliable)
>   if (gradeNum >= 9) return 'mc';
>   // Grade 6-8: MC default, FR if standard has 4+ components (richer content)
>   if (gradeNum >= 6) return components.length >= 4 ? 'fr-text' : 'mc';
>   // Grade 3-5: MC unless student explicitly chooses "challenge mode"
>   if (gradeNum >= 3) return 'mc';  // FR at ~20% rate via random? or always MC?
>   // K-2: always MC
>   return 'mc';
> }
> ```
>
> Is this logic right? Or do you want a different split? The "let user choose" option would be a toggle in the action menu: "Quiz me!" defaults to the above, "Challenge me!" forces FR.

### 3.2 — Quiz Display in Chat

MC: Show question text + lettered option buttons (reuse existing options infrastructure).
FR: Show question text + enable text input in chat (already exists).

State: `QUIZ_LOADING` (show skeleton) → `QUIZ_IN_PROGRESS` (show question) → user answers → `QUIZ_RESULT`

### 3.3 — Quiz Grading

**MC:** Deterministic. Compare `answerIndex` to `correctIndex`. Instant.

**FR:** LLM call to Sonnet. System prompt: "A Grade {grade} student was asked: {question}. They answered: {answer}. The correct concept is: {component description}. Rate: correct / partially correct / incorrect. Be encouraging."

### 3.4 — Confidence Update After Quiz

```
MC correct     → green (mastered)
MC incorrect   → depends on previous color:
                   gray/green → yellow (shaky)
                   yellow → red (gap)
                   red stays red
FR correct     → green
FR partial     → yellow
FR incorrect   → same as MC incorrect
```

> **DECISION NEEDED: Your spec said "green may shift to only yellow if wrong and red may shift to yellow even if correct." Let me make this explicit:**
>
> | Previous | Quiz Result | New Color |
> |----------|------------|-----------|
> | Gray | Correct | Green |
> | Gray | Incorrect | Yellow |
> | Green | Correct | Green (stays) |
> | Green | Incorrect | Yellow (downgrade) |
> | Yellow | Correct | Green (upgrade) |
> | Yellow | Incorrect | Red (downgrade) |
> | Red | Correct | Yellow (one step up, not straight to green) |
> | Red | Incorrect | Red (stays) |
>
> Is this the transition table you want? The key question: should red + correct → yellow (cautious) or red + correct → green (trust the quiz)?

Chat feedback after grading: warm, encouraging, age-appropriate. Deterministic templates with LLM-generated detail:
- Correct: "Nice work! You've got {concept} down."
- Partial: "You're on the right track! {brief hint}"
- Incorrect: "That's a tough one! {concept} is about {brief explanation}. Want to try again or explore what leads up to it?"

**Demo milestone 3 checkpoint:** Click gray node → "Quiz me!" → MC appears in chat → answer → node turns green/yellow/red → encouraging message.

---

## Sprint 4: Spawn on Demand (Demo Milestone 4)

### 4.1 — "What Does This Unlock?" (Spawn Children)

User clicks green/yellow node → action menu → "What does this unlock?"

1. State machine fetches `buildsTowardsChildren` for the node
2. Ranks by importance (how many other visible nodes depend on them)
3. Spawns top 3 at tier -1 (200px above), in their respective lanes
4. Shows "+N more" badge if >3 children exist
5. Draws `buildsTowards` arrows from parent to children

**Spawn positioning:**
```ts
function spawnPosition(parentNode, childKgNode, laneXPositions, tier) {
  const lane = getLaneForNode(childKgNode.id, grade);
  const x = laneXPositions[lane];
  const y = parentNode.y - (200 * tier);
  // Offset within lane if multiple children share it
  return { x: x + (laneOffset * 120), y };
}
```

### 4.2 — "What Leads to This?" (Spawn Prerequisites)

User clicks red/yellow node → action menu → "What leads to this?"

Same logic but uses `buildsTowardsParents`, places at tier +1 (200px below), spawns as gray (unexplored).

### 4.3 — Progressive Disclosure

"+N more" badge: small pill on the node that triggered the spawn. Clicking it spawns the next batch (up to 3 more). Badge updates count or disappears when exhausted.

### 4.4 — Edge Drawing

When spawning, also draw arrows for any `buildsTowards` edges among all currently visible nodes (not just the new ones). Call `getEdgesAmong(visibleNodeIds)` and create lines for any edges not already on the board.

### 4.5 — Auto-Pan

After spawning nodes, if any are outside the viewport, smoothly pan to center the midpoint between the trigger node and the new nodes.

> **DECISION NEEDED: Animate or instant?**
>
> Animate (300ms ease-out) looks polished for demo. Instant is simpler. Leaning animate.

**Demo milestone 4 checkpoint:** Master a node → click "What does this unlock?" → 2-3 new gray nodes appear above with arrows → click one of those → quiz → master → expand further. The learning map grows organically.

---

## Sprint 5: Polish + Firebase Persistence

### 5.1 — Firebase Explorer State

**New:** Firestore subcollection `boards/{boardId}/explorerState`

```ts
interface PersistedExplorerState {
  grade: string;
  stateMachineState: string;
  kgNodeMap: Record<string, string>;  // kgNodeId → boardObjectId
  askedQuestions: Array<{ kgNodeId: string; questionHash: string }>;
  conversationHistory: AgentMessage[];
}
```

Save on every state transition. Load on page refresh / board reopen.

Node confidence is already persisted via Yjs/BoardObject — no duplication needed there.

### 5.2 — Clear Conversation Flow

"Clear" button in chat header → confirmation dialog → reset explorer state in Firebase + clear all kg-nodes from board + return to `CHOOSE_GRADE`.

### 5.3 — Locked Interaction Polish

During `QUIZ_IN_PROGRESS`:
- Clicking another node shows tooltip: "Finish your current quiz first!"
- Cancel button in chat pulses subtly (CSS animation) so student knows they can exit
- Cancel → state returns to `IDLE`, quiz question stays in chat as "cancelled"

### 5.4 — Grade Re-Selection

"Change grade" button in chat header → confirmation dialog ("This will clear your current map") → clear board + Firebase → `CHOOSE_GRADE`.

### 5.5 — Visual Polish

- Node spawn animation: fade in + slide from parent position (300ms)
- Edge draw animation: line traces from source to target (200ms)
- Confidence color transition: smooth color interpolation (200ms)
- Chat messages: typing indicator before quiz question appears

---

## Post-MVP Milestones

### Milestone A: Interactive Lessons
- State: `INTERACTIVE_LESSON`
- Chat-based back-and-forth with LLM on a specific standard
- Uses components as lesson outline
- "End lesson" button or click-away to exit

### Milestone B: Free-Response Visual
- `QuizFormat = 'fr-visual'`
- Student draws/writes on a canvas area
- Screenshot → multimodal LLM for grading
- Earmarked type in code from Sprint 0

### Milestone C: Dagre Auto-Layout
- Wire up existing `src/data/knowledge-graph/layout.ts` (dagre)
- Run on visible subgraph when nodes spawn
- Animate reflow
- Respects lane constraints as soft x-positions

### Milestone D: Band Boundary Visualization
- Horizontal line on canvas at grade transitions
- Nodes above/below use their band's lane order
- Lane labels at top of each column

### Milestone E: Quiz Question Dedup
- Store asked question hashes in Firebase
- Pass to quiz generator as exclusion list
- Rotate through components

### Milestone F: Per-User Confidence Overlays (Multiplayer)
- Each user has their own confidence map
- Shared board shows intersection/union of knowledge

---

## Files to Create / Modify

### New Files
| File | Sprint | Purpose |
|------|--------|---------|
| `src/data/knowledge-graph-v2/index.ts` | 0.1 | v2 graph store with typed exports |
| `src/agent/explorerStateMachine.ts` | 0.2 | State machine: types, transitions, side effects |
| `src/agent/quizTypes.ts` | 0.3 | QuizData, QuizResult, QuizFormat types |
| `src/agent/explorerSpawn.ts` | 1.2 | Deterministic anchor + on-demand spawn logic |
| `src/agent/quizGenerator.ts` | 3.1 | LLM-backed quiz generation |
| `src/components/NodeActionMenu.tsx` | 2.2 | Floating context-sensitive action menu |
| `src/hooks/useExplorerStateMachine.ts` | 0.2 | React hook wrapping state machine + side effect execution |
| `src/contexts/ExplorerContext.tsx` | 2.1 | Context providing state machine dispatch to Canvas + Chat |

### Modified Files
| File | Sprint | Change |
|------|--------|--------|
| `src/components/Canvas.tsx` | 2.1 | Add kg-node click → `onExplorerNodeAction` dispatch |
| `src/components/ChatWidget.tsx` | 1.1, 3.2 | Grade buttons, quiz display, state-aware rendering |
| `src/components/shapes/KnowledgeNodeShape.tsx` | 4.3 | "+N more" badge rendering |
| `src/types/board.ts` | — | May need minor additions (unlikely) |
| `src/agent/useAgent.ts` | 2.1 | Explorer mode delegates to state machine instead of pipeline |
| `src/agent/apiClient.ts` | 3.1 | Possibly add Sonnet option for FR grading |

### Untouched (Boardie path preserved)
- `src/agent/pipeline.ts` — Boardie mode continues to use the LLM-driven pipeline
- `src/agent/systemPrompt.ts` — Boardie's system prompt
- `src/agent/executor.ts` — Boardie's tool execution
- `src/agent/tools.ts` — Boardie's tool definitions
- `src/data/knowledge-graph/` — Old KG data (Boardie may reference)

---

## Resolved Design Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | State machine style | **Plain function + hook wrapper.** Pure `transition(state, event) → newState` function (no React), thin `useExplorerStateMachine` hook for React glue. Maximizes testability — transitions are unit-testable with zero React setup. |
| 2 | Grade selection UI | **Chat buttons for MVP.** Grid of grade buttons as first chat message. Designed for upgrade — can swap for canvas overlay post-MVP without touching state machine (same `SELECT_GRADE` event). Must be easy to debug/tweak. |
| 3 | Node visual language | **Confidence fill + small lane dot.** Node fill = confidence color (gray/green/yellow/red). Small colored dot in corner for lane identity (blue=number, purple=algebra, etc.). No lane columns on canvas — lanes guide spawn placement and vertical grouping but impose nothing rigid. Nodes float freely after spawn. |
| 4 | Explorer bridge | **ExplorerContext (React Context).** `<ExplorerProvider>` wraps Canvas + Chat. Canvas calls `useExplorer().dispatch(...)`, Chat reads `useExplorer().state`. Standard React pattern, type-safe, visible in DevTools. |
| 5 | Action menu | **HTML overlay.** Positioned via CSS transform from node screen coords, styled with Tailwind, z-indexed above Konva canvas. |
| 6 | Quiz format logic | **Auto-pick + "Challenge me!" override.** Auto-select MC vs FR based on grade + standard complexity. Student can click "Challenge me!" to force FR. |
| 7 | Confidence transitions | See confidence transition table below. |
| 8 | Spawn auto-pan | **Animate.** Smooth pan to keep spawned nodes visible. Revocable — switch to instant if it feels janky. |

### Confidence Transition Table (Decision 7)

| Current Color | Quiz Result | New Color | Rationale |
|---------------|-------------|-----------|-----------|
| Gray (unexplored) | Correct (any) | **Green** | First assessment positive |
| Gray | Incorrect | **Red** | First assessment negative |
| Red (gap) | Correct MC | **Yellow** | MC is easier — one more rep needed |
| Red | Correct FR, LLM confidence < 0.8 | **Yellow** | Partial understanding shown |
| Red | Correct FR, LLM confidence ≥ 0.8 | **Green** | Genuine mastery via free-response |
| Red | Incorrect | **Red** | Stays red |
| Yellow (shaky) | Correct (any) | **Green** | Confirmed understanding |
| Yellow | Incorrect | **Red** | Regression |
| Green (mastered) | Incorrect (quiz me again) | **Yellow** | Graceful demotion, not full reset |
| Green | Correct | **Green** | Stays green |
