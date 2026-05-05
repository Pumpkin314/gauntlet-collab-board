# Design Decisions Quick Reference

## Why Yjs over Automerge/ShareDB?
Smaller bundle (~100KB vs 500KB+), P2P-native (no central server), 24h MVP timeline.

## Why three-layer sync (Yjs + WebRTC + Firestore)?
Each serves a purpose: CRDT (conflict resolution), WebRTC (sub-10ms delivery), Firestore (persistence fallback). Graceful degradation if any layer fails.

## Why Konva over Fabric.js?
react-konva bindings, built-in Transformer nodes, layer system, better React integration.

## Why split BoardContext into Data + Actions?
Components using `useBoardActions()` get stable refs and never re-render on data changes. Critical for pan/drag performance.

## Why rewrite Explorer v1 → v2?
v1 let LLM control everything: stall-out bugs, node duplication, unreliable tool params. v2 uses deterministic state machine; LLM only for quiz generation + FR grading.

## Why pure function state machine (not xstate/useReducer)?
Trivially testable without React setup. Effects as data enable serialization and debugging. xstate is overkill for this size.

## Why student-driven exploration (no auto-spawn)?
Self-Determination Theory: autonomy predicts motivation. Cognitive Load Theory: auto-spawning overwhelms. Cap at 3 nodes + "+N more" badge.

## Why Red→Correct MC = Yellow (not Green)?
MC has lower signal (could be lucky guess). One more rep needed. FR with high LLM confidence → Green directly.

## Why deterministic content safety (no LLM)?
Zero latency, deterministic results. Wordlist + Flesch-Kincaid + URL guard. No false positives from AI classifiers.

## Why hide relatesTo edges?
284 edges would clutter the board. Only buildsTowards (prerequisite) edges are structural for learning paths.

## Why monolithic Canvas.tsx?
All pointer events reference shared state. Splitting requires excessive prop drilling. Clear mental model: Canvas = event loop.

## Why client-side API key?
MVP constraint. Production would need a backend proxy. Known tech debt.

## Why makeDiffSync()?
Yjs emits on every change including roundtrips. Without diffing, every update causes full React re-render cascade.

## Why bitmap caching for shapes?
Unselected shapes are static — single drawImage() instead of re-executing all draw commands. Cleared on selection for interactive editing.

## Why renderless cursors?
Cursor movement is 60fps+. React re-renders would thrash the component tree. RAF loop + direct Map reads + lerp = zero React overhead.
