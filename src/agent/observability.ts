import { Langfuse } from 'langfuse';

const PUBLIC_KEY = import.meta.env.VITE_LANGFUSE_PUBLIC_KEY as string | undefined;
const SECRET_KEY = import.meta.env.VITE_LANGFUSE_SECRET_KEY as string | undefined;
const HOST = (import.meta.env.VITE_LANGFUSE_HOST as string) || 'https://cloud.langfuse.com';

let clientInstance: Langfuse | null = null;

function getClient(): Langfuse | null {
  if (!PUBLIC_KEY || !SECRET_KEY) return null;
  if (!clientInstance) {
    clientInstance = new Langfuse({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, baseUrl: HOST });
  }
  return clientInstance;
}

export interface AgentTrace {
  span(name: string, input?: unknown): SpanHandle;
  generation(name: string, opts: GenerationOpts): GenerationHandle;
  update(metadata: Record<string, unknown>): void;
}

interface SpanHandle {
  end(metadata?: Record<string, unknown>): void;
}

interface GenerationOpts {
  model: string;
  input?: unknown;
  output?: unknown;
  usage?: { input_tokens: number; output_tokens: number };
  metadata?: Record<string, unknown>;
}

interface GenerationHandle {
  end(overrides?: Partial<GenerationOpts>): void;
}

/**
 * Create a Langfuse trace for one agent command invocation.
 * Returns null when Langfuse is not configured — callers use optional chaining.
 */
export function createAgentTrace(userId: string, boardId?: string): AgentTrace | null {
  const client = getClient();
  if (!client) return null;

  const trace = client.trace({
    name: 'agent_command',
    userId,
    metadata: { boardId },
  });

  return {
    span(name, input) {
      const s = trace.span({ name, input });
      return {
        end(metadata) {
          s.end({ metadata });
        },
      };
    },

    generation(name, opts) {
      const g = trace.generation({
        name,
        model: opts.model,
        input: opts.input,
        output: opts.output,
        usage: opts.usage ? { input: opts.usage.input_tokens, output: opts.usage.output_tokens } : undefined,
        metadata: opts.metadata,
      });
      return {
        end(overrides) {
          g.end({
            output: overrides?.output,
            usage: overrides?.usage
              ? { input: overrides.usage.input_tokens, output: overrides.usage.output_tokens }
              : undefined,
            metadata: overrides?.metadata,
          });
        },
      };
    },

    update(metadata) {
      trace.update({ metadata });
    },
  };
}

/** Flush pending events — call on page unload or after pipeline completes. */
export async function flushTraces(): Promise<void> {
  const client = getClient();
  if (client) await client.shutdownAsync();
}
