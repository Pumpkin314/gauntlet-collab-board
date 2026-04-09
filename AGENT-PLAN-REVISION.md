# CollabBoard AI Agent — Plan Review + Revised Proposal (v2)

## Why this document

This is a replacement planning artifact that **assesses** `AGENT-PLAN.md` against the live codebase and proposes a safer implementation sequence.

---

## 1) What in the current plan is strong

- Strong deterministic boundary idea: LLM for interpretation, typed executor for mutations.
- Good use of schema validation + retries before execution.
- Good separation of mutation tools vs control-flow/meta tools.
- Good acknowledgment of CRDT sync path through existing board actions.

---

## 2) Gaps found versus current repo reality

### A. Tool/schema mismatch with shipped board types

- `createFrame` is proposed, but there is no `frame` in `ShapeType`.
- Connectors exist in types, but no connector shape is currently registered/rendered in `Canvas` shape registration.
- The toolbar only exposes: cursor, box-select, sticky, rect, circle, text, line.

**Implication:** the tool catalog in `AGENT-PLAN.md` should be versioned against currently executable shape capabilities.

### B. Execution host/security tradeoff is underspecified

The original plan favors frontend-direct LLM calls. This is great for speed, but can leak API keys and complicate abuse control (rate limits, policy enforcement).

**Implication:** if direct-from-browser is kept, keys and guardrails must be handled via provider-safe ephemeral tokens; otherwise use a tiny edge proxy.

### C. ID resolution needs concrete deterministic strategy

Many natural-language commands are reference-heavy ("move the blue sticky in top-left"). Current plan mentions board-state fetch, but not deterministic tie-break rules.

**Implication:** add a **resolver contract** that picks exact IDs and surfaces ambiguity to user before mutation.

### D. Large action safety policy needs explicit transactional semantics

The plan says "skip and continue" on failure; this can produce half-applied diagrams.

**Implication:** support two modes:
- `best_effort` (continue on error)
- `atomic_batch` (validate all resolvable references first, then execute)

### E. Observability should include replayable action logs

Current plan mentions tracing, but not a strict replay record.

**Implication:** emit a structured command-execution record for debugging, regression tests, and audit.

---

## 3) Revised architecture (practical for this codebase)

## Phase 0 — Capability alignment (must-do first)

Create a source-of-truth capability file used by prompt + executor:

- Supported create tools (v1): `sticky`, `rect`, `circle`, `text`, `line`
- Supported mutate tools (v1): move, resize, recolor, update text, delete
- Unsupported (v1): frame, connector creation (until renderer + UX + constraints are fully implemented)

Deliverable:
- `agentCapabilities.ts` with exact enums and defaults mirrored from board types.

## Phase 1 — Deterministic executor + resolver core

Implement pure functions first (no LLM dependency):

1. `resolveTargets(board, selector)`
   - deterministic spatial/color/text matching
   - tie-break ordering rules
   - ambiguity result type (`none | one | many`)

2. `validateActionPlan(plan, capabilities, boardSnapshot)`
   - shape/tool compatibility
   - bounds + type checks
   - reference existence checks

3. `executeActionPlan(plan, boardActions, mode)`
   - supports `best_effort` and `atomic_batch`
   - returns per-action result + summary

Deliverable:
- unit-testable engine with no model calls.

## Phase 2 — LLM adapter layer

Add thin adapter:

- Input: user command + optional condensed board summary
- Output: strict JSON action plan following local zod schema
- Retry budget: 1 repair pass max
- If ambiguous target resolution detected by deterministic resolver, return clarification options

Deliverable:
- `planCommand()` that never mutates directly.

## Phase 3 — UI integration

Add an agent side panel/chat with:

- command input
- dry-run preview (planned actions)
- execute/cancel buttons
- progress + partial failure summaries

Important:
- Keep `BoardContext` mutations as the only write path.

## Phase 4 — Safety + observability

- command rate limits (client + server/edge if used)
- action count caps
- structured logs:
  - command text
  - normalized plan
  - resolution decisions
  - execution outcomes
  - latency metrics

## Phase 5 — expand capability surface

Only after v1 is stable:
- connector shape rendering + creation
- template primitives
- planner model delegation for complex layouts

---

## 4) Revised tool set for v1

```yaml
createObject:
  params:
    type: "sticky" | "rect" | "circle" | "text" | "line"
    x: number
    y: number
    overrides: object

updateObject:
  params:
    objectId: string
    updates: object

deleteObject:
  params:
    objectId: string

batch:
  params:
    actions: Action[]
    mode: "best_effort" | "atomic_batch"

requestClarification:
  params:
    message: string
    options: string[]
```

Notes:
- Prefer a small generic API (`createObject`, `updateObject`) mapped to existing Board actions.
- Keep semantic wrappers (e.g., `createStickyNote`) optional as prompt sugar, not executor primitives.

---

## 5) Concrete acceptance criteria

- Given 30 canonical NL commands, >=90% produce valid parse + plan JSON.
- For deterministic resolver tests, ambiguous references always return clarification (never random picks).
- No mutation path bypasses `BoardContext` actions.
- For `atomic_batch`, either all actions apply or none apply.
- Execution trace can replay and reproduce final state on a fresh board snapshot.

---

## 6) Risks and mitigations

- **Prompt drift** → lock schema version + capability version in prompt context.
- **Over-long board context** → summarize board into typed descriptors before LLM.
- **User trust on destructive ops** → confirmation gate for high-impact deletes.
- **Latency spikes** → local deterministic pre-resolution before LLM when possible.

---

## 7) Interview checklist (answer these before implementation starts)

1. **Hosting/security**: Do you want browser-direct LLM calls, or a minimal edge proxy for key/rate-policy control?
2. **Failure semantics**: Should default be `best_effort` or `atomic_batch`?
3. **Ambiguity policy**: When command matches multiple objects, always clarify, or allow "most likely" auto-pick?
4. **Scope for v1**: Should connector/frame/template support be deferred explicitly to v2?
5. **Model budget**: Preferred model tiers and max per-command latency target?
6. **Auditability**: Do you want persistent command logs per board/session?
7. **UX pattern**: Should execution be auto-run or always require "Preview → Confirm"?

---

## 8) Suggested implementation order (1-week sprint style)

- Day 1: capability map + zod schemas + resolver contract
- Day 2: validation engine + executor modes + unit tests
- Day 3: LLM adapter + repair loop + fallback clarification
- Day 4: chat panel with dry-run/execute
- Day 5: telemetry + command replay + polish

