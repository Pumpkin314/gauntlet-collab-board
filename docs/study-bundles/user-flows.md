# User Flows Quick Reference

## Flow 1: Login → Board → Draw
1. `/` → Dashboard (`src/components/Dashboard.tsx`)
2. Firebase Google Sign-In (`src/contexts/AuthContext.tsx`)
3. Create/join board → navigate to `/board/:boardId`
4. `BoardLayout.tsx` checks ownership/sharing, initializes Yjs doc
5. `BoardContext.tsx` attaches WebRTC + Firestore providers
6. Click canvas with active tool → `Canvas.tsx` captures click
7. `createObject()` → Yjs map → observeDeep → React → Konva render

## Flow 2: Boardie Chat → Canvas Shapes
1. Type message in `ChatWidget.tsx` → `useAgent.ts`
2. `pipeline.ts` sanitizes, rate-limits (20 req/min), calls Claude API
3. System prompt includes viewport bounds + available tools
4. Claude returns `tool_use` blocks → `executor.ts` dispatches
5. Tools: createStickyNote, createShape, createFrame, createLine, moveObject, etc.
6. Multi-turn: Claude can call `requestBoardState` then act on results
7. Session tracks created objects for context in next LLM call

## Flow 3: Real-Time Collaboration
1. User edits shape → Yjs CRDT update
2. y-webrtc broadcasts to all peers (<10ms P2P)
3. Firestore snapshot persisted (~500ms debounce)
4. Cursor positions: Awareness state → y-webrtc → cursorStore (renderless)
5. Conflict resolution: Yjs deterministic merge (no manual handling)

## Flow 4: Learnie Explorer → Quiz
1. Toggle to Learnie mode in ChatWidget
2. `GradeSelector.tsx` → SELECT_GRADE event → state machine
3. `explorerSpawn.ts` computes lane positions, creates kg-node shapes
4. Click node → NODE_CLICKED → NodeActionMenu appears
5. "Quiz me!" → GENERATE_QUIZ effect → `quizGenerator.ts` → Claude API
6. MC: instant grade / FR: Claude grades with confidence score
7. `computeNewConfidence()` updates node color
8. "What leads to this?" → SPAWN_PREREQS → up to 3 nodes + "+N more"

## Flow 5: Explorer Persistence
1. On state change → debounced write to `boards/{boardId}/explorerState`
2. Stores: grade, conversationHistory, stateMachineState, askedQuestions
3. Node confidence stored via Yjs (kgConfidence field on BoardObject)
4. On page reload → loads from Firestore → resumes where left off

## Top 5 Demo Flows
1. **Login → Create Board → Draw Shapes** (5 min)
2. **Boardie Chat → SWOT Template** (3 min) — AI spatial layout
3. **Grade 5 Explorer → Quiz** (5 min) — KG + quiz + color feedback
4. **Spawn Prereqs → Quiz Chain** (3 min) — Dynamic node expansion
5. **P2P Sync (2 browsers)** (4 min) — Sub-100ms shape sync

## Incomplete/Stubbed
- `INTERACTIVE_LESSON` state defined, no transitions to it
- `ACTION_LESSON` menu option exists, no handler
- `fr-visual` quiz format not implemented
- `createConnector()` in spec but not in agent (createLine exists)
