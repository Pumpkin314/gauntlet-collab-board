# CollabBoard — Study Guide

**Prepared for:** Technical demo / review
**Date:** 2026-03-26
**Audience level:** Principal engineer (deep technical scrutiny)

---

## 1. Executive Summary (30-second pitch)

CollabBoard is a **multiplayer collaborative whiteboard** with two AI-powered modes: **Boardie** (a general-purpose canvas assistant that creates visual layouts from natural language) and **Learnie** (a Learning Explorer that turns Common Core Math standards into an interactive knowledge graph with quizzes). It uses **Yjs CRDTs over WebRTC** for sub-10ms P2P sync, **Konva.js** for canvas rendering, and **Claude API** for AI capabilities — all running client-side with Firebase for auth and persistence.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  React Component Layer                                      │
│  Canvas.tsx, ChatWidget.tsx, NodeActionMenu.tsx              │
└──────────┬──────────────────────────────────────────────────┘
           │
           │ dispatch(ExplorerEvent)        useAgent() commands
           ▼                                ▼
┌──────────────────────┐     ┌──────────────────────────────┐
│  ExplorerContext +    │     │  Agent Pipeline              │
│  State Machine        │     │  pipeline.ts → executor.ts   │
│  (Learnie mode)       │     │  (Boardie mode)              │
└──────────┬───────────┘     └──────────┬───────────────────┘
           │ SideEffect[]                │ tool_use calls
           ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│  BoardContext (Yjs Hub)                                     │
│  Y.Doc → BoardActions (create/update/delete)                │
│  makeDiffSync() → React state (memo-friendly)               │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├─→ y-webrtc (P2P broadcast, <10ms)
           └─→ FirestoreYjsProvider (snapshot, ~500ms debounce)
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Konva Canvas Layer                                         │
│  ObjectRenderer → Shape components (registry pattern)       │
│  Viewport culling, bitmap caching, local dimensions         │
└─────────────────────────────────────────────────────────────┘
```

### Key User Flows

**Boardie (AI Whiteboard Assistant):**
Chat input → useAgent → pipeline.ts sanitizes + rate-limits → Claude API (tool_use) → executor.ts dispatches createObject/updateObject → Yjs → Konva render

**Learnie (Learning Explorer):**
Grade select → state machine transition → deterministic anchor spawn → node click → quiz generation (Claude API) → grade answer → confidence color update → dynamic child/prereq spawning

**Real-Time Collaboration:**
User action → Yjs CRDT update → y-webrtc broadcasts to peers (<10ms) + Firestore snapshot (~500ms) → remote peers' observeDeep → makeDiffSync → React re-render

---

## 3. Design Decisions (Q&A Format)

### Architecture

**Q: Why Yjs over Automerge or ShareDB?**
A: Yjs has a smaller bundle (~100KB vs 500KB+ Automerge), better performance for dense updates, and works P2P via WebRTC without requiring a central server (unlike ShareDB). The 24-hour MVP timeline ruled out building custom sync infrastructure.

**Q: Why a three-layer sync stack (Yjs + WebRTC + Firestore)?**
A: Each layer serves a distinct purpose — Yjs is the CRDT (conflict resolution), y-webrtc provides sub-10ms P2P delivery, and Firestore provides durable persistence as a fallback. If WebRTC fails (NAT/firewall), Firestore takes over. If Firebase goes down, P2P keeps working in-memory.

**Q: Why Konva.js over Fabric.js or raw canvas?**
A: react-konva provides clean React bindings. Konva has a built-in layer system, Transformer nodes for resize/rotate, and event delegation. Fabric.js is more mature but has a heavier API and worse React integration. Raw canvas would be reinventing the wheel.

**Q: Why is Canvas.tsx a large monolith (~749 LOC) instead of split?**
A: All pointer events, keyboard shortcuts, and viewport transforms reference shared state (tool mode, selection, viewport). Splitting would require 5+ levels of prop drilling. The mental model is clear: Canvas is the main event loop. At scale, we'd extract tool logic into a toolManager module.

**Q: Why split BoardContext into Data + Actions contexts?**
A: Components that only dispatch actions (event handlers) don't need to re-render when data changes. `useBoardActions()` returns stable refs that never trigger re-renders, making React.memo effective on shape components during high-frequency operations like pan/drag.

**Q: How does makeDiffSync() work and why is it needed?**
A: Yjs emits updates on every change — including React→Yjs→React roundtrips. makeDiffSync() maintains a cache, computes actual diffs (added/changed/deleted), and only produces new object references for changed entries. Without it, every Yjs change causes a full React re-render cascade.

### Learning Explorer

**Q: Why did you rewrite the Learning Explorer from v1 to v2?**
A: v1 let the LLM control everything — placing nodes, drawing edges, managing state. This caused stall-out bugs (tool calls silently dropped in multi-turn loops), node duplication, and unreliable tool parameter passing. v2 uses a **deterministic state machine** where the LLM is only called for quiz generation and free-response grading — operations where it genuinely shines.

**Q: Why a pure function state machine instead of xstate or useReducer?**
A: The pure `transition(state, event) → {nextState, effects}` function is trivially unit-testable without React test setup. Effects are returned as data (not fired directly), enabling testing, serialization, and debugging. xstate would add a dependency for a machine this simple. useReducer would couple React into the transition logic.

**Q: Why student-driven exploration (click to expand) instead of auto-spawning?**
A: Grounded in learning science — Self-Determination Theory says autonomy is the strongest predictor of intrinsic motivation. Cognitive Load Theory says auto-spawning 3-8 nodes creates extraneous load. Self-Regulated Learning says forcing students to decide trains metacognitive monitoring. We cap spawns at 3 nodes with a "+N more" badge to prevent overwhelm.

**Q: Why does Red→Correct MC = Yellow (not Green)?**
A: Multiple-choice has lower signal — the student could have guessed correctly. One more rep is needed to confirm understanding. Red→Correct FR with LLM confidence >= 0.8 goes straight to Green because free-response with high confidence signals genuine mastery.

**Q: How does content safety work without an LLM?**
A: Three synchronous, deterministic checks: wordlist filter (age-inappropriate terms), Flesch-Kincaid readability (targets grade <= 8), and URL guard (rejects bare links). No latency added, no false positives from AI filters. On failure, content is replaced with a safe fallback.

### Data & Infrastructure

**Q: What's the knowledge graph data source?**
A: 836 Common Core Math standard nodes + 757 prerequisite edges, stored as static JSON. The v2 index loads everything into Maps for O(1) lookups. relatesTo edges (284 total) are hidden by default to avoid visual clutter — only buildsTowards (prerequisite) edges are auto-rendered.

**Q: How does Firebase persistence work alongside Yjs?**
A: Yjs is the source of truth for drawing state. Firestore stores: board metadata (title, sharing), presence documents (fallback when WebRTC drops), and base64-encoded Yjs state snapshots (debounced at ~500ms). Explorer state (grade, quiz history, confidence) is a separate Firestore subcollection.

**Q: What's the testing strategy?**
A: Three tiers — Vitest unit tests (27 tests: state machine transitions, KG index queries, spawn logic), single-player Playwright perf tests (FPS, culling, render benchmarks), and multiplayer Playwright tests (sync latency across browser contexts). Unit tests run on every change; perf/multiplayer before PR merge.

**Q: How does the AI pipeline work?**
A: Custom fetch wrapper to Claude API (claude-haiku-4-5-20251001). Retry once on 429/529, 15s timeout. For Boardie: multi-turn agentic loop with tool_use (create/move/delete shapes). For Learnie: single-shot quiz generation + FR grading. Langfuse traces all LLM calls for observability (optional, gracefully disabled when keys missing).

---

## 4. Honest Assessment

### What We'd Improve in v2
- **API key exposure**: Anthropic key is client-side (`VITE_ANTHROPIC_API_KEY`). Production needs a backend proxy.
- **Auth token in client**: Firebase auth is fine for MVP but a real deployment needs server-side session management.
- **Full state snapshots**: Firestore persistence writes the entire Yjs doc as base64. Delta sync would reduce writes and bandwidth for larger boards.
- **Pan FPS at 100 objects is ~24** (target: 60). Bottleneck is Konva canvas redraw; React renders are already eliminated. Would need WebGL fallback or more aggressive culling.
- **Single explorer per board**: No per-user confidence overlays yet. All users on a shared board see the same explorer state.

### Known Trade-offs
- Firestore is eventual-consistent — acceptable for 2-5 concurrent users, not for 50+.
- Base64 encoding adds ~33% storage overhead on snapshots.
- Rate limiting is in-memory only (20 req/min per user) — resets on page refresh.
- Quiz format auto-selection exists but "Challenge me!" override UI was deferred post-MVP.
- `INTERACTIVE_LESSON` state is defined in the state machine but has no transitions to it — earmarked for post-MVP.

### Failure Modes
| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Firebase down | Yjs continues in-memory; P2P sync works; edits not persisted | On reconnect, last snapshot restored |
| WebRTC fails (NAT/firewall) | Falls back to Firestore for sync; latency increases to 10-100ms | ICE config supports TURN relay |
| Both Firebase + WebRTC down | Board freezes; local edits possible but not synced | Edits may be lost (acceptable for MVP) |
| Claude API fails | Quiz generation fails | Show error, offer "Skip" button; state machine stays valid |
| Student refreshes during quiz | Explorer state persisted to Firestore | Reloads and continues where left off |

---

## 5. Gotchas

- **Boardie vs Learnie identity**: Internal enum uses `'boardie'` / `'explorer'`, but UI labels are "Boardie" and "Learnie" respectively. The system prompts say "You are Boardie" / "You are Learnie".
- **`kgNodeMapRef`** in `useAgent.ts` is explorer-only — maps kgNodeId to boardObjectId. Not used in Boardie mode.
- **`createConnector(fromId, toId, style)`** is in the spec schema but NOT implemented in the agent. `createLine` exists but is different.
- **Frame child jump bug**: Transformer accumulates x/y during selected-frame drag; children don't get the offset. Known issue, documented in feature-wishlist.md.
- **Multi-select perf drops at 5-10+ selected objects** — logged in PERFORMANCE_SIDENOTES.md.
- **Duplicate commits in git history** (e.g., `feat(explorer): add deterministic spawn...` appears twice) — artifact of squash/rebase or worktree merges.
- **Knowledge graph JSON data files were initially missing** from the build — fixed in commit `c160dc5` after all sprint merges. Late-stage gotcha.
- **Cursor sync is renderless** — positions stored in a plain Map (`cursorStore.ts`), updated via RAF loop with lerp. Not React state.
- **`prevVisibleRef`** caches visible objects for stable identity across renders — prevents unnecessary Konva remounts during pan.

---

## 6. Directory Structure

```
src/
├── agent/              # AI pipeline: apiClient, executor, tools, prompts
│   ├── explorerStateMachine.ts   # Pure state machine (no React)
│   ├── quizGenerator.ts          # MC/FR quiz generation via Claude
│   ├── explorerSpawn.ts          # Deterministic node positioning
│   ├── safety.ts                 # Content safety (wordlist, FK, URL)
│   ├── pipeline.ts               # Boardie agentic loop
│   └── tools.ts                  # Zod schemas for all agent tools
├── components/
│   ├── Canvas.tsx                # Main canvas (~749 LOC, event loop)
│   ├── Canvas/                   # ObjectRenderer, Toolbar subcomponents
│   ├── shapes/                   # Konva shapes (StickyNote, Frame, KGNode...)
│   ├── ChatWidget.tsx            # Chat UI for Boardie/Learnie
│   ├── NodeActionMenu.tsx        # Floating context menu for KG nodes
│   └── GradeSelector.tsx         # Grade picker for Learnie
├── contexts/
│   ├── BoardContext.tsx           # Yjs hub: data + actions (split pattern)
│   ├── ExplorerContext.tsx        # State machine context for Learnie
│   ├── AuthContext.tsx            # Firebase auth + inactivity timer
│   ├── SelectionContext.tsx       # Multi-select state
│   ├── DebugContext.tsx           # Perf metrics (isolated from main renders)
│   ├── webrtcProvider.ts          # y-webrtc factory with ICE config
│   └── firestoreYjsProvider.ts   # Debounced snapshot persistence
├── data/                          # Knowledge graph JSON + v2 index
├── services/                      # Firebase board/explorer persistence
├── types/board.ts                 # BoardObject, ShapeType definitions
├── utils/                         # shapeRegistry, cursorStore, geometry
├── hooks/useExplorerStateMachine.ts  # React wrapper for state machine
├── App.tsx                        # Layout wrapper
└── main.tsx                       # Router + context providers (3 routes)

tests/
├── evals/                         # Vitest: state machine, KG index, spawn, quiz
└── perf/                          # Playwright: FPS, culling, sync, multiplayer

planning_docs/                     # Design specs, sprint plans, status docs
```

---

## 7. Tech Stack Inventory

| Technology | Role | Why This One | Version |
|-----------|------|-------------|---------|
| React 18 | UI framework | Hooks-based, excellent ecosystem | 18.3.1 |
| Konva.js + react-konva | Canvas rendering | React bindings, built-in Transformer, layer system | 9.3.19 |
| Yjs | CRDT sync | Small bundle, P2P-native, automatic conflict resolution | 13.6.29 |
| y-webrtc | P2P transport | Sub-10ms sync, mesh peer discovery | 10.3.0 |
| Firebase | Auth + Firestore | Serverless, Google OAuth, real-time listeners | 11.1.0 |
| Claude API (Haiku) | AI assistant | Tool-use for agentic loops, fast inference | claude-haiku-4-5-20251001 |
| Dagre | Graph layout | Lightweight DAG layout for knowledge graph positioning | 0.8.5 |
| Langfuse | AI observability | Trace LLM calls, optional/graceful when unconfigured | 3.38.6 |
| Zod | Schema validation | Runtime safety for agent tool inputs, TypeScript-native | 4.3.6 |
| Vite | Build tool | Fast HMR, minimal config, ES2020 native | 6.0.5 |
| Vitest | Unit tests | Fast, Vite-native, 27 tests | 4.0.18 |
| Playwright | E2E perf tests | Real browser, multi-context multiplayer testing | 1.58.2 |
| TypeScript | Type safety | Strict mode, path aliases | 5.9.3 |

---

## 8. Project Evolution (How It Was Actually Built)

**Era 1 — Collaborative Whiteboard (Jan-Feb 2026):** MVP multiplayer drawing with Yjs CRDT, Firebase auth, sticky notes, shapes, frames.

**Era 2 — Boardie Agent (Mid-Feb):** Added AI-powered canvas assistant with LLM tool-use loop. Multi-turn pipeline with create/move/delete tools.

**Era 3 — Learning Explorer v1 (Late Feb):** Bolted on knowledge graph mode with LLM direct control. Immediate problems: stall-out bug (tool calls dropped in multi-turn loops), node duplication, unreliable tool parameters.

**Era 4 — Learnie v2 Rewrite (Mar 8-9, ~7 hours):** Complete architectural rewrite. 5 sprints executed in compressed form: foundation types → grade selection → integration → quiz flow → dynamic spawning → polish + persistence. **All 5 sprints shipped exactly as planned.** No features cut, no shortcuts. The key pivot: LLM moved from orchestrator to content generator.

**Post-v2:** Connector bug fixes (5 edge bugs), build fix for missing JSON data files.
