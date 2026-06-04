import { randomBytes } from 'node:crypto';

/** Build an OpenAI `chat.completion` response object from plain text + usage. */
export function toOpenAIChatCompletion(
  text: string,
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): Record<string, unknown> {
  const pt = promptTokens ?? 0;
  const ct = completionTokens ?? 0;
  return {
    id: `chatcmpl-${randomBytes(12).toString('hex')}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct },
  };
}

/** Extract token usage from an OpenAI response body (JSON or SSE stream). */
export function extractOpenAIUsage(text: string): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('data:')) line = line.slice(5).trim();
    if (line === '[DONE]') continue;
    try {
      const obj = JSON.parse(line) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const usage = obj.usage;
      if (
        usage &&
        (typeof usage.prompt_tokens === 'number' || typeof usage.completion_tokens === 'number')
      ) {
        return {
          promptTokens: usage.prompt_tokens ?? null,
          completionTokens: usage.completion_tokens ?? null,
        };
      }
    } catch {
      // not JSON; keep scanning
    }
  }
  return { promptTokens: null, completionTokens: null };
}

interface OpenAIMessage {
  role: string;
  content: unknown;
}

/** Split OpenAI chat messages into a system prompt + user/assistant turns. */
export function splitMessages(messages: OpenAIMessage[] | undefined): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const list = Array.isArray(messages) ? messages : [];
  const system = list
    .filter((m) => m.role === 'system')
    .map((m) => String(m.content ?? ''))
    .join('\n');
  const turns = list
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content ?? ''),
    }));
  return { system: system || undefined, turns };
}
