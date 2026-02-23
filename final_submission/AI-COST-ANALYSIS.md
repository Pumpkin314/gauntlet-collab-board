# AI Cost Analysis — CollabBoard

## Development & Testing Costs

| Item | Cost |
|------|------|
| Claude Code Max (1 week) | ~$200 |
| Codex (OpenAI) | ~$20 |
| Anthropic API (agent testing) | $1.55 |
| Firebase (free tier) | $0 |
| Vercel (free tier) | $0 |
| Fly.io (WebRTC signaling) | $0 (free tier) |
| Metered TURN server | $0 (free tier) |
| Langfuse (observability) | $0 (free tier) |
| **Total** | **~$221.55** |

## Production Tech Stack

- **Frontend hosting**: Vercel
- **Database/Auth**: Firebase (Firestore + Auth)
- **Real-time sync**: Yjs CRDT via WebRTC (peer-to-peer)
- **Signaling server**: Fly.io (WebRTC signaling for Yjs)
- **NAT traversal**: Metered TURN server (needed when P2P fails behind firewalls)
- **AI agent**: Anthropic API (Haiku router + Sonnet planner)
- **Observability**: Langfuse (agent tracing)

## User Population Model

80% students, 20% professionals:

| Segment | % | Sessions/week | AI cmds/session | Avg session |
|---------|---|---------------|-----------------|-------------|
| Casual students | 40% | 2 | 2 | 15 min |
| Active students | 30% | 5 | 5 | 30 min |
| Light professionals | 15% | 3 | 3 | 20 min |
| Power professionals | 10% | 8 | 8 | 45 min |
| Heavy power users | 5% | 12 | 15 | 60 min |

**Weighted avg**: ~3.8 sessions/week, ~4.3 AI commands/session = **~70 AI commands/user/month**

## Per-Command Cost (from Langfuse Traces, 26 Commands)

| Path | Avg Cost | Avg Tokens | Avg Latency | Count |
|------|----------|------------|-------------|-------|
| Direct (Haiku) | $0.028 | ~7.3K | ~3.2s | 8 |
| Planner (Haiku+Sonnet) | $0.075 | ~12.9K | ~30s | 6 |
| Clarification | $0.016 | ~5K | ~2s | 7 |
| Error | $0.017 | ~5K | varies | 4 |

**Weighted avg per command** (60% direct, 25% planner, 15% clarification): **~$0.038/command**

## Production Cost Projections

| Scale | AI API | Firebase | Fly.io | TURN | Vercel | Langfuse | **Total** |
|-------|--------|----------|--------|------|--------|----------|-----------|
| 100 users | $266/mo | $0 | $0 | $0 | $0 | $0 | **~$266/mo** |
| 1,000 users | $2,660/mo | $25/mo | $5/mo | $10/mo | $20/mo | $0 | **~$2,720/mo** |
| 10,000 users | $26,600/mo | $200/mo | $30/mo | $100/mo | $50/mo | $25/mo | **~$27,005/mo** |
| 100,000 users | $266,000/mo | $1,500/mo | $150/mo | $800/mo | $200/mo | $150/mo | **~$268,800/mo** |

## Cost Optimization Strategies

AI API dominates costs at scale (~99%). Key mitigations:

- **Prompt caching**: ~30% reduction on repeated system prompts
- **Response caching**: Cache identical/near-identical commands
- **Rate limiting**: Per-user command caps (e.g., 200/month free tier)
- **Model tiering**: Move simple commands (delete, move) to cheaper models
- **WebRTC P2P**: Sync traffic is free — no server relay for most users
- **TURN costs**: Scale with ~15-20% of users behind symmetric NATs only
