# API Surface Quick Reference

## Agent Tools (Boardie Mode)
All tools defined in `src/agent/tools.ts` with Zod schemas.

| Tool | Purpose |
|------|---------|
| `createStickyNote` | Place sticky note with text, color, position |
| `createShape` | Create rectangle, circle, or text shape |
| `createFrame` | Create grouping frame |
| `createLine` | Draw connector line between points |
| `moveObject` | Reposition by ID |
| `resizeObject` | Change dimensions by ID |
| `updateText` | Change text content |
| `deleteObject` | Remove by ID |
| `requestBoardState` | Get current board objects for context |
| `respondConversationally` | Text reply (no canvas action) |
| `askClarification` | Ask user for more details |

## Explorer Tools (Learnie Mode)
| Tool | Purpose |
|------|---------|
| `placeKnowledgeNode` | Spawn KG node on canvas |
| `connectKnowledgeNodes` | Draw prerequisite edge |
| `givePracticeQuestion` | Generate quiz for a node |

## Claude API Integration
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Model**: `claude-haiku-4-5-20251001`
- **File**: `src/agent/apiClient.ts`
- **Retry**: Once on 429/529
- **Timeout**: 15s default
- **Auth**: `x-api-key` header (client-side, MVP only)

## BoardActions (from useBoardActions())
```typescript
createObject(obj: Partial<BoardObject>): string  // returns ID
updateObject(id: string, updates: Partial<BoardObject>): void
deleteObject(id: string): void
batchCreate(objects: Partial<BoardObject>[]): string[]  // Y.Transaction
```

## Firebase Collections
| Collection | Purpose |
|-----------|---------|
| `boards` | Board metadata (title, owner, sharing) |
| `boardMembers` | Presence documents (WebRTC fallback) |
| `boardSnapshots` | Base64-encoded Yjs state |
| `boards/{id}/explorerState` | Learnie grade, quiz history, state |

## Routes (React Router)
| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Dashboard | List/create boards |
| `/board/:boardId` | BoardLayout | Main editor |
| `*` | Redirect to `/` | Catch-all |

## Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_FIREBASE_*` (6 vars) | Yes | Firebase config |
| `VITE_ANTHROPIC_API_KEY` | Yes | Claude API access |
| `VITE_SIGNALING_SERVERS` | No | WebRTC signaling (default: localhost:4445) |
| `VITE_ICE_SERVERS` | No | ICE/TURN config (JSON array) |
| `VITE_LANGFUSE_*` (3 vars) | No | Observability (graceful when missing) |
