# Plan: Centralize Langfuse tracing in apiClient

## Context
Currently, Langfuse `trace?.generation()` calls are scattered across `pipeline.ts` at each `callAnthropic` call site, and they **hardcode `'claude-sonnet-4-6'`** even when the actual call uses Haiku (the default). This means Haiku calls are either untraced or mis-labeled. We need every API call traced with the correct model.

## Approach
Move tracing into `callAnthropic` itself so it's automatic and always correct.

### Changes

**`src/agent/apiClient.ts`**
1. Import `AgentTrace` type from `./observability`
2. Add optional `trace?: AgentTrace | null` and `generationName?: string` to the options parameter
3. After the API call succeeds, call `trace?.generation(generationName, { model, input: messages, output: response.content, usage: response.usage, metadata: { duration_ms } })` automatically
4. Return the response as before

**`src/agent/pipeline.ts`**
1. Pass `trace` and a descriptive `generationName` (e.g. `'ingestion_call'`, `'follow_up_call'`, `'planner_call'`, `'planner_retry_call'`) into each `callAnthropic` call via options
2. Remove all manual `trace?.generation(...)` calls (lines ~116-122, ~168-174, ~285-291, ~309-314)

This ensures:
- Every API call is traced (no manual step to forget)
- The model field always matches what was actually used
- Haiku calls (ingestion, follow-up) are correctly labeled
- Planner Sonnet calls remain correctly labeled

## Verification
- `npm run typecheck` (or `npx tsc --noEmit`)
- Grep for any remaining `trace?.generation` in pipeline.ts (should be zero)
- Confirm no `'claude-sonnet-4-6'` hardcoded strings remain in pipeline.ts
