import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestArchive } from '../src/archive/index';
import {
  deepSeekBalanceUsd,
  fetchProviderBalance,
  openRouterBalanceUsd,
} from '../src/providers/balance';
import type { ProviderConfig } from '../src/providers/types';

function provider(over: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'p1',
    type: 'openai-compatible',
    name: 'P',
    enabled: true,
    baseUrl: null,
    region: null,
    defaultModel: null,
    budgetMonthlyUsd: 0,
    authMode: 'api-key',
    credentials: { apiKey: 'sk-test' },
    ...over,
  };
}

describe('RequestArchive.listByProvider', () => {
  let dir: string;
  let archive: RequestArchive;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aio-arch-'));
    archive = new RequestArchive({ enabled: true, dir, maxBytes: 0, retentionDays: 0 });
    const base = {
      method: 'POST',
      endpoint: '/v1/chat/completions',
      model: 'm',
      nodeId: null,
      nodeName: null,
      clientIp: null,
      clientKeyId: null,
      status: 200,
      latencyMs: 10,
      promptTokens: 1,
      completionTokens: 1,
      requestHeaders: {},
    };
    await archive.record({ ...base, id: 'a1', at: '2026-06-01T10:00:00.000Z', provider: 'openai' }, 'q1', 'r1');
    await archive.record({ ...base, id: 'a2', at: '2026-06-01T11:00:00.000Z', provider: 'xai' }, 'q2', 'r2');
    await archive.record({ ...base, id: 'a3', at: '2026-06-02T10:00:00.000Z', provider: 'openai' }, 'q3', 'r3');
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns only entries for the requested provider, newest first', async () => {
    const res = await archive.listByProvider('openai', { limit: 10 });
    expect(res.items.map((e) => e.id)).toEqual(['a3', 'a1']);
    expect(res.items.every((e) => e.provider === 'openai')).toBe(true);
  });

  it('respects the limit', async () => {
    const res = await archive.listByProvider('openai', { limit: 1 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('a3');
  });

  it('returns empty for an unknown provider', async () => {
    expect((await archive.listByProvider('nope', { limit: 10 })).items).toHaveLength(0);
  });
});

describe('fetchProviderBalance', () => {
  it('is unavailable without an API key', async () => {
    const b = await fetchProviderBalance(provider({ credentials: {} }), 'https://x');
    expect(b.available).toBe(false);
  });

  it('is unavailable for providers with no balance endpoint', async () => {
    const b = await fetchProviderBalance(provider({ type: 'openai' }), 'https://api.openai.com');
    expect(b.available).toBe(false);
    expect(b.note).toMatch(/balance/i);
  });

  it('parses OpenRouter credits (total − usage)', () => {
    expect(openRouterBalanceUsd({ data: { total_credits: 10, total_usage: 3.5 } })).toBe(6.5);
    expect(openRouterBalanceUsd({ data: {} })).toBeNull();
    expect(openRouterBalanceUsd({})).toBeNull();
  });

  it('parses DeepSeek balance (prefers USD)', () => {
    const j = {
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '70' },
        { currency: 'USD', total_balance: '9.80' },
      ],
    };
    expect(deepSeekBalanceUsd(j)).toEqual({ balanceUsd: 9.8, currency: 'USD' });
    expect(deepSeekBalanceUsd({ balance_infos: [] })).toBeNull();
  });
});
