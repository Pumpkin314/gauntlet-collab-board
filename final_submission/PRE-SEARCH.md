# CollabBoard: Pre-Search Architecture Analysis

**Project**: Real-time Collaborative Whiteboard with AI Agent  
**Timeline**: MVP (24 hours) → Final Submission (7 days)  
**Date**: February 16, 2026

---

## Executive Summary

This document presents the complete Pre-Search analysis for CollabBoard, a production-scale collaborative whiteboard with real-time multi-user synchronization and an AI agent capable of manipulating the board via natural language commands.

**Guiding Principle**: *"A simple whiteboard with bulletproof multiplayer beats a feature-rich board with broken sync"*

This principle drives all architectural decisions, prioritizing reliable synchronization over feature complexity.

---

## Project Requirements

### MVP Requirements (24 hours)
- ✅ Infinite canvas with pan/zoom
- ✅ Sticky notes (create, edit, move, color)
- ✅ One shape type minimum
- ✅ Real-time sync between 2+ users
- ✅ Multiplayer cursors with names
- ✅ Presence awareness
- ✅ User authentication
- ✅ Deployed and public

### Final Submission Requirements (7 days)
- Additional shapes: rectangles, circles, lines, connectors, frames
- Text elements
- Transforms (resize/rotate)
- Selection (single/multi)
- Operations (delete/duplicate/copy-paste)
- AI agent integration (6+ command types)

### AI Agent Requirements
- Minimum 6 distinct command types across: Creation, Manipulation, Layout, Complex
- All users see AI results in real-time
- <2s response latency for single-step commands
- Handle multi-step operations (e.g., "Create SWOT analysis")

---

## Phase 1: Project Context Discovery

### 1. Scale & Usage Patterns

**MVP Scale:**
- **Concurrent users**: 2-5 users per board
- **Total boards**: 1-10 (testing/demo phase)
- **Objects per board**: 10-50
- **Traffic pattern**: Spiky (testing bursts)

**Final Submission Scale:**
- **Concurrent users**: 5-100 per board
- **Total boards**: 100-10,000
- **Objects per board**: 500+
- **Traffic pattern**: Spiky to steady (educational/professional use)
- **Performance target**: <100ms sync latency

**Impact on design:**
- Serverless architecture acceptable (handles spiky traffic)
- No need for complex load balancing initially
- Can leverage Firebase free tier for MVP
- Must design for horizontal scaling path

### 2. Budget Constraints

**MVP Phase**: Free tier only
- Firebase: 50K reads/day, 20K writes/day (sufficient for 5 users testing)
- Vercel: Unlimited hobby deployments
- No database costs

**Final Submission**: $0-50/month
- Firebase Spark → Blaze plan if needed
- Still within free quotas likely
- Monitor costs daily

**Production projection** (post-submission):
- 1,000 active boards: ~$50-100/month
- 10,000 active boards: ~$500-1000/month
- Cost scales linearly with usage

### 3. Timeline & Iteration Strategy

**Timeline**: One-time project (7 days total)
- No long-term maintenance planned
- Focus on working demo, not production hardening
- Acceptable to cut corners on edge cases

**Iteration approach**:
- MVP → Final is progressive enhancement
- Not a rewrite; build on MVP foundation
- Use git tags to mark milestones

### 4. Compliance & Security

**MVP**: Minimal
- Public demo, no sensitive data
- Firebase Auth for identity
- Basic Firestore security rules

**Not addressing** (out of scope):
- GDPR/CCPA compliance
- SOC2 certification
- Audit logs
- Data encryption at rest (Firebase handles by default)

### 5. Cold Start & Performance

**Acceptable latency targets:**
- **Initial page load**: <3s
- **Auth flow**: <2s
- **Object sync**: <100ms
- **AI agent response**: <2s (single-step commands)

**Cold start**: Not a concern (serverless + SPA architecture, Firebase always hot)

---

## Phase 2: Technology Stack Analysis

### Critical Decision #1: Real-time Sync Architecture

**The Core Challenge**: Multiple users editing simultaneously without conflicts.

#### Options Considered

**Option A: Custom WebSocket Server**
- **Pros**: Full control, lowest latency potential
- **Cons**: 
  - Must implement: connection management, reconnection logic, conflict resolution, persistence
  - Requires server hosting/management
  - 8-12 hours of MVP time
- **Verdict**: ❌ Too much infrastructure for 24-hour timeline

**Option B: Firebase Firestore**
- **Pros**:
  - Built-in real-time listeners (automatic WebSocket management)
  - Zero server code needed
  - Conflict resolution included (last-write-wins)
  - Offline support & reconnection built-in
  - ~1 hour to production
- **Cons**:
  - Vendor lock-in
  - Cost scales with usage
  - Less control over conflict resolution
  - Last-write-wins might lose simultaneous edits
- **Verdict**: ✅ **SELECTED FOR MVP** - Speed to deploy trumps control

**Option C: Supabase (PostgreSQL + Realtime)**
- **Pros**: Open source, better cost at scale, SQL flexibility
- **Cons**: Less mature realtime, more setup complexity, weaker offline support
- **Verdict**: ❌ Save for post-launch if Firebase costs become issue

**Option D: Liveblocks (Purpose-built for collaboration)**
- **Pros**: Best DX, true CRDT support, designed for this use case
- **Cons**: $$$ (not free tier), overkill for MVP
- **Verdict**: ❌ Too expensive, consider for production iteration

**Option E: Socket.io + Redis**
- **Pros**: Popular, good performance
- **Cons**: Still need to build server, implement persistence separately
- **Verdict**: ❌ Same timeline issues as custom WebSocket

#### Decision: Firebase Firestore

**Reasoning:**
1. **Time constraint**: 24 hours for MVP - cannot afford 8+ hours on infrastructure
2. **Built-in features**: Real-time listeners = zero WebSocket code
3. **Acceptable trade-offs**: Last-write-wins sufficient for MVP (users editing different objects)
4. **Free tier**: Generous enough for testing and demo

**Trade-off analysis:**
- **We gain**: Speed, reliability, zero ops
- **We lose**: Fine-grained conflict resolution, cost predictability at scale
- **We accept**: Vendor lock-in for MVP speed

---

### Critical Decision #2: Frontend Framework

#### Options Considered

**Option A: React (Vite)**
- **Pros**: Team familiarity, fast dev server, simple setup, large ecosystem
- **Cons**: No SSR, no built-in routing
- **Use case**: MVP (speed matters most)
- **Verdict**: ✅ **SELECTED FOR MVP**

**Option B: Next.js 14**
- **Pros**: SSR, API routes, production patterns, Vercel optimization
- **Cons**: More complex setup, heavier framework
- **Use case**: Final submission (better production patterns)
- **Verdict**: ✅ **SELECTED FOR FINAL** (migrate during week)

**Option C: Vue.js**
- **Pros**: Simpler than React, good DX
- **Cons**: Smaller ecosystem, team less familiar
- **Verdict**: ❌ Stick with team strengths

**Option D: Svelte**
- **Pros**: Smaller bundle, less boilerplate
- **Cons**: Smaller ecosystem, less Canvas library support
- **Verdict**: ❌ Ecosystem matters for canvas libraries

#### Decision: React (Vite) → Next.js

**MVP**: React with Vite
- Fastest dev server
- No routing overhead (single-page app)
- Get to features quickly

**Final**: Migrate to Next.js
- SSR for better initial load
- API routes for AI agent backend
- Better Vercel integration

**Progressive enhancement path**: Start simple, add complexity when needed.

---

### Critical Decision #3: Canvas Rendering Library

#### Options Considered

**Option A: Konva.js**
- **Pros**: 
  - Battle-tested for collaborative whiteboards
  - Layer system (separate UI from content)
  - Easy event handling (drag, resize, rotate)
  - Good documentation for realtime sync
  - Used by production whiteboard apps
- **Cons**: Slightly larger bundle than alternatives
- **Verdict**: ✅ **SELECTED**

**Option B: Fabric.js**
- **Pros**: Similar features to Konva
- **Cons**: Less active development, fewer GitHub stars
- **Verdict**: ❌ Konva more actively maintained

**Option C: PixiJS**
- **Pros**: Extremely fast (WebGL)
- **Cons**: Overkill (game engine), more complex API
- **Verdict**: ❌ Too complex for our use case

**Option D: Plain HTML5 Canvas**
- **Pros**: No dependencies, full control
- **Cons**: Must implement all transforms, events, layers manually
- **Verdict**: ❌ Reinventing the wheel

#### Decision: Konva.js

**Reasoning:**
1. **Proven for whiteboards**: Other collaborative tools use it successfully
2. **Event system**: Easy to wire up Firestore updates → canvas rendering
3. **Layer separation**: UI layer (cursors) separate from content layer (objects)
4. **Transform support**: Drag, rotate, resize built-in

**Integration pattern:**
```javascript
// Firestore change → Konva update
onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(change => {
    const object = change.doc.data();
    const shape = layer.findOne(`#${change.doc.id}`);
    shape.x(object.x);
    shape.y(object.y);
    layer.batchDraw(); // Efficient re-render
  });
});
```

---

### Critical Decision #4: Authentication

#### Options Considered

**Option A: Firebase Auth (Google OAuth only)**
- **Pros**: 1-click signup, no password management, 5-min setup
- **Cons**: Limited to Google accounts
- **Verdict**: ✅ **SELECTED FOR MVP**

**Option B: Firebase Auth (Email + Google)**
- **Pros**: More flexible for users
- **Cons**: More UI to build (signup forms)
- **Verdict**: ⏭️ Add in final if time permits

**Option C: Magic Links (passwordless)**
- **Pros**: Modern UX, no passwords
- **Cons**: Email delivery complexity
- **Verdict**: ❌ Overkill for demo

**Option D: Anonymous Auth**
- **Pros**: Fastest (try before signup)
- **Cons**: Lose work if browser cleared
- **Verdict**: ❌ Want persistent identity

#### Decision: Firebase Auth (Google OAuth)

**Reasoning:**
- Fastest path to authentication
- Everyone has Google account
- Single Sign-On UX

**Access control**: Everyone on board = editor (no RBAC for MVP)

---

### Critical Decision #5: Programming Language

#### Decision: JavaScript (MVP) → TypeScript (Final)

**MVP: JavaScript**
- **Why**: 
  - No type setup time
  - No compilation time
  - 24-hour constraint - every minute counts
  - Focus on solving problems, not type errors

**Final: TypeScript**
- **Why**:
  - Type safety catches bugs at compile time
  - Better refactoring confidence
  - Self-documenting code
  - Team collaboration benefits

**Migration strategy:**
1. Rename `.js` → `.tsx`
2. Add `@ts-ignore` to get compiling
3. Incrementally add types (data models first)
4. Focus on Firestore types (document interfaces)

---

### Critical Decision #6: State Management

#### Options Considered

**Option A: React Context + useState**
- **Pros**: Built-in, simple, no dependencies
- **Cons**: Can get messy at scale
- **Verdict**: ✅ **SELECTED FOR MVP**

**Option B: Zustand**
- **Pros**: Simple API, better than Context for complex state
- **Cons**: Another dependency
- **Verdict**: ✅ **UPGRADE FOR FINAL**

**Option C: Redux Toolkit**
- **Pros**: Powerful, well-documented
- **Cons**: Overkill, more boilerplate
- **Verdict**: ❌ Too complex for our needs

#### Decision: Progressive complexity

**MVP**: React Context (built-in, sufficient)  
**Final**: Zustand (cleaner patterns as app grows)

---

### Critical Decision #7: Hosting & Deployment

#### Decision: Vercel (Frontend) + Firebase (Backend)

**Why Vercel:**
- Auto-deploy on git push
- Zero config for Vite/Next.js
- Preview deployments for PRs
- Free tier sufficient

**Why Firebase:**
- Serverless by nature (no cold starts)
- Integrated with Firestore/Auth
- Auto-scales

**CI/CD Pipeline:**
1. Push to GitHub
2. Vercel auto-deploys (1-2 min)
3. Live at `collabboard.vercel.app`

---

## Phase 3: Data Model Design

### Firestore Structure

```
boards/{boardId}
  - title: string
  - createdBy: userId
  - createdAt: timestamp
  - lastModified: timestamp
  
  boards/{boardId}/objects/{objectId}
    - type: 'sticky' | 'rectangle' | 'circle' | 'line' | 'text' | 'frame' | 'connector'
    - x: number (canvas position)
    - y: number
    - width: number
    - height: number
    - rotation: number (degrees)
    - zIndex: number (stacking order)
    - content: string (for text/sticky notes)
    - color: string (hex or named color)
    - style: object (borders, shadows, etc)
    - connectedTo: [objectId] (for connector lines)
    - createdBy: userId
    - updatedAt: timestamp
  
  boards/{boardId}/presence/{userId}
    - name: string (display name)
    - cursorX: number
    - cursorY: number
    - color: string (cursor color for multiplayer)
    - lastActive: timestamp (for cleanup)
```

### Key Design Decisions

**1. Subcollections for objects**
- **Why**: Better query performance, isolated by board
- **Trade-off**: Can't query across boards easily (acceptable)

**2. Presence as separate subcollection**
- **Why**: Ephemeral data, high write frequency, easy cleanup
- **Trade-off**: Extra collection to manage

**3. Flat object structure**
- **Why**: Firestore reads entire documents, avoid deep nesting
- **Trade-off**: Can't do partial updates easily (acceptable for MVP)

**4. zIndex for stacking**
- **Why**: Simple integer sorting vs complex ordering algorithms
- **Trade-off**: Gaps in zIndex possible (acceptable)

---

## Phase 4: Conflict Resolution Strategy

### Last-Write-Wins (LWW) Approach

**How it works:**
1. Each write includes server timestamp (Firestore `serverTimestamp()`)
2. Firestore automatically resolves conflicts: latest timestamp wins
3. All clients notified via real-time listeners

**When it works well** (our use case):
- Users editing different objects (most common)
- Single-user editing single object
- Sequential edits to same object

**When it fails** (acceptable for MVP):
```
User A: Changes sticky color to red at t=1
User B: Moves same sticky to (200,200) at t=2
→ Result: B's entire object wins, A's color change LOST
```

**Why acceptable for MVP:**
- Rare in practice (users work on different parts)
- When it happens, losing one edit is okay for demo
- Can upgrade to property-level LWW later

### Future: Property-Level Conflict Resolution

**If needed later**, upgrade to CRDT-style property-level LWW:
```javascript
// Instead of document-level
updateObject(objectId, {x: 100, y: 200, color: 'red'})

// Use property-level
updateObjectProperty(objectId, 'x', 100)
updateObjectProperty(objectId, 'y', 200)
updateObjectProperty(objectId, 'color', 'red')
```

This allows:
- User A changes color (wins for color property)
- User B changes position (wins for position property)
- Both changes preserved

**See Appendix A for full CRDT analysis.**

---

## Phase 5: AI Agent Architecture

### High-Level Flow

```
1. User types: "Create 5 sticky notes for brainstorm"
2. Frontend → Claude API (function calling)
3. Claude returns: createStickyNote() x5 with positions/colors
4. Backend executes → writes to Firestore
5. Firestore listeners → all users see new objects (<2s)
```

### Technology Choices

**AI Model**: Claude Sonnet 4
- Fast function calling
- Good at spatial reasoning
- Handles multi-step commands

**Function Library** (minimum 6 commands):
1. **Creation**: `createStickyNote()`, `createShape()`, `createConnector()`
2. **Manipulation**: `moveObject()`, `resizeObject()`, `changeColor()`
3. **Layout**: `arrangeInGrid()`, `distributeEvenly()`, `alignObjects()`
4. **Complex**: `createSWOT()`, `createFlowchart()`, `organizeByColor()`

### Execution Strategy

**Server-side execution** (via Next.js API routes):
- Security: Validate AI commands before executing
- Rate limiting: Prevent abuse
- Error handling: Graceful failures

**Sync via existing Firestore listeners**:
- No special AI sync logic needed
- AI-created objects = regular objects
- All users see updates automatically

---

## Phase 6: Performance Optimization Strategy

### MVP Optimizations

**1. Firestore Query Optimization**
```javascript
// Good: Query only visible objects
const visible = query(
  collection(db, `boards/${boardId}/objects`),
  where('x', '>=', viewport.left),
  where('x', '<=', viewport.right)
);

// Bad: Load all objects always
const all = collection(db, `boards/${boardId}/objects`);
```

**2. Konva Layer Separation**
```javascript
// UI layer: Cursors, selection boxes (high frequency updates)
const uiLayer = new Konva.Layer();

// Content layer: Sticky notes, shapes (lower frequency)
const contentLayer = new Konva.Layer();

// Only redraw changed layer
uiLayer.batchDraw(); // Not contentLayer
```

**3. Debounce Firestore Writes**
```javascript
// Drag event fires 60fps, don't write every frame
const debouncedUpdate = debounce((x, y) => {
  updateDoc(objectRef, { x, y });
}, 100); // Write at most every 100ms
```

### Final Submission Optimizations

**4. Virtual Scrolling for Large Boards**
- Only render objects in viewport
- Cull off-screen objects from Konva

**5. Batch Firestore Operations**
```javascript
// Instead of 5 separate writes
writeBatch()
  .set(doc1, data1)
  .set(doc2, data2)
  .set(doc3, data3)
  .commit(); // Single network round-trip
```

**6. IndexedDB Caching**
- Cache object data locally
- Reduce Firestore reads
- Faster initial load

---

## Phase 7: Risk Mitigation

### Risk #1: Firestore Cost Overrun

**Likelihood**: Medium  
**Impact**: High  
**Mitigation**:
- Set Firebase budget alerts ($10, $25, $50)
- Monitor daily usage in Firebase Console
- Optimize queries if approaching limits
- Plan B: Migrate to Supabase if costs >$100/month

### Risk #2: Sync Performance Issues

**Likelihood**: Medium  
**Impact**: High  
**Mitigation**:
- Load test before launch (simulate 10+ concurrent users)
- Implement viewport-based queries (don't load all objects)
- Add loading indicators (manage user expectations)
- Debounce high-frequency updates

### Risk #3: 24-Hour Timeline Slip

**Likelihood**: High  
**Impact**: Critical  
**Mitigation**:
- **Cut features ruthlessly**: If behind, drop shapes → sticky notes only
- **Deploy broken is okay**: Better to have deployed MVP with bugs than perfect localhost
- **Use Vercel deploy previews**: Test in production early
- **Set hourly milestones**: Hour 4 = deployed, Hour 8 = auth working, etc.

### Risk #4: Konva Learning Curve

**Likelihood**: Low  
**Impact**: Medium  
**Mitigation**:
- Start with simple rectangle/circle (built-in shapes)
- Use Konva docs heavily (good examples)
- Sticky note = Rect + Text (compose primitives)

### Risk #5: AI Agent Latency >2s

**Likelihood**: Medium  
**Impact**: Medium  
**Mitigation**:
- Cache common command patterns
- Show loading spinner immediately
- Optimize Claude prompts (fewer examples)
- Add streaming if time permits

---

## Final Tech Stack Summary

### MVP Stack (24 Hours)

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Frontend** | React (Vite) | Fastest dev, team familiarity |
| **Canvas** | Konva.js | Proven for whiteboards, good events |
| **Realtime** | Firebase Firestore | Zero infrastructure, built-in listeners |
| **Auth** | Firebase Auth (Google) | 1-click signup, 5-min setup |
| **Hosting** | Vercel | Auto-deploy, zero config |
| **Language** | JavaScript | Speed over safety for 24hr |
| **State** | React Context | Built-in, sufficient for MVP |

**Total setup time**: ~2 hours  
**Time for features**: ~22 hours

### Final Stack (7 Days)

| Layer | Technology | Upgrade Reason |
|-------|-----------|----------------|
| **Frontend** | Next.js 14 | SSR, API routes, production patterns |
| **Canvas** | Konva.js | Keep what works |
| **Realtime** | Firestore | Keep unless cost issues |
| **Language** | **TypeScript** | Safety as codebase grows |
| **State** | Zustand | Cleaner patterns at scale |
| **Testing** | Vitest + RTL | Quality assurance |

---

## Why Firestore for Collaborative Apps

### Real-time Listeners = Zero WebSocket Code

Firestore's killer feature for collaboration:

```javascript
// Each client runs this
db.collection('boards/boardId/objects').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      // Another user created object → render it
      renderObject(change.doc.data());
    }
    if (change.type === 'modified') {
      // Another user edited → update it
      updateObject(change.doc.data());
    }
  });
});
```

**What Firestore handles automatically:**
- ✅ WebSocket connection management
- ✅ Reconnection logic (exponential backoff)
- ✅ Offline queueing (writes queued, sync on reconnect)
- ✅ Conflict resolution (last-write-wins)
- ✅ Pushing changes to all connected clients (~50ms)

**Result**: User A creates sticky note → Firestore writes it → **Firestore automatically pushes to all other users**. Zero custom sync code.

### Cost-Benefit Analysis

**Benefits:**
- ⚡ **Speed to deploy**: <1 hour to production realtime sync
- 🔌 **Zero infrastructure**: No server management, no DevOps
- 🔄 **Proven reliability**: Used by millions of apps
- 🔐 **Security built-in**: Rules language for access control
- 💰 **Free tier generous**: 50K reads, 20K writes per day

**Costs:**
- 💸 **Scales with usage**: $0.06 per 100K reads (can add up)
- 🔒 **Vendor lock-in**: Firebase-specific patterns
- 🎯 **Less control**: Can't customize conflict resolution without abstraction
- 📊 **Query limitations**: No joins, limited aggregations

**When Firestore makes sense:**
- ✅ MVP/prototype phase (speed matters most)
- ✅ Spiky traffic patterns (serverless shines)
- ✅ Budget <$500/month
- ✅ Team wants managed infrastructure

**When to reconsider:**
- ⚠️ Costs >$500/month
- ⚠️ Need complex queries (use PostgreSQL)
- ⚠️ Want zero vendor lock-in
- ⚠️ Need custom conflict resolution (use CRDTs)

---

## Scale Considerations & Migration Paths

### MVP Scale (Week 1)
- **Users**: 2-5 per board, 10 boards total
- **Firestore load**: <1K operations/day
- **Cost**: $0 (well within free tier)
- **Performance**: <50ms sync latency

### Final Submission Scale (Week 1 End)
- **Users**: 5-100 per board, 100-1000 boards
- **Firestore load**: 10K-50K operations/day
- **Cost**: $0-10/month
- **Performance target**: <100ms sync latency

### Production Scale (Hypothetical)

| Metric | Target | Firestore Viability |
|--------|--------|---------------------|
| **10K boards** | 1000 concurrent users | ✅ Yes ($50-100/month) |
| **100K boards** | 10K concurrent users | ⚠️ Maybe ($500-1K/month) |
| **1M boards** | 100K concurrent users | ❌ No (too expensive) |

### Migration Paths if Firestore Becomes Issue

**Tier 1: Optimize Firestore** (1-2 days)
- Add indexes
- Implement viewport queries
- Cache with IndexedDB
- Batch operations

**Tier 2: Hybrid Approach** (1 week)
- Firestore for persistence
- Redis for hot data / active sessions
- Reduce Firestore read/write volume

**Tier 3: Supabase Migration** (2-3 weeks)
- PostgreSQL + realtime subscriptions
- Better cost at scale ($50 for 10K users)
- More complex queries possible

**Tier 4: Custom WebSocket + CRDT** (4-6 weeks)
- Full control over sync logic
- Property-level conflict resolution
- Peer-to-peer capable
- Maximum complexity

**Decision point**: Migrate when Firestore costs >$500/month OR when property-level conflicts become UX issue.

---

## Implementation Roadmap

### Immediate Next Steps (Next 4 Hours)

1. ✅ **Create GitHub repo**: `collabboard`
2. ✅ **Initialize Vite + React**: `npm create vite@latest`
3. ✅ **Deploy to Vercel**: Connect repo, auto-deploy
4. ✅ **Create Firebase project**: Enable Firestore + Auth
5. ✅ **Add Firebase to app**: Install SDK, configure
6. ✅ **Test auth in production**: Google sign-in working

### Day 1: MVP Push (20 Hours)

**Hours 1-4: Foundation**
- Basic Konva canvas (pan/zoom)
- Firestore connection
- Auth flow (login/logout)

**Hours 5-12: Core Features**
- Sticky note creation
- Drag to move
- Edit text content
- Color picker
- Real-time sync (Firestore listeners → Konva)

**Hours 13-18: Multiplayer**
- Presence tracking (cursor positions)
- Render other users' cursors
- Display user names
- Handle user join/leave

**Hours 19-20: Polish & Deploy**
- Fix critical bugs
- Add loading states
- Update README
- Git tag `v1.0-mvp`

### Week 1: Final Submission (Days 2-7)

**Day 2: Additional Shapes**
- Rectangle, circle primitives
- Shape creation toolbar
- Shape-specific properties

**Day 3: Connectors & Lines**
- Line drawing tool
- Snap to objects
- Arrow heads

**Day 4: Transforms & Selection**
- Multi-select (Shift+click)
- Resize handles
- Rotation
- Delete/duplicate

**Day 5: AI Agent (Core)**
- Next.js API route setup
- Claude integration
- Basic commands (create, move)
- Real-time sync of AI actions

**Day 6: AI Agent (Advanced)**
- Complex commands (SWOT, flowchart)
- Layout algorithms (grid, distribute)
- Error handling
- Streaming responses

**Day 7: Polish & TypeScript**
- Migrate to TypeScript
- Bug fixes
- Performance optimization
- Documentation
- Git tag `v2.0-final`

---

## Success Metrics

### MVP Success Criteria
- ✅ 2+ users can collaborate simultaneously
- ✅ Changes sync within 100ms
- ✅ Board survives page refresh (persisted)
- ✅ Deployed to public URL
- ✅ Auth works (Google sign-in)
- ✅ No data loss on disconnect/reconnect

### Final Submission Success Criteria
- ✅ 5+ concurrent users with smooth collaboration
- ✅ 500+ objects with no performance degradation
- ✅ AI agent completes 6+ distinct command types
- ✅ All shapes/transforms working
- ✅ Professional UI/UX
- ✅ TypeScript migration complete

### Performance Benchmarks
- **Sync latency**: <100ms (target: 50ms)
- **AI response**: <2s for single-step commands
- **Initial load**: <3s
- **Frame rate**: 60fps during interactions

---

## Appendix A: CRDT Considerations & Future Migration Path

### Reference Article
**"An Interactive Intro to CRDTs"** by Jake Lazaroff  
🔗 https://jakelazaroff.com/words/an-interactive-intro-to-crdts/

### What are CRDTs?

**Conflict-free Replicated Data Types** - data structures that:
- Can be updated independently on different peers
- Mathematically guaranteed to converge to same state
- Enable true peer-to-peer collaboration (no central server needed)

**Core interface:**
```typescript
interface CRDT<T, S> {
  value: T;      // App data
  state: S;      // Sync metadata
  merge(state: S): void;  // Conflict resolution
}
```

**Merge function must be:**
1. **Commutative**: `A ∨ B = B ∨ A` (order doesn't matter)
2. **Associative**: `(A ∨ B) ∨ C = A ∨ (B ∨ C)` (grouping doesn't matter)
3. **Idempotent**: `A ∨ A = A` (merging with self is safe)

### Key CRDT Concepts

**LWW (Last-Write-Wins) Register:**
- Simplest CRDT - holds single value
- Uses logical clocks (incrementing integers), not wall-clock time
- Ties broken by peer ID
- **This is what Firestore does** (server timestamp + last-write-wins)

**LWW Map:**
- Map of LWW Registers
- Each key merges independently (property-level conflict resolution)
- Composition: complex CRDTs built from primitive ones

**Tombstones:**
- Deleted items set to `null`, not removed
- Prevents confusing "deleted" with "never existed"
- CRDTs are monotonically increasing (state only grows)

### Why Firestore is "Good Enough" vs True CRDTs

**Firestore = Managed LWW with Central Server**

| Aspect | Firestore (LWW) | True CRDTs |
|--------|----------------|------------|
| **Conflict resolution** | Server timestamp wins (document-level) | Logical clocks + peer ID (property-level) |
| **Offline editing** | Queued, merged on reconnect | Full peer-to-peer merge |
| **Central server** | Required | Optional (can be P2P) |
| **Complexity** | Low (managed) | High (you implement merge) |
| **Data growth** | Manageable | Monotonic (needs GC) |
| **Setup time** | 1 hour | 1-2 weeks (with library) |

### When Firestore LWW Falls Short

**Scenario 1: Simultaneous property edits**
```
Problem:
  User A changes sticky color to red at t=1
  User B moves same sticky to (200,200) at t=2
  → Firestore: B's entire object wins, A's color change LOST

CRDT solution:
  Color property and position property merge independently
  → Both changes preserved
```

**Scenario 2: Text editing**
```
Problem:
  Two users edit sticky note text simultaneously
  → Firestore: Last write wins, one user's edit lost

CRDT solution (Yjs):
  Character-level merging
  → Both edits intelligently merged
```

**Scenario 3: Offline-first / P2P**
```
Problem:
  No internet = no collaboration

CRDT solution:
  Peers connect directly (WebRTC)
  Work offline, sync when reconnected
```

### CRDT Migration Plan (If Needed)

**Phase 1: CRDT-Friendly Patterns** (Implement Now)

Make Firestore writes more CRDT-compatible:

```javascript
// ❌ Current: Document-level updates
updateObject(objectId, {x: 100, y: 200, color: 'red'})

// ✅ Better: Property-level updates
updateObjectProperty(objectId, 'x', 100)
updateObjectProperty(objectId, 'y', 200) 
updateObjectProperty(objectId, 'color', 'red')

// ✅ Add logical clocks per peer
const update = {
  peerId: currentUserId,
  timestamp: localTimestamp++,
  property: 'x',
  value: 100
}
```

**Benefits:**
- Better Firestore performance (smaller writes)
- Easier future CRDT migration
- Property-level conflict tracking

**Phase 2: CRDT Abstraction Layer** (Post-Launch, 4-6 hours)

Wrap Firestore in CRDT-like interface:

```javascript
class CollabWhiteboard {
  #localClock = 0;
  #peerId = generatePeerId();
  
  updateObject(objectId, property, value) {
    const state = [this.#peerId, this.#localClock++, value];
    
    // Still writes to Firestore
    firestore.doc(`objects/${objectId}`).update({
      [property]: value,
      [`_meta.${property}`]: state  // CRDT metadata
    });
  }
  
  merge(remoteState) {
    // Implement LWW merge logic locally
    // Update UI
  }
}
```

**Phase 3: True P2P CRDTs** (If Needed, 1-2 weeks)

**Option A: Use Library (Recommended)**

1. **Yjs** - Most popular, great for text
   ```javascript
   import * as Y from 'yjs'
   import { WebrtcProvider } from 'y-webrtc'
   
   const doc = new Y.Doc()
   const objects = doc.getMap('objects')
   const provider = new WebrtcProvider('boardId', doc)
   ```

2. **Automerge** - Simpler API, good for objects
   ```javascript
   import * as Automerge from '@automerge/automerge'
   
   let doc = Automerge.init()
   doc = Automerge.change(doc, d => {
     d.objects['sticky-1'] = {x: 100, y: 200}
   })
   ```

3. **Liveblocks** - Commercial, easiest ($$)

**Option B: Custom Implementation** (Educational)

Build LWW Map from scratch:

```javascript
class LWWRegister {
  constructor(id, state = [id, 0, null]) {
    this.id = id;
    this.state = state;  // [peerId, timestamp, value]
  }
  
  get value() { return this.state[2]; }
  
  set(value) {
    this.state = [this.id, this.state[1] + 1, value];
  }
  
  merge(remote) {
    const [remotePeer, remoteTime] = remote;
    const [localPeer, localTime] = this.state;
    
    if (localTime > remoteTime) return;
    if (localTime === remoteTime && localPeer > remotePeer) return;
    
    this.state = remote;
  }
}

class LWWMap {
  #data = new Map();
  
  set(key, value) {
    const register = this.#data.get(key) || new LWWRegister(this.id);
    register.set(value);
    this.#data.set(key, register);
  }
  
  merge(remoteState) {
    for (const [key, remoteRegister] of Object.entries(remoteState)) {
      const local = this.#data.get(key);
      if (local) local.merge(remoteRegister);
      else this.#data.set(key, new LWWRegister(this.id, remoteRegister));
    }
  }
}
```

### Migration Effort Estimates

| Approach | Effort | When to Use |
|----------|--------|-------------|
| **Phase 1: CRDT patterns** | 2-4 hours | Do now (better Firestore perf) |
| **Phase 2: Abstraction** | 4-6 hours | Post-launch if conflicts increase |
| **Phase 3a: Yjs** | 1-2 weeks | Need text editing features |
| **Phase 3b: Automerge** | 1-2 weeks | Need P2P, no text editing |
| **Phase 3c: Custom** | 2-3 weeks | Learning project |

### Decision: When to Migrate to CRDTs

**Stay with Firestore if:**
- ✅ Property-level conflicts are rare
- ✅ Last-write-wins is acceptable UX
- ✅ Cost under control (<$500/month)
- ✅ Central server is fine

**Migrate to CRDTs if:**
- ⚠️ Users frequently lose edits
- ⚠️ Adding text editing (need character-level merge)
- ⚠️ Need offline-first
- ⚠️ Want peer-to-peer (no server)
- ⚠️ Firestore costs prohibitive

### Further Reading

- **Building a Collaborative Pixel Art Editor with CRDTs**  
  https://jakelazaroff.com/words/building-a-collaborative-pixel-art-editor-with-crdts/

- **Making CRDTs 98% More Efficient**  
  https://jakelazaroff.com/words/making-crdts-98-percent-more-efficient/

- **CRDTs: The Hard Parts** (Martin Kleppmann)  
  https://youtu.be/x7drE24geUw

- **Local-first Software**  
  https://www.inkandswitch.com/local-first/

---

## Appendix B: Alternative Technologies Considered

### Canvas Libraries

| Technology | Pros | Cons | Decision |
|-----------|------|------|----------|
| **Konva.js** | Battle-tested for whiteboards, layer system, good events | Slightly larger bundle | ✅ SELECTED |
| Fabric.js | Similar features | Less active development | ❌ |
| PixiJS | Extremely fast (WebGL) | Overkill (game engine) | ❌ |
| Plain Canvas | No dependencies | Must implement everything | ❌ |

### Real-time Sync

| Technology | Pros | Cons | Decision |
|-----------|------|------|----------|
| **Firebase Firestore** | Zero infrastructure, built-in listeners, fast setup | Vendor lock-in, cost at scale | ✅ SELECTED |
| Supabase | Open source, better cost | Less mature realtime | ❌ Consider later |
| Liveblocks | Purpose-built for collaboration | Expensive | ❌ |
| Socket.io + Redis | Popular, performant | Must build server | ❌ |
| Custom WebSocket | Full control | 8-12 hour setup time | ❌ |

### Frontend Framework

| Technology | Pros | Cons | Decision |
|-----------|------|------|----------|
| **React (Vite)** | Team familiar, fast dev, simple | No SSR | ✅ MVP |
| **Next.js 14** | SSR, API routes, production patterns | More complex | ✅ Final |
| Vue.js | Simpler than React | Smaller ecosystem | ❌ |
| Svelte | Smaller bundle | Less Canvas support | ❌ |

### State Management

| Technology | Pros | Cons | Decision |
|-----------|------|------|----------|
| **React Context** | Built-in, simple | Can get messy | ✅ MVP |
| **Zustand** | Clean API, better at scale | Extra dependency | ✅ Final |
| Redux Toolkit | Powerful, well-documented | Overkill, boilerplate | ❌ |

---

## Document Metadata

**Author**: [Your Name]  
**Status**: ✅ APPROVED - Ready for Implementation  
**Last Updated**: February 16, 2026  
**Next Review**: Post-MVP (Day 2)  
**Git Tag**: Pre-implementation baseline

---

## Constraints Summary

### Timeline Constraints
- **MVP deadline**: 24 hours from start
- **Final deadline**: 7 days total
- **One-time project**: No long-term maintenance planned

### Budget Constraints
- **MVP**: $0 (free tier only)
- **Final**: $0-50/month maximum
- **Must stay within Firebase free tier** for MVP testing

### Technical Constraints
- **Browser support**: Modern browsers only (Chrome, Firefox, Safari, Edge)
- **No mobile optimization** (desktop web app only for MVP)
- **Internet required**: No offline mode for MVP
- **Google account required**: For authentication

### Scale Constraints
- **MVP**: 2-5 concurrent users per board
- **Final**: Up to 100 concurrent users per board
- **Performance target**: <100ms sync latency
- **Object limit**: 500+ objects per board without degradation

---

## Approval Checklist

- ✅ **Project context discovered**: Scale, budget, timeline, constraints defined
- ✅ **Technology choices made**: All major decisions documented with reasoning
- ✅ **Trade-offs analyzed**: Pros/cons for each alternative considered
- ✅ **Data model designed**: Firestore structure defined
- ✅ **Conflict resolution strategy**: LWW approach documented with limitations
- ✅ **Risk mitigation planned**: Top 5 risks identified with mitigation strategies
- ✅ **Implementation roadmap**: Hour-by-hour plan for MVP, day-by-day for final
- ✅ **Success metrics defined**: Clear acceptance criteria
- ✅ **Migration paths identified**: Future scalability options documented

**This document satisfies all Pre-Search requirements and is approved for implementation.**