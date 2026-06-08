import { describe, expect, it } from 'vitest';
import {
  AnthropicStreamTranslator,
  anthropicToOpenAI,
  estimateAnthropicTokens,
  extractAnthropicUsage,
  mapStopReason,
  messagesToOpenAI,
  openAIToAnthropic,
} from '../src/anthropic/translate';

/** Parse the `data:` JSON out of an Anthropic SSE blob into typed events. */
function parseSSE(blob: string): { event: string; data: Record<string, unknown> }[] {
  const out: { event: string; data: Record<string, unknown> }[] = [];
  let event = '';
  for (const line of blob.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) out.push({ event, data: JSON.parse(line.slice(5).trim()) });
  }
  return out;
}

describe('anthropic → openai request translation', () => {
  it('maps system, messages, sampling params and stream options', () => {
    const { payload, stream } = anthropicToOpenAI(
      {
        model: 'claude',
        system: 'You are terse.',
        max_tokens: 100,
        temperature: 0.5,
        top_p: 0.9,
        stop_sequences: ['STOP'],
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      },
      'llama3.1',
    );
    expect(stream).toBe(true);
    expect(payload.model).toBe('llama3.1');
    expect(payload.max_tokens).toBe(100);
    expect(payload.temperature).toBe(0.5);
    expect(payload.top_p).toBe(0.9);
    expect(payload.stop).toEqual(['STOP']);
    expect(payload.stream_options).toEqual({ include_usage: true });
    expect(payload.messages).toEqual([
      { role: 'system', content: 'You are terse.' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('translates tools and tool_choice', () => {
    const { payload } = anthropicToOpenAI(
      {
        model: 'claude',
        max_tokens: 50,
        tools: [
          { name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } },
        ],
        tool_choice: { type: 'tool', name: 'get_weather' },
        messages: [{ role: 'user', content: 'weather?' }],
      },
      'qwen',
    );
    expect(payload.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object' },
        },
      },
    ]);
    expect(payload.tool_choice).toEqual({ type: 'function', function: { name: 'get_weather' } });
  });

  it('maps tool_choice any → required and auto → auto', () => {
    const any = anthropicToOpenAI(
      {
        model: 'c',
        max_tokens: 1,
        tools: [{ name: 't' }],
        tool_choice: { type: 'any' },
        messages: [],
      },
      'm',
    );
    expect(any.payload.tool_choice).toBe('required');
    const auto = anthropicToOpenAI(
      {
        model: 'c',
        max_tokens: 1,
        tools: [{ name: 't' }],
        tool_choice: { type: 'auto' },
        messages: [],
      },
      'm',
    );
    expect(auto.payload.tool_choice).toBe('auto');
  });
});

describe('messagesToOpenAI content blocks', () => {
  it('splits assistant tool_use into tool_calls and user tool_result into role:tool', () => {
    const msgs = messagesToOpenAI(
      [
        { role: 'user', content: 'weather in Lisbon?' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check.' },
            { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Lisbon' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '22C sunny' }],
        },
      ],
      undefined,
    );
    expect(msgs[0]).toEqual({ role: 'user', content: 'weather in Lisbon?' });
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: 'Let me check.',
      tool_calls: [
        {
          id: 'toolu_1',
          type: 'function',
          function: { name: 'get_weather', arguments: JSON.stringify({ city: 'Lisbon' }) },
        },
      ],
    });
    expect(msgs[2]).toEqual({ role: 'tool', tool_call_id: 'toolu_1', content: '22C sunny' });
  });

  it('maps an image block to an OpenAI image_url data URL', () => {
    const msgs = messagesToOpenAI(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
      undefined,
    );
    expect(msgs[0].content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });
});

describe('openai → anthropic response translation', () => {
  it('maps text content + usage + stop_reason', () => {
    const msg = openAIToAnthropic(
      {
        choices: [
          { message: { role: 'assistant', content: 'Hello there' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      },
      'claude-x',
    );
    expect(msg.type).toBe('message');
    expect(msg.role).toBe('assistant');
    expect(msg.model).toBe('claude-x');
    expect(msg.content).toEqual([{ type: 'text', text: 'Hello there' }]);
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.usage).toEqual({ input_tokens: 12, output_tokens: 5 });
  });

  it('maps tool_calls into tool_use blocks with parsed input', () => {
    const msg = openAIToAnthropic(
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'get_weather', arguments: '{"city":"Porto"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      'm',
    );
    expect(msg.stop_reason).toBe('tool_use');
    expect(msg.content).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: 'Porto' } },
    ]);
  });

  it('maps finish_reason length → max_tokens', () => {
    expect(mapStopReason('length')).toBe('max_tokens');
    expect(mapStopReason('stop')).toBe('end_turn');
    expect(mapStopReason('tool_calls')).toBe('tool_use');
  });
});

describe('AnthropicStreamTranslator', () => {
  it('emits a well-formed text stream', () => {
    const t = new AnthropicStreamTranslator('claude-x', 10);
    let blob = '';
    blob += t.push('data: {"choices":[{"delta":{"content":"Hel"}}]}\n');
    blob += t.push('data: {"choices":[{"delta":{"content":"lo"}}]}\n');
    blob += t.push(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n',
    );
    blob += t.push('data: [DONE]\n');
    blob += t.end();
    const events = parseSSE(blob);
    const types = events.map((e) => e.event);
    expect(types[0]).toBe('message_start');
    expect(types).toContain('content_block_start');
    expect(types).toContain('content_block_delta');
    expect(types[types.length - 2]).toBe('message_delta');
    expect(types[types.length - 1]).toBe('message_stop');

    const text = events
      .filter((e) => e.event === 'content_block_delta')
      .map((e) => (e.data.delta as { text?: string }).text ?? '')
      .join('');
    expect(text).toBe('Hello');

    const delta = events.find((e) => e.event === 'message_delta')!;
    expect((delta.data.delta as { stop_reason: string }).stop_reason).toBe('end_turn');
    expect((delta.data.usage as { output_tokens: number }).output_tokens).toBe(2);
    expect(t.tokens).toEqual({ input: 10, output: 2 });
  });

  it('streams a tool call as a tool_use block with input_json_delta', () => {
    const t = new AnthropicStreamTranslator('m');
    let blob = '';
    blob += t.push(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n',
    );
    blob += t.push(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]}}]}\n',
    );
    blob += t.push(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Lisbon\\"}"}}]}}]}\n',
    );
    blob += t.push('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n');
    blob += t.end();
    const events = parseSSE(blob);

    const start = events.find((e) => e.event === 'content_block_start')!;
    expect((start.data.content_block as { type: string; name: string }).type).toBe('tool_use');
    expect((start.data.content_block as { name: string }).name).toBe('get_weather');

    const partial = events
      .filter((e) => e.event === 'content_block_delta')
      .map((e) => (e.data.delta as { partial_json?: string }).partial_json ?? '')
      .join('');
    expect(partial).toBe('{"city":"Lisbon"}');

    const delta = events.find((e) => e.event === 'message_delta')!;
    expect((delta.data.delta as { stop_reason: string }).stop_reason).toBe('tool_use');
  });

  it('switches from a text block to a tool block (stops text first)', () => {
    const t = new AnthropicStreamTranslator('m');
    let blob = '';
    blob += t.push('data: {"choices":[{"delta":{"content":"thinking"}}]}\n');
    blob += t.push(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"f"}}]}}]}\n',
    );
    blob += t.end();
    const events = parseSSE(blob).map((e) => e.event);
    // text block opens, then stops, then the tool block opens.
    const firstStart = events.indexOf('content_block_start');
    const firstStop = events.indexOf('content_block_stop');
    const secondStart = events.indexOf('content_block_start', firstStart + 1);
    expect(firstStart).toBeGreaterThanOrEqual(0);
    expect(firstStop).toBeGreaterThan(firstStart);
    expect(secondStart).toBeGreaterThan(firstStop);
  });
});

describe('token helpers', () => {
  it('estimates tokens from message + system text', () => {
    const n = estimateAnthropicTokens({
      system: 'sys',
      messages: [{ role: 'user', content: 'a'.repeat(40) }],
    });
    expect(n).toBeGreaterThan(0);
  });

  it('extracts usage from an anthropic SSE stream', () => {
    const blob =
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":15,"output_tokens":0}}}\n\n' +
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n';
    expect(extractAnthropicUsage(blob)).toEqual({ promptTokens: 15, completionTokens: 7 });
  });

  it('extracts usage from a non-streaming anthropic message', () => {
    const json = JSON.stringify({ usage: { input_tokens: 3, output_tokens: 9 } });
    expect(extractAnthropicUsage(json)).toEqual({ promptTokens: 3, completionTokens: 9 });
  });
});
