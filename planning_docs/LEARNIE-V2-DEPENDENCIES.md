# Learnie v2 — Dependency Graph & Sprint Evaluation

## Dependency DAG

```
                    ┌─────────────────────────┐
                    │  0.1 KG Index Module     │  ← No dependencies
                    │  (knowledge-graph-v2/    │
                    │   index.ts)              │
                    └─────┬───────────────┬────┘
                          │               │
              ┌───────────▼──┐     ┌──────▼───────────┐
              │ 0.2 State    │     │ 0.3 Quiz Types   │  ← No deps on each other
              │ Machine Core │     │ (quizTypes.ts)   │
              │ (pure fn +   │     └──────┬───────────┘
              │  types)      │            │
              └──┬───┬───────┘            │
                 │   │                    │
     ┌───────────▼┐  │         ┌──────────▼──────────┐
     │ 1.1 Grade  │  │         │ 1.2 Anchor Spawn    │  ← Needs 0.1 + 0.2
     │ Selection  │  │         │ (explorerSpawn.ts)  │
     │ (chat UI)  │  │         └──────────┬──────────┘
     └─────┬──────┘  │                    │
           │         │                    │
           │    ┌────▼────────────────────▼──┐
           │    │ 2.1 ExplorerContext +       │  ← Needs 0.2 + 1.2
           │    │     Canvas bridge           │
           │    └────┬───────────────────────┘
           │         │
     ┌─────▼─────────▼──┐    ┌────────────────────┐
     │ 2.2 Action Menu   │    │ 2.3 "Don't Know"  │  ← Both need 2.1
     │ (NodeActionMenu)  │    │ flow               │
     └────────┬──────────┘    └───────┬────────────┘
              │                       │
              ▼                       │
     ┌────────────────────────────────▼──┐
     │ 3.1 Quiz Generator (LLM)         │  ← Needs 0.3 + 2.2
     │ 3.2 Quiz Display in Chat          │
     │ 3.3 Quiz Grading (MC + FR)        │
     │ 3.4 Confidence Transitions        │
     └────────────────┬─────────────────┘
                      │
         ┌────────────▼──────────────┐
         │ 4.1 Spawn Children        │
         │ 4.2 Spawn Prerequisites   │  ← All need Sprint 3 done
         │ 4.3 Progressive Disclosure│
         │ 4.4 Edge Drawing          │
         │ 4.5 Auto-Pan              │
         └────────────┬──────────────┘
                      │
         ┌────────────▼──────────────┐
         │ 5.1 Firebase Persistence  │
         │ 5.2 Clear Flow            │
         │ 5.3 Locked Interaction    │  ← All need Sprint 4 done
         │ 5.4 Grade Re-Selection    │
         │ 5.5 Visual Polish         │
         └───────────────────────────┘
```

---

## Parallelization Map

### Sprint 0 — Three parallel worktrees

| Worktree | Task | Files Created | Interface Contract |
|----------|------|---------------|--------------------|
| **W-0A** | 0.1 KG Index Module | `src/data/knowledge-graph-v2/index.ts` | Exports: `graphStore`, `getNode`, `getChildren`, `getParents`, `getRelated`, `getComponents`, `getGradeConfig`, `getEdgesAmong`, `getLaneForNode` |
| **W-0B** | 0.2 State Machine Core | `src/agent/explorerStateMachine.ts`, `src/hooks/useExplorerStateMachine.ts` | Exports: `ExplorerState`, `ExplorerEvent`, `SideEffect`, `Confidence`, `transition()`. Hook deferred to Sprint 2 (needs context wiring). |
| **W-0C** | 0.3 Quiz Types | `src/agent/quizTypes.ts` | Exports: `QuizFormat`, `QuizData`, `QuizResult` |

**Why parallel:** W-0B and W-0C need to agree on types (`QuizData`, `QuizResult`, `Confidence`) but don't import each other's code. Define the shared types in W-0C (quizTypes.ts), and W-0B imports from it. Since W-0C is small, it can land first or W-0B can code against the agreed interface.

**Merge order:** W-0C first → W-0A → W-0B (W-0B may reference `StandardNode` type from W-0A).

---

### Sprint 1 — Two parallel worktrees (after Sprint 0 merges)

| Worktree | Task | Files Created/Modified | Depends On |
|----------|------|------------------------|------------|
| **W-1A** | 1.1 Grade Selection UI | `ChatWidget.tsx` (modify) | 0.2 (dispatches `SELECT_GRADE`) |
| **W-1B** | 1.2 Anchor Spawn + 1.3 Welcome Message | `src/agent/explorerSpawn.ts` | 0.1 (reads spawn config), 0.2 (receives `SPAWN_ANCHORS` effect) |

**Why parallel:** Grade selection UI is pure chat rendering — it fires an event. Anchor spawn is pure positioning logic — it consumes an event. They touch different files and communicate only through the state machine event type (already defined in Sprint 0).

**Merge order:** Either first. Integration tested together.

---

### Sprint 2 — Three parallel worktrees (after Sprint 1 merges)

| Worktree | Task | Files Created/Modified | Depends On |
|----------|------|------------------------|------------|
| **W-2A** | 2.1 ExplorerContext + Canvas bridge | `src/contexts/ExplorerContext.tsx`, `Canvas.tsx`, `useAgent.ts` | 0.2, 1.2 |
| **W-2B** | 2.2 NodeActionMenu component | `src/components/NodeActionMenu.tsx` | 0.2 (reads node confidence for menu options) |
| **W-2C** | 2.3 "Don't Know" flow | State machine additions + chat template | 0.2 |

**Why parallel:** The action menu (W-2B) is a self-contained UI component — it receives a node's position + confidence and renders buttons. The context bridge (W-2A) wires everything together. The "don't know" flow (W-2C) is a state machine transition + chat message. They converge at integration.

**Merge order:** W-2A first (provides the context), then W-2B + W-2C.

---

### Sprint 3 — Two parallel worktrees (after Sprint 2 merges)

| Worktree | Task | Files Created/Modified | Depends On |
|----------|------|------------------------|------------|
| **W-3A** | 3.1 Quiz Generator + 3.3 Grading | `src/agent/quizGenerator.ts`, `apiClient.ts` | 0.1, 0.3 |
| **W-3B** | 3.2 Quiz Display + 3.4 Confidence Transitions | `ChatWidget.tsx`, state machine additions | 0.2, 0.3, 2.1 |

**Why parallel:** Quiz generation/grading (W-3A) is backend-facing — LLM prompts, API calls, response parsing. Quiz display + confidence updates (W-3B) is frontend-facing — rendering questions in chat, updating node colors. They share the `QuizData`/`QuizResult` types (defined in Sprint 0) but don't touch the same files.

**Merge order:** Either first. W-3B can mock quiz data during development.

---

### Sprint 4 — Two parallel worktrees (after Sprint 3 merges)

| Worktree | Task | Files Created/Modified | Depends On |
|----------|------|------------------------|------------|
| **W-4A** | 4.1 Spawn Children + 4.2 Spawn Prereqs + 4.3 Progressive Disclosure | `explorerSpawn.ts` (extend), `KnowledgeNodeShape.tsx` | 0.1, 1.2, 2.1 |
| **W-4B** | 4.4 Edge Drawing + 4.5 Auto-Pan | `Canvas.tsx`, new edge utils | 0.1, 2.1 |

**Why parallel:** Node spawning logic (where to place, how many, "+N more" badge) is separate from edge drawing (which edges exist among visible nodes) and viewport panning. They touch different parts of the canvas.

**Merge order:** W-4A first (spawns the nodes that W-4B draws edges for), then W-4B.

---

### Sprint 5 — Three parallel worktrees (after Sprint 4 merges)

| Worktree | Task | Files Created/Modified | Depends On |
|----------|------|------------------------|------------|
| **W-5A** | 5.1 Firebase Persistence + 5.2 Clear Flow | New Firebase subcollection, state save/load | All prior |
| **W-5B** | 5.3 Locked Interaction + 5.4 Grade Re-Selection | State machine guards, chat UI | 2.1, 3.x |
| **W-5C** | 5.5 Visual Polish (animations) | CSS/Konva transitions | All prior |

**Why parallel:** Firebase persistence is infrastructure. Locked interaction is state machine guards. Visual polish is CSS/animation. No file overlap.

**Merge order:** Any order. All are additive.

---

## Sprint Evaluation Criteria

### Sprint 0: Foundation
**Gate: All unit tests pass, no integration needed yet.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | `graphStore` loads all 406 nodes, 1,041 edges, 1,449 components | Unit test: `expect(graphStore.nodes.size).toBe(406)` |
| 2 | `getChildren` / `getParents` return correct adjacency | Unit test: spot-check 3-4 known edges from cc-math-edges.json |
| 3 | `getGradeConfig("5")` returns 4 anchors with lane assignments | Unit test: verify anchor IDs match spawn config |
| 4 | `getComponents(standardId)` returns sub-skills | Unit test: pick a standard with known component count |
| 5 | `getLaneForNode` returns correct lane for cross-grade nodes | Unit test: node from grade 4 queried in grade 5 context |
| 6 | `transition()` handles full state cycle: `CHOOSE_GRADE → SPAWNING_ANCHORS → IDLE → NODE_MENU_OPEN → QUIZ_LOADING → QUIZ_IN_PROGRESS → QUIZ_RESULT → IDLE` | Unit test: feed event sequence, assert each intermediate state |
| 7 | Invalid transitions return current state unchanged | Unit test: `transition(IDLE, QUIZ_ANSWERED)` → same IDLE state |
| 8 | Side effects returned correctly for each transition | Unit test: `transition(IDLE, NODE_CLICKED).effects` includes expected side effects |
| 9 | `QuizData`, `QuizResult`, `QuizFormat` types compile | TypeScript compilation passes |
| 10 | Existing tests still pass (`npm run test`) | CI green |

**Sprint 0 is PASS if:** All 10 criteria met. Pure logic — no UI, no rendering, no Firebase.

---

### Sprint 1: Grade Selection + Anchor Spawn
**Gate: First visual demo — user sees nodes on canvas.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Chat shows grade selection buttons on explorer session start | Manual: open Learnie, see grade buttons K-8 + HS |
| 2 | Clicking a grade dispatches `SELECT_GRADE` and transitions to `SPAWNING_ANCHORS` | Unit test on transition + manual verification |
| 3 | Anchor nodes appear on canvas in correct lane positions | Manual: Grade 5 → 4 nodes spread horizontally |
| 4 | `buildsTowards` arrows drawn between anchors | Manual: visible arrows between anchor pairs |
| 5 | Vertical offset applied for `buildsTowards` anchor pairs | Manual: parent anchor slightly above child anchor |
| 6 | Lane dot visible on each anchor node (correct color) | Manual: blue dot on Number, purple on Algebra, etc. |
| 7 | Welcome message appears in chat after spawn | Manual: "Welcome! I've placed the key concepts..." |
| 8 | State machine is in `IDLE` after spawn completes | Unit test or console log verification |
| 9 | Existing Boardie mode unaffected | Manual: switch to Boardie, verify normal behavior |
| 10 | `npm run test` passes | CI green |

**Sprint 1 is PASS if:** A user can open Learnie → pick Grade 5 → see 4 anchors with arrows → read a welcome message. Demo milestone 1.

---

### Sprint 2: Node Click + Action Menu
**Gate: Clicking nodes triggers context-sensitive UI.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Clicking a kg-node in IDLE state opens the action menu | Manual: click a gray anchor → menu appears |
| 2 | Menu positioned near the clicked node (not at origin) | Manual: menu floats adjacent to node |
| 3 | Menu options match node's confidence color (per Decision 5 table) | Manual: gray node shows "Quiz me!" + "I don't know this" |
| 4 | Menu dismisses on click-away or Escape | Manual: click empty canvas → menu closes |
| 5 | "I don't know this" → node turns red immediately | Manual: click action → node fill becomes red |
| 6 | Encouraging chat message after "I don't know this" | Manual: see "No worries!" message |
| 7 | State returns to IDLE after action completes | Unit test on transition |
| 8 | Menu repositions correctly after pan/zoom | Manual: open menu → zoom → menu tracks node |
| 9 | ExplorerContext provides state + dispatch to both Canvas and Chat | Unit test or DevTools inspection |
| 10 | `npm run test` passes | CI green |

**Sprint 2 is PASS if:** Click a node → see action menu → click "I don't know this" → node turns red → chat encourages. Demo milestone 2.

---

### Sprint 3: Quiz Flow
**Gate: Full quiz loop works end-to-end.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | "Quiz me!" generates an MC question (Haiku API call succeeds) | Manual: click "Quiz me!" on gray node → question appears |
| 2 | MC question shows 3-4 lettered options as clickable buttons | Manual: see A/B/C/D buttons |
| 3 | Correct MC answer → node turns green (from gray) | Manual: pick right answer → green fill |
| 4 | Incorrect MC answer → node turns red (from gray) | Manual: pick wrong answer → red fill |
| 5 | "Challenge me!" forces FR format with text input | Manual: click "Challenge me!" → text box appears |
| 6 | FR answer graded by LLM (Sonnet call succeeds) | Manual: type answer → get feedback |
| 7 | Confidence transitions match the resolved table (Decision 7) | Unit tests: all 10 rows of the confidence table |
| 8 | Red + correct FR (high confidence) → green | Unit test + manual |
| 9 | Green + incorrect → yellow (not red) | Unit test + manual |
| 10 | Encouraging feedback message after every quiz result | Manual: see warm message for correct/incorrect/partial |
| 11 | Quiz loading state shows skeleton/spinner | Manual: brief loading indicator before question |
| 12 | `npm run test` passes | CI green |

**Sprint 3 is PASS if:** Full quiz cycle works — click node → quiz → answer → confidence updates → feedback. Both MC and FR paths. Demo milestone 3.

---

### Sprint 4: Spawn on Demand
**Gate: Knowledge map grows organically through interaction.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Green node → "What does this unlock?" → spawns ≤3 child nodes | Manual: master a node → expand → see children |
| 2 | Children positioned above parent, in correct lane x-positions | Manual: children spread by lane |
| 3 | Red/yellow node → "What leads to this?" → spawns ≤3 prereqs | Manual: struggle → expand → see prerequisites |
| 4 | Prerequisites positioned below the node | Manual: prereqs appear below |
| 5 | "+N more" badge shows when >3 children/prereqs exist | Manual: check a node with 4+ connections |
| 6 | Clicking "+N more" spawns next batch | Manual: badge click → more nodes |
| 7 | `buildsTowards` arrows drawn for ALL visible node pairs (not just new) | Manual: spawn a child that connects to an existing node → arrow appears |
| 8 | Auto-pan keeps new nodes in viewport | Manual: spawn nodes near edge → canvas pans smoothly |
| 9 | Spawned nodes are interactive (can click → menu → quiz) | Manual: quiz a freshly spawned child node |
| 10 | Cross-grade spawning works (Grade 5 node spawns Grade 6 prereq) | Manual: expand a boundary node |
| 11 | `npm run test` passes | CI green |

**Sprint 4 is PASS if:** Master a node → expand → quiz children → expand further. 10-15 node interactions produce a coherent, growing knowledge map. Demo milestone 4.

---

### Sprint 5: Polish + Persistence
**Gate: Production-ready. Session survives refresh.**

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | Refresh page → explorer state restored (grade, nodes, confidence) | Manual: refresh → same map |
| 2 | "Clear" button resets everything → back to grade selection | Manual: clear → fresh start |
| 3 | Clicking nodes during quiz shows "Finish your quiz first!" tooltip | Manual: mid-quiz, click another node |
| 4 | Cancel button pulses during quiz, works to exit | Manual: cancel mid-quiz → IDLE |
| 5 | "Change grade" clears board and returns to grade selection | Manual: change grade → fresh spawn |
| 6 | Node spawn animation (fade in + slide) | Manual: visual smoothness |
| 7 | Edge draw animation (line traces) | Manual: visual smoothness |
| 8 | Confidence color transitions are animated (not instant swap) | Manual: smooth color change |
| 9 | All existing Boardie tests pass | `npm run test` |
| 10 | Full demo flow: grade select → quiz 3 nodes → expand → quiz children → refresh → state intact | Manual end-to-end |

**Sprint 5 is PASS if:** The full demo flow runs smoothly, survives refresh, and looks polished. Ship-ready.

---

## Summary: Max Parallel Agents Per Sprint

| Sprint | Parallel Worktrees | Constraint |
|--------|-------------------|------------|
| 0 | **3** (W-0A, W-0B, W-0C) | W-0C merges first (types), then A, then B |
| 1 | **2** (W-1A, W-1B) | Independent, integration test after both merge |
| 2 | **3** (W-2A, W-2B, W-2C) | W-2A merges first (context), then B+C |
| 3 | **2** (W-3A, W-3B) | Independent, W-3B can mock quiz data |
| 4 | **2** (W-4A, W-4B) | W-4A merges first (nodes exist for edges) |
| 5 | **3** (W-5A, W-5B, W-5C) | All independent |

**Total: 15 worktree tasks across 6 sprints, max 3 agents in parallel at any point.**
