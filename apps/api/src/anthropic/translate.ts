import { randomBytes } from 'node:crypto';

/**
 * Translation between the Anthropic Messages API (what Claude Code speaks) and
 * the OpenAI Chat Completions API (what local Ollama nodes + OpenAI-family
 * providers speak). Pure + dependency-free so it is exhaustively unit-testable.
 *
 * Covers: system prompt, multi-turn messages, text + image blocks, tools
 * (tool_use ⇄ tool_calls, tool_result ⇄ role:tool), tool_choice, sampling
 * params, non-streaming responses, and the stateful streaming translator
 * (OpenAI SSE → Anthropic SSE events) including tool-call argument streaming.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export function anthropicId(prefix: string): string {
  return prefix + randomBytes(16).toString('hex');
}

function systemToText(system: unknown): string {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Flatten Anthropic tool_result content (string | block[]) to text. */
function resultToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b.text === 'string' ? b.text : typeof b === 'string' ? b : ''))
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

/** OpenAI user content from non-tool_result Anthropic blocks (text + images). */
function userContent(blocks: Json[]): string | Json[] {
  const hasImage = blocks.some((b) => b.type === 'image');
  if (!hasImage) {
    return blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
  }
  return blocks.map((b) => {
    if (b.type === 'image' && b.source?.type === 'base64') {
      return {
        type: 'image_url',
        image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
      };
    }
    return { type: 'text', text: b.type === 'text' ? (b.text ?? '') : '' };
  });
}

/** Anthropic messages (+ system) → OpenAI chat messages. */
export function messagesToOpenAI(messages: Json[], system: unknown): Json[] {
  const out: Json[] = [];
  const sys = systemToText(system);
  if (sys) out.push({ role: 'system', content: sys });

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const content = msg.content;
    if (typeof content === 'string') {
      out.push({ role, content });
      continue;
    }
    const blocks: Json[] = Array.isArray(content) ? content : [];

    if (role === 'user') {
      // tool_result blocks become standalone OpenAI `tool` messages (they must
      // follow the assistant tool_calls, which is the preceding turn).
      for (const b of blocks.filter((x) => x.type === 'tool_result')) {
        out.push({
          role: 'tool',
          tool_call_id: b.tool_use_id,
          content: resultToText(b.content),
        });
      }
      const rest = blocks.filter((x) => x.type !== 'tool_result');
      if (rest.length) out.push({ role: 'user', content: userContent(rest) });
    } else {
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      const m: Json = { role: 'assistant', content: text || '' };
      if (toolUses.length) {
        m.tool_calls = toolUses.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
        }));
        if (!text) m.content = null;
      }
      out.push(m);
    }
  }
  return out;
}

function toolChoiceToOpenAI(tc: Json | undefined): unknown {
  if (!tc || typeof tc !== 'object') return undefined;
  if (tc.type === 'auto') return 'auto';
  if (tc.type === 'any') return 'required';
  if (tc.type === 'tool' && tc.name) return { type: 'function', function: { name: tc.name } };
  return undefined;
}

/** Anthropic /v1/messages body → OpenAI /v1/chat/completions body. */
export function anthropicToOpenAI(body: Json, targetModel: string): { payload: Json; stream: boolean } {
  const stream = body.stream === true;
  const payload: Json = {
    model: targetModel,
    messages: messagesToOpenAI(Array.isArray(body.messages) ? body.messages : [], body.system),
    stream,
  };
  if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;
  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.top_p === 'number') payload.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length) {
    payload.stop = body.stop_sequences;
  }
  if (Array.isArray(body.tools) && body.tools.length) {
    payload.tools = body.tools.map((t: Json) => ({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.input_schema ?? {} },
    }));
    const choice = toolChoiceToOpenAI(body.tool_choice);
    if (choice !== undefined) payload.tool_choice = choice;
  }
  if (stream) payload.stream_options = { include_usage: true };
  return { payload, stream };
}

export function mapStopReason(finish: unknown): string {
  switch (finish) {
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'end_turn';
    default:
      return 'end_turn';
  }
}

function safeParse(s: unknown): unknown {
  if (typeof s !== 'string' || s === '') return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Non-streaming OpenAI chat completion → Anthropic message response. */
export function openAIToAnthropic(json: Json, model: string): Json {
  const choice = json.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  const content: Json[] = [];
  if (typeof msg.content === 'string' && msg.content.length) {
    content.push({ type: 'text', text: msg.content });
  }
  for (const tc of msg.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: tc.id ?? anthropicId('toolu_'),
      name: tc.function?.name ?? '',
      input: safeParse(tc.function?.arguments),
    });
  }
  const usage = json.usage ?? {};
  return {
    id: anthropicId('msg_'),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
  };
}

/** Rough token estimate (~4 chars/token) for /v1/messages/count_tokens. */
export function estimateAnthropicTokens(body: Json): number {
  let chars = systemToText(body.system).length;
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    if (typeof m.content === 'string') chars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (typeof b.text === 'string') chars += b.text.length;
        else chars += JSON.stringify(b).length;
      }
    }
  }
  return Math.max(1, Math.ceil(chars / 4));
}

function sse(event: string, data: Json): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Stateful translator from an OpenAI SSE stream to Anthropic SSE events. Feed
 * `push(text)` with raw OpenAI SSE chunks; it returns the Anthropic event
 * string(s) to forward. Call `end()` once the upstream finishes. Handles a text
 * block plus any number of streamed tool_use blocks.
 */
export class AnthropicStreamTranslator {
  private buf = '';
  private started = false;
  private nextIndex = 0;
  private textIndex: number | null = null;
  private tools = new Map<number, number>(); // openai tool_call index → anthropic block index
  private finishReason: unknown = null;
  private outputTokens = 0;
  private usagePromptTokens: number | null = null;

  constructor(
    private readonly model: string,
    private readonly inputTokens = 0,
  ) {}

  /** The opening Anthropic events (message_start). Emit before any push output. */
  private startEvents(): string {
    this.started = true;
    return sse('message_start', {
      type: 'message_start',
      message: {
        id: anthropicId('msg_'),
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.inputTokens, output_tokens: 0 },
      },
    });
  }

  push(text: string): string {
    this.buf += text;
    let out = '';
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') continue;
      let json: Json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      out += this.consume(json);
    }
    return out;
  }

  private consume(json: Json): string {
    let out = '';
    if (!this.started) out += this.startEvents();
    const choice = json.choices?.[0];
    if (json.usage?.completion_tokens != null) this.outputTokens = json.usage.completion_tokens;
    if (json.usage?.prompt_tokens != null) this.usagePromptTokens = json.usage.prompt_tokens;
    if (!choice) return out;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    const delta = choice.delta ?? {};

    // Text delta → open/continue the text content block (index 0 by convention).
    if (typeof delta.content === 'string' && delta.content.length) {
      if (this.textIndex === null) {
        this.textIndex = this.nextIndex++;
        out += sse('content_block_start', {
          type: 'content_block_start',
          index: this.textIndex,
          content_block: { type: 'text', text: '' },
        });
      }
      out += sse('content_block_delta', {
        type: 'content_block_delta',
        index: this.textIndex,
        delta: { type: 'text_delta', text: delta.content },
      });
    }

    // Tool-call deltas → tool_use blocks with streamed input_json_delta.
    for (const tc of delta.tool_calls ?? []) {
      const oaIdx = typeof tc.index === 'number' ? tc.index : 0;
      let blockIdx = this.tools.get(oaIdx);
      if (blockIdx === undefined) {
        if (this.textIndex !== null) {
          out += sse('content_block_stop', { type: 'content_block_stop', index: this.textIndex });
          this.textIndex = null;
        }
        blockIdx = this.nextIndex++;
        this.tools.set(oaIdx, blockIdx);
        out += sse('content_block_start', {
          type: 'content_block_start',
          index: blockIdx,
          content_block: {
            type: 'tool_use',
            id: tc.id ?? anthropicId('toolu_'),
            name: tc.function?.name ?? '',
            input: {},
          },
        });
      }
      const args = tc.function?.arguments;
      if (typeof args === 'string' && args.length) {
        out += sse('content_block_delta', {
          type: 'content_block_delta',
          index: blockIdx,
          delta: { type: 'input_json_delta', partial_json: args },
        });
      }
    }
    return out;
  }

  /** Closing Anthropic events (stops + message_delta + message_stop). */
  end(): string {
    let out = '';
    if (!this.started) out += this.startEvents();
    if (this.textIndex !== null) {
      out += sse('content_block_stop', { type: 'content_block_stop', index: this.textIndex });
      this.textIndex = null;
    }
    for (const blockIdx of this.tools.values()) {
      out += sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
    }
    out += sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: mapStopReason(this.finishReason), stop_sequence: null },
      usage: { output_tokens: this.outputTokens },
    });
    out += sse('message_stop', { type: 'message_stop' });
    return out;
  }

  /** Token usage for analytics: real prompt tokens from upstream when known. */
  get tokens(): { input: number; output: number } {
    return { input: this.usagePromptTokens ?? this.inputTokens, output: this.outputTokens };
  }
}

/**
 * Extract token usage from an Anthropic response body (single JSON message or an
 * SSE stream). Input tokens come from `message_start`, output tokens from the
 * last `message_delta`/`message` seen. Used to record passthrough usage + cost.
 */
export function extractAnthropicUsage(text: string): {
  promptTokens: number | null;
  completionTokens: number | null;
} {
  let prompt: number | null = null;
  let completion: number | null = null;
  // Try a single JSON object first (non-streaming responses).
  try {
    const obj = JSON.parse(text) as Json;
    const u = obj.usage ?? obj.message?.usage;
    if (u) {
      return {
        promptTokens: u.input_tokens ?? null,
        completionTokens: u.output_tokens ?? null,
      };
    }
  } catch {
    // not a single JSON object → scan SSE lines below
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let obj: Json;
    try {
      obj = JSON.parse(data);
    } catch {
      continue;
    }
    const u = obj.message?.usage ?? obj.usage;
    if (u?.input_tokens != null) prompt = u.input_tokens;
    if (u?.output_tokens != null) completion = u.output_tokens;
  }
  return { promptTokens: prompt, completionTokens: completion };
}
