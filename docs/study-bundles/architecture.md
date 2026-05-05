# Architecture Quick Reference

## Component Responsibilities

| Component | File | Responsibility |
|-----------|------|---------------|
| BoardContext | `src/contexts/BoardContext.tsx` | Yjs hub, split data/actions contexts, makeDiffSync |
| ExplorerContext | `src/contexts/ExplorerContext.tsx` | State machine React wrapper for Learnie |
| Canvas | `src/components/Canvas.tsx` | Main event loop: pointer, keyboard, viewport |
| ObjectRenderer | `src/components/Canvas/ObjectRenderer.tsx` | Shape lookup via registry, viewport culling |
| ChatWidget | `src/components/ChatWidget.tsx` | Chat UI for both Boardie and Learnie modes |
| Agent Pipeline | `src/agent/pipeline.ts` | Boardie multi-turn LLM loop with tool_use |
| State Machine | `src/agent/explorerStateMachine.ts` | Pure transition function for Learnie |
| Quiz Generator | `src/agent/quizGenerator.ts` | MC/FR quiz generation + FR grading via Claude |

## Service Boundaries

- **Yjs Y.Doc** = source of truth for all board objects (shapes, positions, colors)
- **Firestore** = persistence fallback (snapshots), board metadata, explorer state, presence
- **y-webrtc** = P2P real-time delivery (<10ms)
- **Claude API** = content generation (Boardie tools, Learnie quizzes)
- **Langfuse** = optional observability (traces LLM calls)

## Data Flow: Shape Creation

```
User click → Canvas handler → BoardActions.createObject()
→ yObjects.set(id, data) [Yjs CRDT]
→ y-webrtc broadcasts to peers (<10ms)
→ FirestoreYjsProvider writes snapshot (~500ms debounce)
→ observeDeep fires → makeDiffSync computes diff
→ React state update → ObjectRenderer → Konva shape
```

## Data Flow: Explorer Quiz

```
Node click → ExplorerContext.dispatch(NODE_CLICKED)
→ transition() returns {QUIZ_IN_PROGRESS, [GENERATE_QUIZ]}
→ quizGenerator.ts calls Claude API
→ Quiz rendered in ChatWidget
→ Answer submitted → ANSWER_SUBMITTED event
→ MC: instant grade / FR: Claude grades with confidence
→ computeNewConfidence() → SET_CONFIDENCE effect
→ BoardActions.updateObject(kgConfidence) → Yjs → render
```

## Key Patterns

- **Split Context**: BoardDataContext (re-renders) vs BoardActionsContext (stable refs)
- **Shape Registry**: Self-registering shapes via `registerShape()`, no switch statements
- **makeDiffSync()**: Cache-based diff prevents unnecessary React re-renders from Yjs
- **Local Dimensions**: BaseShape maintains localWidth/localHeight to prevent Transformer flash
- **Renderless Cursors**: cursorStore.ts (plain Map) + RAF loop + lerp, no React state
- **Bitmap Caching**: Unselected shapes cached as bitmaps, cleared on selection
