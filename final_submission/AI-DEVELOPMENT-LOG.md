# AI Development Log — CollabBoard

## Tools & Workflow

| Tool | Role |
|------|------|
| **Claude Code (Opus)** | Primary dev tool — planning, architecture, multi-file implementation |
| **Claude Code (Haiku)** | Fast execution of well-scoped tasks |
| **Claude.ai (web)** | Architecture planning in parallel with CC (agent pipeline, deployment) |
| **Codex (OpenAI)** | Plan review, implementation cross-check |
| **Gemini** | Exploration and comparison |
| **Anthropic API (direct)** | Integrated into the app's AI agent pipeline (Haiku as router, Sonnet as planner) |

## MCP Usage

**`ide - getDiagnostics`**: MCP bridge between the Claude Code terminal and VS Code. Let Claude see the IDE's Problems tab (errors, warnings, hints) in real-time, enabling it to self-correct without manual copy-paste of diagnostics.

## Effective Prompts (3 Key Examples)

### 1. Performance Methodical Breakdown (Inflection Point)

> *"This codebase is a colab board... FPS tanks to 75% even with 5 shapes. Here's ideas from peers: batching draw calls, debouncing mouse events. Let's work together to plan a methodical breakdown of every potential contributor to latency. The goal is to handle 1000 objects. Ask me clarifying questions."*

**Why it mattered**: This was the inflection point — shifting from "ask AI to code" to "deeply plan features before writing code." Incorporated peer advice, set a concrete target, and asked for collaborative planning rather than code output. Result: a 6-phase performance plan that took FPS from 75% at 5 objects to 60 FPS at 100+ objects.

### 2. Agent Architecture Planning (Most Sophisticated)

> *"My task is to build a thorough plan for an agent... break down user request into semantically distinct queries... different category buckets... relatively deterministic patterns... final orchestration tool... Docker containerize, ensure observability using Langsmith or Langfuse... Does my formulation make sense? Suggest fixes, upgrades, your own ideas."*

**Why it mattered**: Multi-step pipeline design with prompt injection guardrails, semantic bucketing, deterministic component patterns, and observability. Asked AI to *critique* rather than just execute. Led to a Haiku-router + Sonnet-planner architecture with Langfuse tracing that handled 26+ traced commands in production.

### 3. Phase Handover Prompt (Became Standard Workflow)

> *"We completed phases 0 and 1... Key context from Phase 1: BoardContext was split into BoardDataContext + BoardActionsContext... Phase 1 hit both render targets but FPS targets need Phase 2's culling... Use .claude/context/ docs to understand the codebase."*

**Why it mattered**: Precise "what's done / what needs doing" structure with measured results, root causes, and file pointers. This template was reused for every subsequent phase handover. Solved the multi-session context continuity problem.

## Code Analysis

- **~99.9% AI-generated** code by line count
- **~0.1% hand-written** (config tweaks, manual debugging)
- Human value was in **planning, architecture, prompt engineering, and quality control** — not line-by-line coding

## Strengths & Limitations

**Where AI excelled**: Rapid implementation once given a clear plan. Boilerplate, CRUD, component scaffolding, test writing. Translating well-specified architecture into code across many files simultaneously.

**Where AI struggled**: Without careful planning, AI played whack-a-mole with bugs — fixing one thing, breaking another. Made poor architectural decisions when given vague direction. Struggled to manage its own context window without structured prompts. Performance optimization required human analysis (Chrome profiler) to find real bottlenecks — AI's guesses were often wrong.

## Key Learnings

1. **Planning > prompting** — The quality of the plan/spec matters 10x more than clever prompting. The inflection point was shifting from "ask AI to code" to "deeply plan features in a markdown doc, iterate on it with AI, then execute."

2. **Context is everything** — Learning to manage what context AI has (handover prompts, repomix snapshots, CLAUDE.md) was the real skill. Bad context = bad output regardless of model quality.

3. **AI as design partner** — The shift from "AI writes my code" to "AI and I design together, then it implements" was transformative. Asking AI to critique plans, find vulnerabilities, and suggest alternatives.

4. **Trust but verify** — AI code works most of the time, but subtle issues (perf regressions, stale closures, identity bugs) require profiling and testing. Non-negotiable.

5. **Parallel CLI workflows** — In later stages, ran multiple Claude Code terminals simultaneously: one executing the current sprint's PR, others planning ahead for the next sprint. Kept branches isolated to avoid cross-pollination.
