# Data Models Quick Reference

## BoardObject (Yjs Y.Map)
```typescript
interface BoardObject {
  id: string;
  type: ShapeType; // 'sticky-note' | 'rectangle' | 'circle' | 'text' | 'line' | 'frame' | 'kg-node'
  x: number; y: number;
  width: number; height: number;
  rotation?: number;
  color: string;
  text?: string;
  zIndex: number;
  createdBy: string;
  parentFrameId?: string;
  // KG-specific
  kgNodeId?: string;
  kgConfidence?: 'unexplored' | 'mastered' | 'shaky' | 'gap';
  kgLane?: string;
}
```

## Knowledge Graph (Static JSON)
```typescript
interface StandardNode {
  id: string;           // e.g. "3.NF.A.1"
  grade: string;        // "K" | "1" | ... | "8" | "HS"
  domain: string;       // "Number & Operations" etc.
  cluster: string;
  standard: string;     // human-readable description
  components: string[]; // sub-skills
}
// 836 nodes, 757 buildsTowards edges, 284 relatesTo edges
```

## Explorer State (Firestore)
```
boards/{boardId}/explorerState
  - grade: string
  - conversationHistory: AgentMessage[]
  - stateMachineState: string
  - askedQuestions: [{ kgNodeId, questionHash }]
```

## State Machine States
```
CHOOSE_GRADE → SPAWNING_ANCHORS → IDLE
  → NODE_MENU_OPEN → QUIZ_IN_PROGRESS → QUIZ_RESULT → IDLE
  → NODE_MENU_OPEN → SPAWNING_CHILDREN / SPAWNING_PREREQS → IDLE
```

## Confidence Transitions
| From | Event | To |
|------|-------|----|
| Gray (unexplored) | Correct (any) | Green (mastered) |
| Gray | Incorrect | Red (gap) |
| Red (gap) | Correct MC | Yellow (shaky) |
| Red | Correct FR (conf >= 0.8) | Green |
| Red | Incorrect | Red |
| Yellow (shaky) | Correct (any) | Green |
| Yellow | Incorrect | Red |
| Green (mastered) | Incorrect | Yellow |
| Green | Correct | Green |

## Yjs Document Structure
```
Y.Doc
  └── Y.Map<Y.Map<unknown>> ("objects")
       ├── "obj-abc123" → { id, type, x, y, ... }
       ├── "obj-def456" → { ... }
       └── ...
```

## Sync Layers
- **Yjs Y.Doc** — CRDT, source of truth
- **y-webrtc** — P2P broadcast (<10ms)
- **Firestore snapshots** — base64-encoded Y.Doc state (~500ms debounce)
- **Awareness** — cursor + presence metadata over WebRTC
