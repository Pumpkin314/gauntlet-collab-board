import type { AgentMessage, AgentToolCall, ViewportCenter } from './types';
import type { BoardObject, ShapeType } from '../types/board';
import { sanitizeInput, checkRateLimit, validateActionCount } from './guardrails';
import { buildSystemPrompt } from './systemPrompt';
import { callAnthropic } from './apiClient';
import { TOOL_DEFINITIONS } from './tools';
import { executeToolCalls } from './executor';

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

/**
 * Run the full agent pipeline: sanitize → rate-limit → LLM call → validate → execute.
 * Returns messages to display in the chat widget.
 */
export async function runAgentCommand(
  input: string,
  actions: BoardActions,
  userId: string,
  viewportCenter: ViewportCenter,
  conversationHistory: ConversationMessage[] = [],
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

  // Only send last 10 turns (20 messages) for context window management
  const recentHistory = conversationHistory.slice(-20);
  const apiMessages: ConversationMessage[] = [
    ...recentHistory,
    { role: 'user', content: sanitized },
  ];

  let response;
  try {
    const t1 = performance.now();
    response = await callAnthropic(apiMessages, TOOL_DEFINITIONS, systemPrompt);
    console.debug(`[Boardie] LLM call: ${Math.round(performance.now() - t1)}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    messages.push({ id: makeId(), role: 'error', content: msg, timestamp: Date.now() });
    return messages;
  }

  // 4. Parse tool calls from response
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

  // 5. Validate action count
  const actionCheck = validateActionCount(toolCalls.length);
  if (!actionCheck.allowed) {
    messages.push({ id: makeId(), role: 'error', content: actionCheck.message!, timestamp: Date.now() });
    return messages;
  }

  // 6. Execute tool calls
  if (toolCalls.length > 0) {
    const t2 = performance.now();
    const { results, agentMessages } = executeToolCalls(toolCalls, actions, viewportCenter);
    console.debug(`[Boardie] Execution: ${Math.round(performance.now() - t2)}ms`);

    // Add conversational responses from tools
    for (const msg of agentMessages) {
      messages.push({ id: makeId(), role: 'agent', content: msg, timestamp: Date.now() });
    }

    // Report failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      const failMsg = failures.map((f) => f.error).join('; ');
      messages.push({ id: makeId(), role: 'error', content: `Some actions failed: ${failMsg}`, timestamp: Date.now() });
    }

    // Summary of successful mutations
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

  // 7. Add any text content from the LLM (non-tool response)
  if (textContent.trim()) {
    messages.push({ id: makeId(), role: 'agent', content: textContent.trim(), timestamp: Date.now() });
  }

  // If no messages were generated at all, add a fallback
  if (messages.length === 0) {
    messages.push({ id: makeId(), role: 'agent', content: "I processed your request but didn't generate any output.", timestamp: Date.now() });
  }

  console.debug(`[Boardie] Total pipeline: ${Math.round(performance.now() - t0)}ms`);
  return messages;
}
