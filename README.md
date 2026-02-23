# CollabBoard

Real-time collaborative whiteboard with an AI agent, built for [Gauntlet AI](https://gauntletai.com) Week 1.

**Live demo**: [collabboard.vercel.app](https://collabboard.vercel.app)

## Features

- **Real-time multiplayer** — See other users' cursors and edits instantly via Yjs CRDT + WebRTC (peer-to-peer, no server relay)
- **AI agent** — Natural language commands to create, move, and manipulate objects ("Create a SWOT analysis", "Move all pink stickies to the right")
- **Infinite canvas** — Pan and zoom with smooth performance at 100+ objects
- **Rich objects** — Sticky notes, rectangles, circles, lines, arrows, frames (grouping containers)
- **Google authentication** — Firebase Auth with per-board access control
- **Shareable boards** — URL-based board sharing with real-time presence

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Canvas | Konva.js + react-konva |
| Real-time sync | Yjs CRDT + y-webrtc (peer-to-peer) |
| Auth & DB | Firebase (Auth + Firestore) |
| AI Agent | Anthropic Claude (Haiku router + Sonnet planner) |
| Observability | Langfuse (agent tracing) |
| Hosting | Vercel (frontend) + Fly.io (WebRTC signaling) |

## Architecture

The app uses a **CRDT-first** architecture — Yjs documents are the source of truth, synced peer-to-peer via WebRTC. Firebase stores board metadata and auth; the canvas state lives entirely in Yjs.

The AI agent uses a two-tier LLM pipeline:
1. **Haiku** routes commands (direct execution vs. planner delegation vs. clarification)
2. **Sonnet** handles complex commands requiring world knowledge or multi-object layouts

See [`final_submission/PRE-SEARCH.md`](final_submission/PRE-SEARCH.md) for the full architecture document.

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Auth + Firestore enabled

### Setup

```bash
npm install
cp .env.example .env
# Fill in Firebase credentials in .env (see .env.example for all required vars)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

The app requires Firebase config and optionally an Anthropic API key for the AI agent. See `.env.example` for the full list.

- `npm run dev` reads `.env`
- Vercel builds read `.env.production` + Vercel project env vars

## AI Agent Commands

The agent understands natural language. Examples:

- "Create a retrospective board with three columns"
- "Add a yellow sticky that says 'Great teamwork' to What Went Well"
- "Move all pink stickies to the right"
- "Create a SWOT analysis for a coffee shop"
- "Delete all circles"

## Deployment

**Frontend**: Deploy to Vercel — set Firebase env vars in the Vercel dashboard, then `vercel --prod`.

**Signaling server**: The WebRTC signaling server runs on Fly.io. See [`planning_docs/DEPLOYMENT.md`](planning_docs/DEPLOYMENT.md) for full deployment instructions.

## Submission Documents

- [`final_submission/PRE-SEARCH.md`](final_submission/PRE-SEARCH.md) — Architecture pre-search document
- [`final_submission/AI-DEVELOPMENT-LOG.md`](final_submission/AI-DEVELOPMENT-LOG.md) — AI tools, prompts, and learnings
- [`final_submission/AI-COST-ANALYSIS.md`](final_submission/AI-COST-ANALYSIS.md) — Dev costs + production projections