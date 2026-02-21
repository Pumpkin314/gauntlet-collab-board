interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

interface AnthropicResponse {
  id: string;
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callAnthropic(
  messages: AnthropicMessage[],
  tools: unknown[],
  systemPrompt: string,
  options: { model?: string; maxTokens?: number; timeoutMs?: number } = {},
): Promise<AnthropicResponse> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing VITE_ANTHROPIC_API_KEY. Add it to your .env file to use Boardie.',
    );
  }

  if (import.meta.env.PROD) {
    console.warn('[Boardie] API key detected in production build — this is insecure.');
  }

  const model = options.model ?? 'claude-haiku-4-5-20251001';
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const body = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
    tools,
  };

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let response = await doFetch();

  // Retry once on 429 (rate limit) or 529 (overloaded)
  if (response.status === 429 || response.status === 529) {
    await new Promise((r) => setTimeout(r, 1000));
    response = await doFetch();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  return response.json();
}
