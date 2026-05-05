# Learnie v2 — Design Decisions

This document captures architectural and pedagogical decisions made for the Learnie v2 redesign. Each decision includes the rationale and alternatives weighed.

## 1. Student-Driven Exploration (No Auto-Spawning)

**Decision:** When a node turns green (mastered) or red (gap), the system does NOT automatically spawn children/prerequisites. The student must explicitly choose to expand by clicking the node and selecting an action.

**Learning Science Rationale:**

| Framework | Implication |
|-----------|-------------|
| **Self-Determination Theory** (Deci & Ryan) | Autonomy is the strongest predictor of intrinsic motivation. Student chooses what to explore and when. |
| **Cognitive Load Theory** (Sweller) | Auto-spawning 3-8 nodes per interaction creates extraneous load. Student-driven keeps the canvas quiet until they're ready. |
| **Self-Regulated Learning** (Zimmerman) | Forcing students to decide "show me prerequisites" vs "quiz me again" trains metacognitive monitoring — a long-term skill benefit. |
| **Zone of Proximal Development** (Vygotsky) | Student gravitates toward their own ZPD naturally. Auto-spawn may push content outside the zone. |
| **Desirable Difficulty** (Bjork) | Actively choosing what to explore adds productive friction that enhances learning. |

**Risk: Avoidance Behavior.** Students may avoid clicking red nodes. Mitigation: gentle chat nudges after N interactions without exploring prerequisites. Never auto-spawn, but make the "What leads to this?" action visually inviting (pulsing badge, warm prompt).

**Alternatives considered:**
- Auto-spawn prerequisites on gap (v1 behavior) — rejected for cognitive overload
- Auto-spawn only 1 prerequisite — rejected as arbitrary and still removes autonomy

## 2. State Machine Over LLM-Driven Flow

**Decision:** Replace the current LLM-driven agent loop with an explicit state machine. The LLM's role shrinks to quiz question generation and free-response grading only.

**Rationale:**
- Current flow relies on the LLM following system prompt instructions — no enforcement of valid transitions
- Deterministic flow is faster (no multi-turn KG queries via LLM)
- Easier to test, debug, and reason about
- Quiz generation is the only task that genuinely needs LLM creativity

**States:** `CHOOSE_GRADE → SPAWNING_ANCHORS → IDLE → QUIZ_IN_PROGRESS → QUIZ_RESULT → IDLE` (plus INTERACTIVE_LESSON post-MVP)

## 3. Single Lane Order Per Session

**Decision:** All nodes on the board use the selected grade's lane order, regardless of which grade they came from. No band-transition lane reordering mid-session.

**Rationale:** Keeps spatial relationships stable. A Grade 6 algebra child of a Grade 5 algebra anchor stays in the same vertical column. The "correct" Grade 6 lane order (data-number-algebra-geometry) would cause horizontal jumps that break visual continuity.

**Post-MVP:** Band boundary visualization with lane-order switching at the boundary line.

## 4. Anchor Vertical Offset for Cross-Lane Dependencies

**Decision:** When two anchor nodes have a `buildsTowards` edge between them, the parent is offset -30px and the child +30px from the lane baseline, creating a subtle visual hierarchy.

**Applies to:** Grades K (number→data), 3 (number→geometry), 6 (number→algebra), 7 (algebra→data). Other grades have only `relatesTo` between anchors (no offset needed).

## 5. Context-Sensitive Action Menu

**Decision:** Clicking a kg-node shows a floating action menu whose options depend on the node's current confidence color.

| Color | Actions |
|-------|---------|
| Gray (unexplored) | "Quiz me!", "I don't know this" |
| Green (mastered) | "Quiz me again!", "What does this unlock?" |
| Yellow (shaky) | "Quiz me again!", "Interactive lesson"*, "What leads to this?", "What does this unlock?" |
| Red (gap) | "Quiz me!", "Interactive lesson"*, "What leads to this?" |

*Interactive lesson deferred to post-MVP sprint.

## 6. Progressive Disclosure for Spawning

**Decision:** When expanding prerequisites or children, spawn max 3 nodes per interaction. Show "+N more" badge for remainder, expandable on click.

**Rationale:** Grades 4-6 have anchors with 4-8 cross-grade children. Spawning all at once is visually overwhelming. Cap at 3 keeps the canvas clean while preserving access.

## 7. Quiz Format Selection

**Decision:** Two quiz formats — multiple-choice (MC) and free-response text (FR). Format chosen by combining standard sophistication and grade level.

- MC: deterministic grading (index comparison), instant feedback, no LLM for grading
- FR: LLM-evaluated, 2-5s latency, richer signal

Lower grades default to higher MC ratio. Higher-sophistication standards lean toward FR. User can override.

**Post-MVP:** `free-response-visual` format (drawing-based answers). Earmarked as a type in the code (`QuizFormat = 'mc' | 'fr-text' | 'fr-visual'`) with fallback to MC for MVP.

## 8. Conversation Persistence via Firebase

**Decision:** Explorer state persisted in Firebase subcollection per board.

```
boards/{boardId}/explorerState
  - grade: string
  - conversationHistory: AgentMessage[]
  - stateMachineState: string
  - askedQuestions: [{ kgNodeId, questionHash }]
```

Node confidence is already persisted on BoardObject via Yjs (`kgConfidence` field). `explorerState` is session/quiz truth; board objects are visual truth.

## 9. Single Explorer Per Board (Multiplayer)

**Decision:** Explorer mode is single-user per board. Others see the knowledge map but cannot interact with the quiz flow.

**Post-MVP:** Per-user confidence overlays on shared boards.

## 10. Locked Interaction During Quiz

**Decision:** While a quiz is in progress, clicking other nodes shows a brief tooltip ("Finish your current quiz first!") with emphasis on the cancel button so the student doesn't feel trapped.

## 11. "Don't Know This" Is Instant

**Decision:** "I don't know this" sets the node to red immediately with no LLM call. Encouraging chat message, no auto-spawn of prerequisites. Student can re-quiz the red node at any time to attempt promotion.

## 12. relatesTo Edges Are Hidden by Default

**Decision:** Never auto-render `relatesTo` edges. Show on-demand only (hover or "See related" button). Only `buildsTowards` edges render as arrows on the canvas.

**Rationale:** 284 relatesTo edges would clutter the board. They're bidirectional ("see also") without prerequisite semantics — useful context but not structural.

## 13. HS Special Handling

**Decision:** For MVP, HS is limited to anchor spawn + immediate neighborhood only. Full HS exploration (146 nodes across 5 lanes) deferred.

## 14. Components as Quiz Specs

**Decision:** Learning components (sub-skills from `cc-math-components.json`) are passed to the LLM as the specification for generating quiz questions. Each component describes one assessable sub-skill. The LLM selects from available components and generates questions targeting them.

Standards with few components (e.g., 6.SP.B.5 has only 1) may produce less question variety. Supplement with relatesTo neighbor components if needed.

## 15. Confidence Transition Rules

**Decision:** Confidence color transitions depend on quiz format and LLM grading confidence, not just correct/incorrect.

| Current Color | Quiz Result | New Color |
|---------------|-------------|-----------|
| Gray | Correct (any) | Green |
| Gray | Incorrect | Red |
| Red | Correct MC | Yellow |
| Red | Correct FR, LLM confidence < 0.8 | Yellow |
| Red | Correct FR, LLM confidence ≥ 0.8 | Green |
| Red | Incorrect | Red |
| Yellow | Correct (any) | Green |
| Yellow | Incorrect | Red |
| Green | Incorrect (quiz me again) | Yellow |
| Green | Correct | Green |

**Key design choices:**
- **Red → correct MC = yellow, not green.** MC is lower signal — could be a lucky guess. One more rep needed.
- **Red → correct FR with high confidence = green.** Free-response with strong LLM confidence is genuine mastery evidence. Rewards depth.
- **Green → incorrect = yellow, not red.** Graceful demotion. Student already demonstrated mastery once — a single miss shouldn't erase that. They get another chance at yellow.

## 16. Node Visual Language

**Decision:** Confidence fill + small lane dot. No lane columns.

- **Node fill** = confidence color (gray/green/yellow/red). Primary visual signal.
- **Small colored dot** in corner for lane identity (blue=number, purple=algebra, pink=functions, amber=data, emerald=geometry).
- **No rigid lane columns** on canvas. Lanes guide spawn placement and vertical grouping but don't constrain node position. Nodes float freely after spawn.

## 17. Explorer Bridge Architecture

**Decision:** ExplorerContext (React Context).

`<ExplorerProvider>` wraps Canvas + Chat. Canvas dispatches events via `useExplorer().dispatch(...)`, Chat reads state via `useExplorer().state`. Type-safe, visible in React DevTools, avoids prop drilling through deeply nested canvas components.

## 18. State Machine Implementation Style

**Decision:** Pure function + React hook wrapper.

- `transition(state: ExplorerState, event: ExplorerEvent): ExplorerState` — pure function, no React, no side effects. Lives in `explorerStateMachine.ts`.
- `useExplorerStateMachine()` — thin hook that wraps the pure function, manages React state, and executes side effects (LLM calls, node spawning). Lives in `useExplorerStateMachine.ts`.

**Rationale:** Pure transition function is trivially unit-testable (`expect(transition(state, event)).toEqual(...)`) with zero React test setup. Side effects stay in the hook where React lifecycle manages them.
