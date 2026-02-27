# Learning Explorer — Full Redesign Plan

**Status as of 2026-02-26:** Sprint 1 complete. BF-1/BF-2 complete (PR #43, squashed to main). BF-3 complete (branch feature/bf-3-gap-expansion). Sprints 2–4 pending.

---

## Context

The Learning Explorer (Explorer mode) currently places KG nodes on the canvas and asks students to self-assess via chat. It has two problems to fix and a large new paradigm to build:

**Problems fixed in Sprint 1:**
1. **Stall-out bug** (fixed PR 1.1): When the KG multi-turn loop fired a second LLM call, the second response overwrote `toolCalls`. Non-KG calls (e.g. `respondConversationally`) were silently dropped.
2. **Node duplication** (fixed PR 1.2): No deduplication guard — bot could place the same KG topic node multiple times.

**New paradigm:**
- Two modes: **Diagnostic** (map the student's knowledge frontier) and **Gamified** (step-by-step learning with practice problems)
- Self-report → provisional coloring → MC/free-form practice problem validation → final coloring
- Graph expands in real-time: learning targets appear **above** mastered (green) nodes, prerequisites appear **below** shaky (yellow) / unknown (red) nodes
- Session persistence: mastery map + chat history stored in Firestore
- Content safety: deterministic pre-flight filter on all text output (wordlist + readability check, no LLM required)

---

## Design Decisions & Open Questions

### Anchor Node Selection (added Sprint 1)
Pre-compute "middle" nodes per grade (nodes with both prerequisite parents AND dependent children). These are maximally diagnostic — confirming or denying them unlocks the most information. Implemented as `getAnchorNodes(grade, limit)` in `src/data/knowledge-graph/index.ts`.

Pure root nodes (no prerequisites) and pure leaf nodes (no dependents) are ranked lower since they provide less diagnostic signal.

### Cross-Grade Node Handling (DECIDED)
- **Initial canvas:** Place grade-N anchor nodes + 2-3 grade-(N-1) anchor nodes below as prerequisite context, clearly labeled with their grade (e.g., "Grade 4 · Fractions"). Students see the learning ladder without being overwhelmed.
- **Cross-grade expansion:** Reactive — prerequisites from a lower grade only appear after a student identifies a gap. Placed below the flagged node with a grade label. Never apologize for lower-grade content; frame positively.
- Implementation: bot calls `getAnchorNodes(grade)` then `getAnchorNodes(grade-1, 3)` for initial placement.

---

## Sprint 1 — Foundation (COMPLETE)

### PR 1.1 — Fix stall-out ✅
**Branch:** `feature/s1-stall-out-fix`
- Merge non-KG tool calls from previous KG loop iteration into the new set
- Preserve textContent across iterations when follow-up LLM has none

### PR 1.2 — KG node deduplication ✅
**Branch:** `feature/s1-kg-dedup`
- `kgNodeMap: Map<kgNodeId, boardObjectId>` in explorer session
- `placeKnowledgeNode` redirects to `updateNodeConfidence` if node already exists
- Map serialized into system prompt so bot always knows what's on board
- `placeKnowledgeNode` tracked in `createdObjectIds` so map stays in sync

### PR 1.3 — Content safety + anchor nodes + UI rename ✅
**Branch:** `feature/s1-content-safety`
- `src/agent/safety.ts`: wordlist filter + FK readability + URL guard
- `getAnchorNodes(grade, limit)` in KG index — interior-of-graph node selection
- `getAnchorNodes` registered as KG readonly tool
- Prompt updated to use anchor nodes first
- ChatWidget: "Boardie" renamed to "Learnie" (user-facing label only; internal enum stays 'boardie')
- Default mode changed from 'boardie' → 'explorer'
- System prompt updated: agent self-identifies as "Learnie"

### Golden Set Evals ✅
**File:** `tests/evals/golden-sets.test.ts` (12 tests, all passing)
- gs-001/gs-008: stall-out merge logic
- gs-002/gs-002b: deduplication + map recording
- gs-003/gs-003b: kgNodeMap injected into prompt
- gs-004: wordlist filter
- gs-005: URL guard
- gs-006: clean text passes
- gs-007: FK grade-level flag
- gs-009: textContent preservation
- gs-010/gs-010b: safety applied via executor

---

## Sprint 2 — Core Interaction: Self-Report + Practice Loop

**Goal:** Build the green/yellow/red coloring loop with practice problem validation.

### PR 2.1 — Mode selection at session start
**Files:** `src/agent/learningExplorerPrompt.ts`, `src/agent/useAgent.ts`
- First bot message offers two `askClarification` buttons:
  - **"Map my knowledge"** → enters Diagnostic mode
  - **"I know my level, let's go"** → enters Gamified mode
- Mode stored in explorer session state (ref), injected into every subsequent system prompt
- Bot behavior branches based on mode

### PR 2.2 — Diagnostic mode: anchoring + self-report coloring
**Files:** `src/agent/learningExplorerPrompt.ts`, `src/agent/executor.ts`
- After grade-level input, bot places 6-8 anchor nodes one-by-one (real-time, not batched)
- After placement, bot fires `askClarification` with three buttons per node group:
  - "I know these" / "Some are shaky" / "These are new to me"
- On response: immediately color all self-reported nodes (green provisional → yellow → red)
- Provisional green nodes get a subtle border/indicator showing "needs verification"

### PR 2.3 — Practice problem validation loop
**Files:** `src/agent/learningExplorerPrompt.ts`, `src/agent/pipeline.ts`
- New tool: `givePracticeQuestion(kgNodeId, questionText, options[], correctIndex, difficulty)`
  - For provisional greens: medium-difficulty MC (verify self-report)
  - For yellows: easy MC (probe the shakiness)
  - Reds: no problem — just generate prerequisites below
- Student answers via `askClarification` MC buttons or typed answer
- On correct: confirm green, remove provisional indicator
- On incorrect: downgrade to yellow/red, trigger graph expansion (Sprint 3)
- Loop tracks which nodes still need validation — continues until all provisional nodes resolved

---

## Sprint 2.5 — Canvas-Native Assessment: Right-Click Node Menu

**Goal:** Let students interact with the graph directly, not just through chat.

### PR 2.5.1 — KG node context menu
**Files:** `src/components/Canvas/KnowledgeNodeShape.tsx`, new `src/components/Canvas/KGContextMenu.tsx`
- Right-click (or long-press) on any KG node opens a context menu:
  - **"I don't know this"** → marks node red, triggers prerequisite expansion
  - **"I'm iffy"** → sub-menu: "Quiz me" or "Mark yellow and move on"
  - **"I know this — quiz me"** → fires MC practice question
- Menu as floating HTML overlay positioned at node

### PR 2.5.2 — Canvas → agent dispatch
**Files:** `src/agent/useAgent.ts`
- New function: `assessNode(boardObjectId, kgNodeId, intent: 'unknown' | 'shaky' | 'quiz')`
- Injects synthetic user message into agent pipeline — reuses same practice loop

---

## Sprint 3 — Graph Intelligence: Expansion + Connections

### PR 3.1 — Graph expansion above/below
- After green confirmed: place dependents above (+Y -200)
- After red/yellow: place prerequisites below (+Y +200)
- Deduplication guard prevents duplicate nodes for shared prerequisites

### PR 3.2 — Visual layering: real-time reveal
- Nodes "fade in" with scale animation on mount
- Edge draw animation (stroke-dasharray)
- Smooth color transitions on confidence update

---

## Sprint 4 — Gamified Mode + Persistence

### PR 4.1 — Gamified mode: focused learning loop
- Bot picks ONE frontier node (all prerequisites green)
- 3-question mini-loop per topic
- 3/3 → mastered; <3/3 → yellow + prerequisites surfaced

### PR 4.2 — Mastery trail
- Mastered nodes collapse to compact "trail pill" (small green rectangle)
- Right-click trail pill to expand

### PR 4.3 — Session persistence
- Firestore: `boards/{boardId}/kgSessions/{userId}`
- Stores: `{ kgNodeMap: {kgNodeId: confidence}, mode, gradeLevel, chatHistory[], lastUpdated }`
- Debounced 2s writes; fail silently on Firestore errors

---

## Parental Controls (hook stubs — no UI yet)

**Branch:** `feature/parental-controls-schema`
- Firestore schema: `users/{uid}/parentControls: { isStudent, parentUid, locked, allowedBoardIds }`
- Firestore rule: if `locked === true`, all board writes rejected
- Hook: `useParentalControls()` — exposes `isLocked`
- `BoardLayout`: if `isLocked`, render `<LockedScreen>`

---

## CI/CD Flow

Each PR:
1. `feature/<sprint>-<short-description>` branch off `main`
2. Atomic commits with "why" messages
3. `npm run test` before pushing
4. PR → review → merge
5. Sprint close: all unit tests pass + manual smoke test

---

## Evals Strategy

### Stage 1 — Golden Sets (zero API cost, run after every commit)
**File:** `tests/evals/golden-sets.test.ts` — 12 tests implemented ✅

### Stage 2 — Labeled Scenarios (run at each PR merge)
**File:** `tests/evals/labeled-scenarios.test.ts` — to be implemented in Sprint 2

Categories:
- `self_report` × `knows_everything / knows_nothing / mixed`
- `practice_loop` × `correct / incorrect / skip`
- `graph_expansion` × `above_green / below_red / below_yellow`
- `deduplication` × `same_node_twice / shared_prereq`
- `mode_switch` × `diagnostic_to_gamified / gamified_resets`
- `edge_cases` × `unknown_grade / kg_node_not_found / empty_board`

### Stage 3 — Playwright Conversation Flow Tests (earmarked — not yet implemented)

**Goal:** Run the real app locally with a real (or seeded) LLM, drive a scripted multi-turn conversation with Learnie, and assert that the board state ends up correct.

**When to implement:** Once we have 2-3 stable conversation flows we're happy with — i.e. we know exactly what Learnie *should* say and do step-by-step. These tests are expensive (real LLM calls + browser automation) so they run on-demand, not on every commit.

**Proposed test file:** `tests/playwright/learnie-flows.test.ts`

**Hooks needed before writing tests:**
- A `window.__boardState` bridge (similar to `window.__perfBridge`) that exposes the current board objects, kgNodeMap, and explorerMode to Playwright
- A `VITE_LEARNIE_SCRIPT_MODE=true` env flag that intercepts `callAnthropic` and replays a pre-recorded response sequence instead of hitting the real API — so tests are deterministic and free
- Alternatively: record a real session's LLM responses as fixtures, replay them in CI

**Conversation scenarios to cover (fill in scripts once flows are stable):**

| ID | Scenario | Chat script | Board assertions |
|----|----------|-------------|-----------------|
| `flow-01` | Grade 5 diagnostic, all nodes mastered | TBD | All grade-5 anchors placed; arrows connect grade-4 → grade-5; all nodes green |
| `flow-02` | Grade 5 diagnostic, mixed confidence | TBD | Provisional nodes light-green; gap nodes red; prereqs placed below red nodes |
| `flow-03` | Practice question correct → mastered | TBD | Node transitions provisional → mastered (solid green) after correct answer |
| `flow-04` | Practice question incorrect → shaky | TBD | Node transitions provisional → shaky (orange) after wrong answer |
| `flow-05` | Same-batch place + connect (regression for BF-1 fix) | TBD | Arrows present immediately after placement turn; no missing connectors |

**Implementation sketch (for when we're ready):**

```ts
// tests/playwright/learnie-flows.test.ts
test('flow-01: grade 5 diagnostic all mastered', async ({ page }) => {
  await page.goto('http://localhost:3000?testMode=learnie-script');

  // Drive the scripted conversation
  await sendMessage(page, "I'm in 5th grade");
  await page.getByText('Map my knowledge').click();
  await page.getByText('I know these!').click();

  // Assert board state via the bridge
  const board = await page.evaluate(() => window.__boardState());
  const nodes = board.objects.filter(o => o.type === 'kg-node');
  const arrows = board.objects.filter(o => o.type === 'line' && o.arrowEnd);

  expect(nodes.length).toBeGreaterThanOrEqual(6);
  expect(arrows.length).toBeGreaterThanOrEqual(2); // at least grade-4 → grade-5 links
  expect(nodes.every(n => n.kgConfidence === 'mastered')).toBe(true);
});
```

---

## Error Handling Standard

Every tool call implementation must:
- Wrap async ops in `try/catch` with specific error messages
- Return `{ success: false, error: string }` on failure — never throw
- On KG data miss: log + surface graceful fallback to student
- On Firestore failure: fail silently with console.warn
- On practice problem failure: retry once, then offer to skip

---

## Key Files

| File | Sprints |
|------|---------|
| `src/agent/pipeline.ts` | 1.1, 1.3, 2.3 |
| `src/agent/executor.ts` | 1.2, 2.3, 3.1 |
| `src/agent/learningExplorerPrompt.ts` | 1.2, 2.1, 2.2, 2.3, 3.1, 4.1 |
| `src/agent/useAgent.ts` | 1.2, 2.1 |
| `src/agent/safety.ts` (new) | 1.3 ✅ |
| `src/data/knowledge-graph/index.ts` | 1.3 (getAnchorNodes) ✅ |
| `src/components/ChatWidget.tsx` | 1.3 (rename) ✅ |
| `src/components/Canvas/KnowledgeNodeShape.tsx` | 3.2, 4.2 |
| `src/components/Canvas/KGContextMenu.tsx` (new) | 2.5.1 |
| `src/services/kgSessionService.ts` (new) | 4.3 |

---

## Open Design Questions (need product decision)

1. **Initial anchor node count:** Currently 6-8 for grade N + 2-3 from grade N-1. Should this be adaptive based on how connected the grade's KG is?

2. **Gamified mode difficulty curve:** Should the 3-question mini-loop always use the same difficulty, or escalate (easy → medium → hard)?

3. **Mastery trail visual:** Collapsed vs. expanded view — should collapsed pills show the topic code only, or topic code + subject area icon?

## Context Management (between sprints)
- Between sprint sessions: compact aggressively. Clear conversation history and session objects. Only persist the kgNodeMap and final confidence states in Firestore.
- Context window budget: keep codebase docs loaded by topic, not all at once. Consult `.claude/context/` docs before reading source files.
- Refer to this doc (`LEARNING-EXPLORER-REDESIGN.md`) for full plan context rather than re-reading source files when starting a new sprint.
