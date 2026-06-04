import type { IncomingHttpHeaders } from 'node:http';

// Hop-by-hop and sensitive headers that must not be forwarded upstream.
const STRIP_REQUEST = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'authorization', // the client's orchestrator credential — never leak to nodes
  'cookie',
]);

// Response headers we recompute ourselves while streaming.
const STRIP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding', // fetch already decoded the body
]);

export function filterRequestHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (STRIP_REQUEST.has(key.toLowerCase())) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

export function buildResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (STRIP_RESPONSE.has(key.toLowerCase())) return;
    out[key] = value;
  });
  return out;
}

/**
 * Extract token usage from an Ollama response body (streamed NDJSON or a single
 * JSON object). The final object carries `prompt_eval_count` / `eval_count`.
 */
export function extractOllamaUsage(text: string): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj.prompt_eval_count === 'number' || typeof obj.eval_count === 'number') {
        if (typeof obj.prompt_eval_count === 'number') promptTokens = obj.prompt_eval_count;
        if (typeof obj.eval_count === 'number') completionTokens = obj.eval_count;
        break;
      }
    } catch {
      // not a JSON line; keep scanning
    }
  }
  return { promptTokens, completionTokens };
}

/** Whether an available model name satisfies a requested one (tag-insensitive). */
export function modelMatches(available: string, requested: string): boolean {
  if (available === requested) return true;
  const a = available.split(':')[0];
  const r = requested.split(':')[0];
  return a === r;
}

/** Read only the tail of a web stream (token usage lives in the final object). */
export async function readTailWeb(
  stream: ReadableStream<Uint8Array>,
  maxTail = 65536,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let tail = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    tail += decoder.decode(value, { stream: true });
    if (tail.length > maxTail) tail = tail.slice(tail.length - maxTail);
  }
  tail += decoder.decode();
  return tail;
}

/** Read a (bounded) error body without throwing. */
export async function safeText(res: Response, max = 4096): Promise<string> {
  try {
    const t = await res.text();
    return t.length > max ? t.slice(0, max) : t;
  } catch {
    return '';
  }
}
