const MAX_INPUT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const MAX_TOOL_CALLS = 30;

// In-memory sliding window per user
const requestLog = new Map<string, number[]>();

export function sanitizeInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return trimmed.slice(0, MAX_INPUT_LENGTH);
  }
  return trimmed;
}

export function checkRateLimit(userId: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const timestamps = requestLog.get(userId) ?? [];

  // Evict entries outside the window
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (valid.length >= RATE_LIMIT_MAX) {
    requestLog.set(userId, valid);
    const oldestValid = valid[0]!;
    const waitSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldestValid)) / 1000);
    return {
      allowed: false,
      message: `Rate limit reached (${RATE_LIMIT_MAX} requests/minute). Try again in ${waitSec}s.`,
    };
  }

  valid.push(now);
  requestLog.set(userId, valid);
  return { allowed: true };
}

export function validateActionCount(count: number): { allowed: boolean; message?: string } {
  if (count > MAX_TOOL_CALLS) {
    return {
      allowed: false,
      message: `Too many actions (${count}). Maximum is ${MAX_TOOL_CALLS} per request.`,
    };
  }
  return { allowed: true };
}
