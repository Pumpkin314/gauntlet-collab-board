import type { AgentMessage, AgentToolCall, ViewportCenter } from './types';
import type { BoardObject, ShapeType } from '../types/board';
import { sanitizeInput, checkRateLimit, validateActionCount } from './guardrails';
import { buildSystemPrompt } from './systemPrompt';
import { buildPlannerPrompt } from './plannerPrompt';
import { callAnthropic } from './apiClient';
import { TOOL_DEFINITIONS, TOOL_SCHEMAS } from './tools';
import { executeToolCalls } from './executor';
import { resolveObjects } from './objectResolver';
import type { BoardStateFilter } from './objectResolver';

interface BoardActions {
  createObject(type: ShapeType, x: number, y: number, overrides?: Partial<BoardObject>): string;
  updateObject(id: string, updates: Partial<BoardObject>): void;
  deleteObject(id: string): void;
  batchCreate(items: Array<{ type: ShapeType; x: number; y: number } & Partial<BoardObject>>): string[];
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

function makeId(): string {
  return crypto.randomUUID();
}

/** Extract tool calls and text from an Anthropic response. */
function parseResponse(response: { content: Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }> }) {
  const toolCalls: AgentToolCall[] = [];
  let textContent = '';

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.id && block.name && block.input) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    } else if (block.type === 'text' && block.text) {
      textContent += block.text;
    }
  }

  return { toolCalls, textContent };
}

/**
 * Run the full agent pipeline: sanitize → rate-limit → LLM call → validate → execute.
 * Supports multi-turn: if the LLM calls requestBoardState, we resolve it and
 * make a second LLM call with the results (capped at 2 round-trips).
 */
export async function runAgentCommand(
  input: string,
  actions: BoardActions,
  userId: string,
  viewportCenter: ViewportCenter,
  conversationHistory: ConversationMessage[] = [],
  getAllObjects?: () => BoardObject[],
): Promise<AgentMessage[]> {
  const t0 = performance.now();
  const messages: AgentMessage[] = [];

  // 1. Sanitize input
  const sanitized = sanitizeInput(input);
  if (!sanitized) {
    messages.push({ id: makeId(), role: 'error', content: 'Please enter a message.', timestamp: Date.now() });
    return messages;
  }

  // 2. Rate limit
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    messages.push({ id: makeId(), role: 'error', content: rateCheck.message!, timestamp: Date.now() });
    return messages;
  }

  // 3. Build prompt + call API
  const systemPrompt = buildSystemPrompt(viewportCenter);

  const recentHistory = conversationHistory.slice(-20);
  const apiMessages: ConversationMessage[] = [
    ...recentHistory,
    { role: 'user', content: sanitized },
  ];

  let response;
  try {
    const t1 = performance.now();
    response = await callAnthropic(apiMessages, TOOL_DEFINITIONS, systemPrompt);
    console.debug(`[Boardie] LLM call #1: ${Math.round(performance.now() - t1)}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    messages.push({ id: makeId(), role: 'error', content: msg, timestamp: Date.now() });
    return messages;
  }

  // 4. Parse tool calls from response
  let { toolCalls, textContent } = parseResponse(response);

  // 5. Check for requestBoardState → multi-turn
  const boardStateCall = toolCalls.find((tc) => tc.name === 'requestBoardState');
  if (boardStateCall && getAllObjects) {
    const filter = boardStateCall.input as BoardStateFilter;
    const allObjects = getAllObjects();
    const resolved = resolveObjects(allObjects, filter);

    console.debug(`[Boardie] requestBoardState: ${resolved.length}/${allObjects.length} objects matched`);

    // Build multi-turn messages: original + assistant tool_use + tool_result
    const multiTurnMessages: ConversationMessage[] = [
      ...apiMessages,
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: boardStateCall.id,
          content: JSON.stringify(resolved),
        }],
      },
    ];

    // Second LLM call
    try {
      const t2 = performance.now();
      const response2 = await callAnthropic(multiTurnMessages, TOOL_DEFINITIONS, systemPrompt);
      console.debug(`[Boardie] LLM call #2: ${Math.round(performance.now() - t2)}ms`);

      const parsed2 = parseResponse(response2);
      // Replace with second call's results (the first call only had the state query)
      toolCalls = parsed2.toolCalls;
      textContent = parsed2.textContent;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({ id: makeId(), role: 'error', content: msg, timestamp: Date.now() });
      return messages;
    }
  }

  // 5b. Check for delegateToPlanner → single Sonnet call returning JSON plan
  const PLANNER_MAX_TOKENS = 16_000; // token ceiling for the planner response

  const plannerCallIdx = toolCalls.findIndex((tc) => tc.name === 'delegateToPlanner');
  if (plannerCallIdx !== -1) {
    const plannerCall = toolCalls[plannerCallIdx]!;
    const description = plannerCall.input.description as string;
    const boardCtx    = plannerCall.input.board_context as string | undefined;

    const plannerSystem   = buildPlannerPrompt(viewportCenter);
    const plannerUserText = boardCtx
      ? `${description}\n\nExisting board context:\n${boardCtx}`
      : description;

    /** Parse Sonnet's text response into AgentToolCalls, validating each with TOOL_SCHEMAS. */
    const parsePlannerJSON = (text: string): { calls: AgentToolCall[]; errors: string[] } => {
      const calls: AgentToolCall[] = [];
      const errors: string[] = [];

      let parsed: unknown;
      try {
        // Strip accidental markdown fences if Sonnet adds them despite instructions
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        parsed = JSON.parse(cleaned);
      } catch {
        errors.push(`JSON parse failed: ${text.slice(0, 200)}`);
        return { calls, errors };
      }

      if (!Array.isArray(parsed)) {
        errors.push('Planner response was not a JSON array');
        return { calls, errors };
      }

      for (const item of parsed) {
        if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
          errors.push(`Skipped invalid item: ${JSON.stringify(item).slice(0, 80)}`);
          continue;
        }
        const { name, input } = item as { name: string; input: unknown };
        const schema = TOOL_SCHEMAS[name];
        if (!schema) {
          errors.push(`Unknown tool: ${name}`);
          continue;
        }
        const result = schema.safeParse(input ?? {});
        if (!result.success) {
          errors.push(`Validation failed for ${name}: ${result.error.message}`);
          continue;
        }
        calls.push({ id: makeId(), name, input: result.data as Record<string, unknown> });
      }

      return { calls, errors };
    };

    try {
      const tP = performance.now();
      const resp = await callAnthropic(
        [{ role: 'user', content: plannerUserText }],
        [], // no tools — Sonnet outputs JSON text, not tool_use blocks
        plannerSystem,
        { model: 'claude-sonnet-4-6', maxTokens: PLANNER_MAX_TOKENS, timeoutMs: 30_000 },
      );

      const rawText = resp.content.find((b) => b.type === 'text')?.text ?? '';
      console.debug(`[Boardie] Planner call: ${Math.round(performance.now() - tP)}ms, ${resp.usage.input_tokens + resp.usage.output_tokens} tokens`);

      let { calls: plannerCalls, errors: parseErrors } = parsePlannerJSON(rawText);

      // Retry once if parsing failed or nothing came back
      if (plannerCalls.length === 0) {
        const retryResp = await callAnthropic(
          [
            { role: 'user', content: plannerUserText },
            { role: 'assistant', content: rawText || '[]' },
            { role: 'user', content: 'Your response was not a valid JSON array of tool calls. Output ONLY the raw JSON array, no explanation.' },
          ],
          [],
          plannerSystem,
          { model: 'claude-sonnet-4-6', maxTokens: PLANNER_MAX_TOKENS, timeoutMs: 30_000 },
        );
        const retryText = retryResp.content.find((b) => b.type === 'text')?.text ?? '';
        ({ calls: plannerCalls, errors: parseErrors } = parsePlannerJSON(retryText));
      }

      if (parseErrors.length > 0) {
        console.warn('[Boardie] Planner parse warnings:', parseErrors);
      }

      // Replace the delegateToPlanner entry with everything Sonnet planned
      toolCalls = [
        ...toolCalls.slice(0, plannerCallIdx),
        ...plannerCalls,
        ...toolCalls.slice(plannerCallIdx + 1),
      ];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      messages.push({ id: makeId(), role: 'error', content: `Planner error: ${msg}`, timestamp: Date.now() });
      return messages;
    }
  }

  // Filter out any leftover meta calls (shouldn't be executed)
  const executableCalls = toolCalls.filter(
    (tc) => tc.name !== 'requestBoardState' && tc.name !== 'delegateToPlanner',
  );

  // 6. Validate action count
  const actionCheck = validateActionCount(executableCalls.length);
  if (!actionCheck.allowed) {
    messages.push({ id: makeId(), role: 'error', content: actionCheck.message!, timestamp: Date.now() });
    return messages;
  }

  // 7. Execute tool calls
  if (executableCalls.length > 0) {
    const t3 = performance.now();
    const { results, agentMessages } = executeToolCalls(executableCalls, actions, viewportCenter);
    console.debug(`[Boardie] Execution: ${Math.round(performance.now() - t3)}ms`);

    for (const msg of agentMessages) {
      messages.push({ id: makeId(), role: 'agent', content: msg, timestamp: Date.now() });
    }

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      const failMsg = failures.map((f) => f.error).join('; ');
      messages.push({ id: makeId(), role: 'error', content: `Some actions failed: ${failMsg}`, timestamp: Date.now() });
    }

    const successes = results.filter((r) => r.success && r.objectId);
    if (successes.length > 0 && agentMessages.length === 0) {
      const noun = successes.length === 1 ? 'object' : 'objects';
      messages.push({
        id: makeId(),
        role: 'status',
        content: `Done — ${successes.length} ${noun} updated.`,
        timestamp: Date.now(),
      });
    }
  }

  // 8. Add any text content from the LLM
  if (textContent.trim()) {
    messages.push({ id: makeId(), role: 'agent', content: textContent.trim(), timestamp: Date.now() });
  }

  if (messages.length === 0) {
    messages.push({ id: makeId(), role: 'agent', content: "I processed your request but didn't generate any output.", timestamp: Date.now() });
  }

  console.debug(`[Boardie] Total pipeline: ${Math.round(performance.now() - t0)}ms`);
  return messages;
}
