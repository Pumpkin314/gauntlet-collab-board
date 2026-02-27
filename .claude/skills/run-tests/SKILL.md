---
name: run-tests
description: "Use this skill whenever you need to run any part of the test suite for this project — after significant code changes, before a PR merge, or when verifying a regression fix. It documents the three-tier test stack (unit / perf / multiplayer perf), which to run for a given change, and how to parallelize them to save time.

Examples:

- Context: Claude just finished a multi-commit feature or bug fix.
  Assistant: 'Let me run the test suite using the run-tests skill to verify nothing regressed.'
  Commentary: Always invoke after significant changes — unit tests at minimum, full suite before merge.

- User: 'Run all tests.'
  Assistant: 'I'll use the run-tests skill to run the full parallelized suite.'
  Commentary: Full suite = unit + perf (parallel) then multiplayer (sequential after).

- Context: Only executor.ts or learningExplorerPrompt.ts were changed.
  Assistant: 'Changes are agent-only, so I'll run unit tests via the run-tests skill. Perf/multiplayer not needed.'
  Commentary: Scope the test run to what actually changed — don't always blast the full suite."
model: sonnet
memory: project
---

# run-tests — Project Test Suite Guide

This project has three test tiers. Know which to run and in what order.

---

## Tier 1 — Unit Tests (always run)

```bash
npm run test
```

- **Tool:** Vitest
- **Speed:** ~400–700 ms
- **What it covers:** Executor logic, KG data helpers, agent prompt assertions, eval golden sets
- **When:** After ANY code change before committing or declaring a fix done
- **Config:** No server needed; runs entirely in-process

---

## Tier 2 — Single-Player Perf Tests

```bash
npm run test:perf
```

- **Tool:** Playwright + local Vite server (port 3000)
- **Speed:** Several minutes
- **What it covers:** Canvas render perf (Phases 0–4), object creation throughput, pan FPS
- **Env:** `VITE_TEST_SKIP_SYNC=true` — sync is disabled, so Phase 5/6 (multiplayer) will timeout/fail here by design
- **When:** After changes to canvas, rendering, executor, or board state logic
- **Prerequisite:** Kill any running dev server on port 3000 before running (`lsof -ti:3000 | xargs kill -9`)

Focused shortcuts:
```bash
npm run test:perf:baseline    # Phase 0 only
npm run test:perf:phase1      # Phase 1 only
```

---

## Tier 3 — Multiplayer Perf Tests (run separately, never in parallel with Tier 2)

```bash
npm run test:perf:multiplayer
```

- **Tool:** Playwright, `playwright.multiplayer.config.ts`, workers=1
- **What it covers:** Phases 5–6 (real-time sync, cursor presence, CRDT)
- **Env:** No `SKIP_SYNC` — live Firebase/Yjs sync
- **When:** After changes to sync, Yjs bindings, useBoard, or FirestoreProvider

Slim variant:
```bash
npm run test:perf:multiplayer:slim
```

---

## Parallelized Full Suite

Tier 1 and Tier 2 can run in parallel (different processes, no shared state).
Tier 3 must run after Tier 2 (both spin up a server; sequential prevents port conflict).

**In practice:**

1. Open two terminals, launch simultaneously:
   - Terminal A: `npm run test`
   - Terminal B: `npm run test:perf`
2. Once both finish: `npm run test:perf:multiplayer`

Or as a single shell pipeline (background + wait):
```bash
npm run test & npm run test:perf && wait && npm run test:perf:multiplayer
```

---

## Which Tier to Run — Decision Table

| Change area | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Agent prompts / executor / KG index | ✅ | — | — |
| Canvas rendering / Konva shapes | ✅ | ✅ | — |
| Board state / useBoard hooks | ✅ | ✅ | — |
| Sync / Yjs / FirestoreProvider | ✅ | — | ✅ |
| Before PR merge | ✅ | ✅ | ✅ |

---

## Regression Handling

See `CLAUDE.md § Regression Handling` for the rule: do not auto-fix a failing test — stop and describe what changed, then wait for user approval.
