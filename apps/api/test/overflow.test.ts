import { describe, expect, it } from 'vitest';
import type { Settings } from '@ai-orchestrator/shared';
import {
  OllamaStreamTranslator,
  isEmbedEndpoint,
  openAIJsonToOllama,
  overflowEnabled,
  overflowSupports,
  parseEmbedInput,
  pickEmbedProvider,
  pickOverflowProvider,
  resolveCloudOverflow,
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
  requestLogMax: 0,
  cloudOverflow: true,
  cloudOverflowProviderId: '',
  cloudOverflowModel: '',
  embedOverflow: false,
  embedOverflowProviderId: '',
  embedOverflowModel: '',
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
    budgetMonthlyUsd: 0,
    authMode: 'api-key',
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
    getConfig: (id: string) => configs.find((c) => c.id === id),
    isOpenAIFamily: (t: string) => OPENAI_FAMILY.includes(t),
    baseUrlFor: (c: ProviderConfig) => c.baseUrl ?? DEFAULT_BASE[c.type] ?? null,
    overBudget: (c: ProviderConfig) => c.budgetMonthlyUsd > 0,
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

  it('skips providers that are over budget (reroutes to the next)', () => {
    const configs = [provider({ id: 'broke', budgetMonthlyUsd: 50 }), provider({ id: 'ok' })];
    expect(pickOverflowProvider(pmStub(configs), BASE_SETTINGS)?.id).toBe('ok');
  });
});

describe('resolveCloudOverflow', () => {
  it('prefers the settings overflow model over the provider default', () => {
    const r = resolveCloudOverflow(pmStub([provider({ id: 'a', defaultModel: 'gpt-4o-mini' })]), {
      ...BASE_SETTINGS,
      cloudOverflowProviderId: 'a',
      cloudOverflowModel: 'gpt-4o',
    });
    expect(r?.model).toBe('gpt-4o');
    expect(r?.provider.id).toBe('a');
  });

  it('falls back to the provider default model when no overflow model is set', () => {
    const r = resolveCloudOverflow(pmStub([provider({ id: 'a', defaultModel: 'gpt-4o-mini' })]), {
      ...BASE_SETTINGS,
      cloudOverflowProviderId: 'a',
    });
    expect(r?.model).toBe('gpt-4o-mini');
  });

  it('works with NO provider default model when an overflow model is set', () => {
    const r = resolveCloudOverflow(pmStub([provider({ id: 'a', defaultModel: null })]), {
      ...BASE_SETTINGS,
      cloudOverflowModel: 'grok-2-latest',
    });
    expect(r?.model).toBe('grok-2-latest');
  });

  it('returns null without a usable provider or any model to send', () => {
    expect(resolveCloudOverflow(pmStub([]), { ...BASE_SETTINGS, cloudOverflowModel: 'x' })).toBeNull();
    expect(
      resolveCloudOverflow(pmStub([provider({ id: 'a', defaultModel: null })]), BASE_SETTINGS),
    ).toBeNull();
  });
});

describe('embedding overflow helpers', () => {
  it('detects embed endpoints', () => {
    expect(isEmbedEndpoint('/api/embed')).toBe(true);
    expect(isEmbedEndpoint('/api/embeddings')).toBe(true);
    expect(isEmbedEndpoint('/api/chat')).toBe(false);
  });

  it('parses the inbound embed input (string, array, legacy prompt)', () => {
    expect(parseEmbedInput('/api/embed', { input: 'hi' })).toBe('hi');
    expect(parseEmbedInput('/api/embed', { input: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(parseEmbedInput('/api/embeddings', { prompt: 'hi' })).toBe('hi');
    expect(parseEmbedInput('/api/embed', {})).toBeNull();
    expect(parseEmbedInput('/api/embed', { input: 123 })).toBeNull();
    expect(parseEmbedInput('/api/embeddings', { input: 'hi' })).toBeNull(); // legacy needs `prompt`
  });

  it('picks the pinned embed provider only when fully configured', () => {
    const ok: Settings = {
      ...BASE_SETTINGS,
      embedOverflowProviderId: 'oa',
      embedOverflowModel: 'text-embedding-3-small',
    };
    expect(pickEmbedProvider(pmStub([provider({ id: 'oa' })]), ok)?.id).toBe('oa');
    expect(pickEmbedProvider(pmStub([provider({ id: 'oa' })]), { ...ok, embedOverflowModel: '' })).toBeNull();
    expect(
      pickEmbedProvider(pmStub([provider({ id: 'oa' })]), { ...ok, embedOverflowProviderId: 'zzz' }),
    ).toBeNull();
    expect(pickEmbedProvider(pmStub([provider({ id: 'oa' })]), BASE_SETTINGS)).toBeNull();
    expect(
      pickEmbedProvider(pmStub([provider({ id: 'oa', budgetMonthlyUsd: 10 })]), ok),
    ).toBeNull(); // over budget
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
