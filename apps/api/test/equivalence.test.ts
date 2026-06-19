import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { ProviderManager } from '../src/providers/manager';
import { resolveEquivalenceChain } from '../src/providers/overflow';
import type { ProviderConfig } from '../src/providers/types';

function provider(over: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'p',
    type: 'openai',
    name: 'P',
    enabled: true,
    baseUrl: null,
    region: null,
    defaultModel: 'gpt-4o-mini',
    budgetMonthlyUsd: 0,
    authMode: 'api-key',
    credentials: { apiKey: 'sk' },
    ...over,
  };
}

describe('ProviderManager.resolveChain', () => {
  it('returns the group ordered by position, requested model first', () => {
    const pm = new ProviderManager(db);
    // Inject the in-memory equivalents (normally loaded from the DB).
    (pm as unknown as { equivalents: unknown[] }).equivalents = [
      { groupId: 'g1', providerType: 'ollama', providerId: null, model: 'gemma2:27b', position: 0 },
      { groupId: 'g1', providerType: 'xai', providerId: 'x1', model: 'grok-2', position: 1 },
      { groupId: 'g1', providerType: 'openai', providerId: 'o1', model: 'gpt-4o-mini', position: 2 },
      { groupId: 'g2', providerType: 'ollama', providerId: null, model: 'llama3.1', position: 0 },
    ];
    const chain = pm.resolveChain('gemma2:27b');
    expect(chain.map((m) => m.model)).toEqual(['gemma2:27b', 'grok-2', 'gpt-4o-mini']);

    // A request for a non-first member still lists it first, rest by position.
    const fromGrok = pm.resolveChain('grok-2');
    expect(fromGrok[0].model).toBe('grok-2');
    expect(fromGrok.map((m) => m.model).sort()).toEqual(['gemma2:27b', 'gpt-4o-mini', 'grok-2']);

    expect(pm.resolveChain('unknown-model')).toEqual([]);
  });
});

describe('resolveEquivalenceChain', () => {
  const xai = provider({ id: 'x1', type: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai' });
  const openai = provider({ id: 'o1', type: 'openai', name: 'OpenAI' });

  function pmStub(over: Partial<Record<string, unknown>> = {}): ProviderManager {
    const FAMILY = ['openai', 'xai', 'mistral', 'google', 'openai-compatible'];
    return {
      resolveChain: () => [
        { providerType: 'ollama', providerId: null, model: 'gemma2:27b' },
        { providerType: 'xai', providerId: 'x1', model: 'grok-2' },
        { providerType: 'openai', providerId: 'o1', model: 'gpt-4o-mini' },
      ],
      getConfig: (id: string) => (id === 'x1' ? xai : id === 'o1' ? openai : undefined),
      list: () => [xai, openai],
      isOpenAIFamily: (t: string) => FAMILY.includes(t),
      baseUrlFor: (c: ProviderConfig) => c.baseUrl ?? 'https://default',
      overBudget: () => false,
      ...over,
    } as unknown as ProviderManager;
  }

  it('maps the equivalence chain to usable cloud providers, in order, skipping ollama', () => {
    const chain = resolveEquivalenceChain(pmStub(), 'gemma2:27b');
    expect(chain.map((c) => [c.provider.type, c.model])).toEqual([
      ['xai', 'grok-2'],
      ['openai', 'gpt-4o-mini'],
    ]);
  });

  it('skips a member that is over budget', () => {
    const chain = resolveEquivalenceChain(
      pmStub({ overBudget: (c: ProviderConfig) => c.id === 'x1' }),
      'gemma2:27b',
    );
    expect(chain.map((c) => c.model)).toEqual(['gpt-4o-mini']);
  });

  it('is empty when the model has no equivalence group (fallback is the caller’s job)', () => {
    expect(resolveEquivalenceChain(pmStub({ resolveChain: () => [] }), 'whatever')).toHaveLength(0);
  });
});
