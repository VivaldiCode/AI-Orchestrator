/**
 * Rough token estimation for routing decisions. We deliberately avoid a
 * tokenizer dependency: ~4 characters per token is a solid cross-model
 * heuristic, and routing only needs a ballpark to pick a node whose context
 * window fits. A safety margin is applied on top by the caller.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

interface MessageLike {
  content?: unknown;
}

function contentChars(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    let chars = 0;
    for (const part of content) {
      if (part && typeof part === 'object') {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === 'string') chars += text.length;
      }
    }
    return chars;
  }
  return 0;
}

/**
 * Estimate prompt tokens for an Ollama or OpenAI request body (chat `messages`
 * or a `prompt`/`system`/`suffix`). Returns 0 when nothing measurable is found.
 */
export function estimateRequestTokens(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const b = body as Record<string, unknown>;
  let chars = 0;

  if (Array.isArray(b.messages)) {
    for (const message of b.messages as MessageLike[]) {
      if (message && typeof message === 'object') {
        chars += contentChars(message.content) + 8; // per-message role/format overhead
      }
    }
  }
  for (const key of ['prompt', 'system', 'suffix'] as const) {
    if (typeof b[key] === 'string') chars += (b[key] as string).length;
  }

  return Math.ceil(chars / 4);
}
