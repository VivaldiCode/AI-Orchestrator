import { describe, expect, it } from 'vitest';
import type { Settings } from '@ai-orchestrator/shared';
import {
  OllamaStreamTranslator,
  openAIJsonToOllama,
  overflowEnabled,
  overflowSupports,
  pickOverflowProvider,
  toOpenAIRequest,
} from '../src/providers/overflow';
import type { ProviderManager } from '../src/providers/manager';
import type { ProviderConfig } from '../src/providers/types';

const BASE_SETTINGS: Settings = {
  strategy: 'least-connections',
  modelAware: true,
  contextAware: true,
  autoPull: false,
  failoverRetries: 2,
  triageEnabled: false,
  triageModel: '',
  maxToolCalls: 5,
  cloudOverflow: true,
  cloudOverflowProviderId: '',
  privacyMode: false,
};

function provider(over: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'p1',
    type: 'openai',
    name: 'OpenAI',
    enabled: true,
    baseUrl: null,
    region: null,
    defaultModel: 'gpt-4o-mini',
    credentials: { apiKey: 'sk-test' },
    ...over,
  };
}

const OPENAI_FAMILY = ['openai', 'xai', 'openai-compatible', 'mistral', 'google'];
const DEFAULT_BASE: Record<string, string> = {
  openai: 'https://api.openai.com',
  xai: 'https://api.x.ai',
  mistral: 'https://api.mistral.ai',
};

function pmStub(configs: ProviderConfig[]): ProviderManager {
  return {
    list: () => configs,
    isOpenAIFamily: (t: string) => OPENAI_FAMILY.includes(t),
    baseUrlFor: (c: ProviderConfig) => c.baseUrl ?? DEFAULT_BASE[c.type] ?? null,
  } as unknown as ProviderManager;
}

describe('overflowSupports / overflowEnabled', () => {
  it('only supports chat-style endpoints', () => {
    expect(overflowSupports('/api/chat')).toBe(true);
    expect(overflowSupports('/api/generate')).toBe(true);
    expect(overflowSupports('/v1/chat/completions')).toBe(true);
    expect(overflowSupports('/api/embed')).toBe(false);
    expect(overflowSupports('/api/show')).toBe(false);
  });

  it('respects the master toggle', () => {
    expect(overflowEnabled(BASE_SETTINGS, '/api/chat')).toBe(true);
    expect(overflowEnabled({ ...BASE_SETTINGS, cloudOverflow: false }, '/api/chat')).toBe(false);
    expect(overflowEnabled(BASE_SETTINGS, '/api/embed')).toBe(false);
  });
});

describe('pickOverflowProvider', () => {
  it('picks the first usable OpenAI-compatible provider', () => {
    const configs = [
      provider({ id: 'disabled', enabled: false }),
      provider({ id: 'nokey', credentials: {} }),
      provider({ id: 'nomodel', defaultModel: null }),
      provider({ id: 'anthropic', type: 'anthropic' }),
      provider({ id: 'good' }),
    ];
    const picked = pickOverflowProvider(pmStub(configs), BASE_SETTINGS);
    expect(picked?.id).toBe('good');
  });

  it('honours a pinned provider id, or returns null if unusable', () => {
    const configs = [provider({ id: 'a' }), provider({ id: 'b', defaultModel: 'gpt-4o' })];
    expect(
      pickOverflowProvider(pmStub(configs), { ...BASE_SETTINGS, cloudOverflowProviderId: 'b' })?.id,
    ).toBe('b');
    expect(
      pickOverflowProvider(pmStub(configs), { ...BASE_SETTINGS, cloudOverflowProviderId: 'zzz' }),
    ).toBeNull();
  });

  it('returns null when nothing is usable', () => {
    expect(pickOverflowProvider(pmStub([provider({ enabled: false })]), BASE_SETTINGS)).toBeNull();
  });
});

describe('toOpenAIRequest', () => {
  it('translates /api/chat, mapping options and defaulting to streaming', () => {
    const { payload, stream, format } = toOpenAIRequest(
      '/api/chat',
      {
        model: 'llama3.1',
        messages: [{ role: 'user', content: 'hi' }],
        options: { temperature: 0.5, num_predict: 100 },
      },
      'gpt-4o-mini',
    );
    expect(format).toBe('ollama-chat');
    expect(stream).toBe(true);
    expect(payload.model).toBe('gpt-4o-mini');
    expect(payload.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(payload.temperature).toBe(0.5);
    expect(payload.max_tokens).toBe(100);
    expect(payload.stream_options).toEqual({ include_usage: true });
  });

  it('honours stream:false (no stream_options)', () => {
    const { payload, stream } = toOpenAIRequest('/api/chat', { messages: [], stream: false }, 'm');
    expect(stream).toBe(false);
    expect(payload.stream_options).toBeUndefined();
  });

  it('translates /api/generate into a system+user message pair', () => {
    const { payload, format } = toOpenAIRequest(
      '/api/generate',
      { prompt: 'hello', system: 'be terse' },
      'm',
    );
    expect(format).toBe('ollama-generate');
    expect(payload.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('passes /v1/chat/completions through, rewriting only the model', () => {
    const { payload, stream, format } = toOpenAIRequest(
      '/v1/chat/completions',
      {
        model: 'gpt-x',
        messages: [{ role: 'user', content: 'q' }],
        stream: true,
        temperature: 0.2,
      },
      'gpt-4o-mini',
    );
    expect(format).toBe('openai');
    expect(stream).toBe(true);
    expect(payload.model).toBe('gpt-4o-mini');
    expect(payload.temperature).toBe(0.2);
    expect(payload.stream_options).toEqual({ include_usage: true });
  });
});

describe('OllamaStreamTranslator', () => {
  it('translates an OpenAI SSE chat stream to Ollama NDJSON objects', () => {
    const t = new OllamaStreamTranslator('llama3.1', true);
    const a = t.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n');
    const b = t.push(
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n',
    );
    const done = t.push('data: [DONE]\n');
    expect((a[0].message as { content: string }).content).toBe('Hello');
    expect(a[0].done).toBe(false);
    expect((b[0].message as { content: string }).content).toBe(' world');
    expect(done).toHaveLength(0);
    const fin = t.end();
    expect(fin.done).toBe(true);
    expect(fin.done_reason).toBe('stop');
    expect(fin.prompt_eval_count).toBe(3);
    expect(fin.eval_count).toBe(2);
  });

  it('buffers partial SSE lines across chunks', () => {
    const t = new OllamaStreamTranslator('m', true);
    expect(t.push('data: {"choi')).toHaveLength(0);
    const out = t.push('ces":[{"delta":{"content":"x"}}]}\n');
    expect((out[0].message as { content: string }).content).toBe('x');
  });

  it('uses `response` for generate (non-chat)', () => {
    const t = new OllamaStreamTranslator('m', false);
    const out = t.push('data: {"choices":[{"delta":{"content":"y"}}]}\n');
    expect(out[0].response).toBe('y');
    expect(t.end().response).toBe('');
  });
});

describe('openAIJsonToOllama', () => {
  it('translates a non-streaming chat completion', () => {
    const { body, promptTokens, completionTokens } = openAIJsonToOllama(
      {
        choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      },
      'llama3.1',
      true,
    );
    expect((body.message as { content: string }).content).toBe('Hi');
    expect(body.done).toBe(true);
    expect(body.prompt_eval_count).toBe(5);
    expect(promptTokens).toBe(5);
    expect(completionTokens).toBe(1);
  });

  it('uses `response` for generate', () => {
    const { body } = openAIJsonToOllama({ choices: [{ message: { content: 'Hi' } }] }, 'm', false);
    expect(body.response).toBe('Hi');
  });
});
