# Learning Explorer — UX Flow Improvements

## Context

The Learning Explorer is merged but the conversation flow is passive: the LLM places nodes, asks the student to self-assess, and updates colors. Three UX problems:

1. **No quiz interaction** — Student self-reports confidence instead of being tested with actual questions
2. **No connectors drawn** — Nodes are placed without showing prerequisite relationships
3. **No strategic traversal** — LLM dumps 5-10 nodes at once instead of navigating the graph intelligently (binary-search style)

**Goal:** Make the Explorer actively quiz students, show relationships via connectors, and use a binary-search strategy through the dependency graph to efficiently find the student's learning frontier.

---

## Change 1: Add `getMiddleNodes()` graph utility

**File:** `src/data/knowledge-graph/index.ts`

Add a new exported function that finds nodes in the "middle" of the graph for a given grade — nodes that have both prerequisites AND dependents. These are ideal binary-search starting points.

```ts
export function getMiddleNodes(grade?: string, limit = 5): KGNode[]
```

Logic: filter nodes that have `parentsMap[id].length > 0 && childrenMap[id].length > 0`, optionally by grade, sort by total connections (most connected = most informative to test), return top N.

**Test:** Add 1-2 tests in `__tests__/index.test.ts`.

---

## Change 2: Rewrite Explorer system prompt

**File:** `src/agent/learningExplorerPrompt.ts`

Replace the current passive flow with an active quiz-based flow:

### New conversation flow:
1. **Greet** → ask grade level
2. **Find starting point** → call `getMiddleNodes` or `searchKnowledgeGraph` for that grade to find a mid-level concept
3. **Place 2-3 nodes** (the target concept + 1 prerequisite + 1 dependent), **draw connectors** between them with `connectKnowledgeNodes`
4. **Quiz the student** → ask a simple, age-appropriate question about the middle concept (not "are you confident?" but an actual math question)
5. **Evaluate response:**
   - Correct → `updateNodeConfidence(mastered/green)` → move DOWN the graph (ask about a dependent concept)
   - Partially correct / unsure → `updateNodeConfidence(shaky/orange)` → probe further or try a related concept
   - Incorrect → `updateNodeConfidence(gap/red)` → move UP the graph (ask about a prerequisite)
6. **Expand incrementally** → place new node + connector, quiz on that, repeat
7. **Converge** → after 4-6 questions, compute frontier and summarize what they know vs. what to learn next

### Key prompt directives:
- **Always draw connectors** when placing related nodes — every placed node should be connected to its prerequisite/dependent if both are on the canvas
- **Never dump the whole graph** — start with 2-3 nodes, expand one at a time based on quiz results
- **Ask real questions**, not self-assessments — "What is 3/4 + 1/2?" not "How confident are you with adding fractions?"
- **Binary search explicitly** — start in the middle; correct answers go deeper, wrong answers go shallower
- **Celebrate and encourage** — keep the warm tutor tone

---

## Change 3: Add `getMiddleNodes` tool schema + pipeline handler

**File:** `src/agent/tools.ts` — add `getMiddleNodesSchema` and tool definition in `KG_TOOL_DEFINITIONS` + `KG_READONLY_TOOLS`

**File:** `src/agent/pipeline.ts` — add `getMiddleNodes` case in the KG read-only loop (similar pattern to existing handlers)

---

## Files summary

| File | Change |
|------|--------|
| `src/data/knowledge-graph/index.ts` | Add `getMiddleNodes()` |
| `src/data/knowledge-graph/__tests__/index.test.ts` | Add tests for `getMiddleNodes` |
| `src/agent/learningExplorerPrompt.ts` | Rewrite conversation flow |
| `src/agent/tools.ts` | Add `getMiddleNodes` tool schema |
| `src/agent/pipeline.ts` | Add `getMiddleNodes` handler in KG loop |

---

## Verification

1. `npx vitest run src/data/knowledge-graph/__tests__/index.test.ts` — all tests pass including new ones
2. `npx tsc --noEmit` — compiles clean
3. `npm run build` — production build succeeds
4. Manual QA: open Explorer → "I'm in 5th grade" → should see 2-3 nodes with connectors → get quizzed → answer → see graph expand with new connected nodes and color updates
